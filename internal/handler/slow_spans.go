package handler

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/kkc/javi-dashboard/internal/ch"
)

type slowSpan struct {
	TraceID     string            `json:"trace_id"`
	SpanID      string            `json:"span_id"`
	ServiceName string            `json:"service_name"`
	Name        string            `json:"name"`
	DurationMs  int64             `json:"duration_ms"`
	StatusCode  int32             `json:"status_code"`
	StartTimeMs int64             `json:"start_time_ms"`
	Attrs       map[string]string `json:"attrs"`
}

type slowSpansResponse struct {
	Spans       []slowSpan `json:"spans"`
	Window      string     `json:"window"`
	MinMs       int        `json:"min_ms"`
	GeneratedAt time.Time  `json:"generated_at"`
}

// GetSlowSpans — GET /api/v1/spans/slow
// Query params:
//
//	?window=1h|6h|24h|7d  (default: 1h)
//	?service=<name>        (optional)
//	?min_ms=<n>            (default: 200, threshold in ms)
//	?limit=<n>             (default: 50, max: 200)
func GetSlowSpans(w http.ResponseWriter, r *http.Request) {
	rawWin := r.URL.Query().Get("window")
	if rawWin == "" {
		rawWin = "1h"
	}
	winMap := map[string]time.Duration{
		"1h": time.Hour, "6h": 6 * time.Hour,
		"24h": 24 * time.Hour, "7d": 7 * 24 * time.Hour,
	}
	dur, ok := winMap[rawWin]
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid window: must be one of 1h, 6h, 24h, 7d")
		return
	}

	service := r.URL.Query().Get("service")

	minMs := 200
	if s := r.URL.Query().Get("min_ms"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			minMs = n
		}
	}

	limit := 50
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	since := time.Now().Add(-dur)
	sinceDate := since.Format("2006-01-02")

	var whereConds []string
	var args []any
	// dt is a Date column derived from received_at_ms — use for partition pruning
	whereConds = append(whereConds, "dt >= ?")
	args = append(args, sinceDate)
	// duration_ms is Int64 (materialized: (end_time_nano - start_time_nano) / 1_000_000)
	whereConds = append(whereConds, "duration_ms >= ?")
	args = append(args, int64(minMs))
	// Time filter using received_at_ms (Int64 ms) which is more reliable than start_time_nano
	whereConds = append(whereConds, "received_at_ms >= ?")
	args = append(args, since.UnixMilli())
	if service != "" {
		whereConds = append(whereConds, "service_name = ?")
		args = append(args, service)
	}
	where := "WHERE " + strings.Join(whereConds, " AND ")

	query := `
SELECT
    trace_id,
    span_id,
    service_name,
    name,
    duration_ms,
    status_code,
    intDiv(start_time_nano, 1000000) AS start_time_ms,
    attributes
FROM apm.spans
` + where + `
ORDER BY duration_ms DESC
LIMIT ` + strconv.Itoa(limit)

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query slow spans")
		return
	}
	defer rows.Close()

	spans := make([]slowSpan, 0, limit)
	for rows.Next() {
		var s slowSpan
		if err := rows.Scan(
			&s.TraceID, &s.SpanID, &s.ServiceName, &s.Name,
			&s.DurationMs, &s.StatusCode, &s.StartTimeMs, &s.Attrs,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		if s.Attrs == nil {
			s.Attrs = map[string]string{}
		}
		spans = append(spans, s)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "row iteration error")
		return
	}

	writeJSON(w, http.StatusOK, slowSpansResponse{
		Spans:       spans,
		Window:      rawWin,
		MinMs:       minMs,
		GeneratedAt: time.Now(),
	})
}
