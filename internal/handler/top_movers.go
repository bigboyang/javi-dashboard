package handler

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/kkc/javi-dashboard/internal/model"
	"github.com/kkc/javi-dashboard/internal/repository"
)

// GetTopMovers — GET /api/v1/top-movers
// Surfaces the services whose RED metrics changed the most between the current
// window and the immediately preceding window of equal length.
//
// Query params:
//
//	?window=5m|15m|1h|6h|24h  (default: 1h)
//	?sort=latency|errors|throughput  (default: latency)
//	?limit=<n>                (default: 20, max: 100)
//	?min_requests=<n>         (drop low-traffic noise; default: 10)
func GetTopMovers(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("window")
	if raw == "" {
		raw = "1h"
	}
	wp, dur, ok := model.ParseWindow(raw)
	if !ok {
		writeError(w, http.StatusBadRequest,
			"invalid window: must be one of 5m, 15m, 1h, 6h, 24h")
		return
	}

	sortBy := r.URL.Query().Get("sort")
	switch sortBy {
	case "", "latency":
		sortBy = "latency"
	case "errors", "throughput":
		// valid
	default:
		writeError(w, http.StatusBadRequest, "invalid sort: must be latency, errors, or throughput")
		return
	}

	limit := 20
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	minRequests := uint64(10)
	if s := r.URL.Query().Get("min_requests"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 0 {
			minRequests = uint64(n)
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	movers, err := repository.ListTopMovers(ctx, dur)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query top movers")
		return
	}

	// Drop low-traffic services on both sides to avoid ranking noise: a service
	// with 2 requests last window doesn't make a meaningful "mover".
	filtered := movers[:0]
	for _, m := range movers {
		if m.CurRequests >= minRequests || m.PrevRequests >= minRequests {
			filtered = append(filtered, m)
		}
	}
	movers = filtered

	// Rank by the requested dimension, worst (largest positive delta) first.
	switch sortBy {
	case "errors":
		sort.SliceStable(movers, func(i, j int) bool {
			return movers[i].ErrorRateDelta > movers[j].ErrorRateDelta
		})
	case "throughput":
		// Largest absolute throughput swing first (spikes and drops both matter).
		sort.SliceStable(movers, func(i, j int) bool {
			return absF(movers[i].CurRate-movers[i].PrevRate) > absF(movers[j].CurRate-movers[j].PrevRate)
		})
	default: // latency
		sort.SliceStable(movers, func(i, j int) bool {
			return movers[i].P95DeltaMs > movers[j].P95DeltaMs
		})
	}

	if len(movers) > limit {
		movers = movers[:limit]
	}
	if movers == nil {
		movers = []model.TopMover{}
	}

	writeJSON(w, http.StatusOK, model.TopMoversResponse{
		Movers:      movers,
		Window:      string(wp),
		SortBy:      sortBy,
		GeneratedAt: time.Now().UTC(),
	})
}

func absF(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}
