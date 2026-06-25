package handler

import (
	"context"
	"net/http"
	"sort"
	"time"

	"github.com/kkc/javi-dashboard/internal/model"
	"github.com/kkc/javi-dashboard/internal/repository"
)

// alignedSpan carries a span plus its computed operation-path key and depth.
type alignedSpan struct {
	pathKey string
	depth   int
	span    model.TraceSpan
}

// buildPaths assigns each span a stable path key derived from the chain of
// operation names from the root. Same-named siblings are disambiguated by their
// occurrence index so two structurally-identical traces align cleanly. Returns
// the spans in tree (DFS) order.
func buildPaths(spans []model.TraceSpan) []alignedSpan {
	bySpanID := make(map[string]model.TraceSpan, len(spans))
	children := make(map[string][]model.TraceSpan, len(spans))
	for _, s := range spans {
		bySpanID[s.SpanID] = s
	}
	for _, s := range spans {
		if _, hasParent := bySpanID[s.ParentSpanID]; s.ParentSpanID != "" && hasParent {
			children[s.ParentSpanID] = append(children[s.ParentSpanID], s)
		}
	}
	// Order siblings by start time so occurrence indices are deterministic.
	for pid := range children {
		kids := children[pid]
		sort.SliceStable(kids, func(i, j int) bool { return kids[i].StartTime.Before(kids[j].StartTime) })
		children[pid] = kids
	}

	var out []alignedSpan
	var walk func(s model.TraceSpan, parentPath string, depth int)
	walk = func(s model.TraceSpan, parentPath string, depth int) {
		// Index among same-named siblings for stable disambiguation.
		path := parentPath + "/" + s.Name
		out = append(out, alignedSpan{pathKey: path, depth: depth, span: s})
		// Disambiguate same-named siblings by occurrence index so identical
		// subtrees in the two traces line up on the same path key.
		kids := children[s.SpanID]
		nameSeen := make(map[string]int)
		for _, k := range kids {
			idx := nameSeen[k.Name]
			nameSeen[k.Name]++
			walk(k, path+"["+itoa(idx)+"]", depth+1)
		}
	}

	// Roots: spans with no in-trace parent, ordered by start time.
	var roots []model.TraceSpan
	for _, s := range spans {
		if _, hasParent := bySpanID[s.ParentSpanID]; s.ParentSpanID == "" || !hasParent {
			roots = append(roots, s)
		}
	}
	sort.SliceStable(roots, func(i, j int) bool { return roots[i].StartTime.Before(roots[j].StartTime) })
	for _, r := range roots {
		walk(r, "", 0)
	}
	return out
}

// itoa is a tiny non-allocating-ish int to string for path keys.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// GetTraceCompare — GET /api/v1/traces/compare?a=<traceA>&b=<traceB>
// Aligns two traces by operation path and reports per-node duration deltas.
func GetTraceCompare(w http.ResponseWriter, r *http.Request) {
	traceA := r.URL.Query().Get("a")
	traceB := r.URL.Query().Get("b")
	if traceA == "" || traceB == "" {
		writeError(w, http.StatusBadRequest, "both 'a' and 'b' trace IDs are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	spansA, err := repository.GetTraceSpans(ctx, traceA)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query trace A")
		return
	}
	spansB, err := repository.GetTraceSpans(ctx, traceB)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query trace B")
		return
	}

	pathsA := buildPaths(spansA)
	pathsB := buildPaths(spansB)

	byKeyB := make(map[string]alignedSpan, len(pathsB))
	for _, p := range pathsB {
		// First occurrence wins if a key somehow repeats.
		if _, ok := byKeyB[p.pathKey]; !ok {
			byKeyB[p.pathKey] = p
		}
	}

	nodes := make([]model.TraceCompareNode, 0, len(pathsA)+len(pathsB))
	seen := make(map[string]bool)

	// Matched + A-only nodes, in A's tree order.
	for _, a := range pathsA {
		seen[a.pathKey] = true
		n := model.TraceCompareNode{
			PathKey:   a.pathKey,
			Operation: a.span.Name,
			Service:   a.span.ServiceName,
			Depth:     a.depth,
			PresentA:  true,
			DurationA: a.span.DurationMs,
			SelfA:     a.span.SelfMs,
		}
		if b, ok := byKeyB[a.pathKey]; ok {
			n.PresentB = true
			n.DurationB = b.span.DurationMs
			n.SelfB = b.span.SelfMs
			n.DeltaMs = b.span.DurationMs - a.span.DurationMs
		}
		nodes = append(nodes, n)
	}
	// B-only nodes appended at the end.
	for _, b := range pathsB {
		if seen[b.pathKey] {
			continue
		}
		nodes = append(nodes, model.TraceCompareNode{
			PathKey:   b.pathKey,
			Operation: b.span.Name,
			Service:   b.span.ServiceName,
			Depth:     b.depth,
			PresentB:  true,
			DurationB: b.span.DurationMs,
			SelfB:     b.span.SelfMs,
		})
	}

	writeJSON(w, http.StatusOK, model.TraceCompareResponse{
		TraceA: traceA,
		TraceB: traceB,
		TotalA: traceTotalMs(spansA),
		TotalB: traceTotalMs(spansB),
		Nodes:  nodes,
	})
}

// traceTotalMs is the wall-clock span of a trace: latest end minus earliest start.
func traceTotalMs(spans []model.TraceSpan) float64 {
	if len(spans) == 0 {
		return 0
	}
	minStart := spans[0].StartTime
	maxEnd := spans[0].StartTime.Add(time.Duration(spans[0].DurationMs * float64(time.Millisecond)))
	for _, s := range spans[1:] {
		if s.StartTime.Before(minStart) {
			minStart = s.StartTime
		}
		end := s.StartTime.Add(time.Duration(s.DurationMs * float64(time.Millisecond)))
		if end.After(maxEnd) {
			maxEnd = end
		}
	}
	return float64(maxEnd.Sub(minStart)) / float64(time.Millisecond)
}
