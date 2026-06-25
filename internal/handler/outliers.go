package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/kkc/javi-dashboard/internal/model"
	"github.com/kkc/javi-dashboard/internal/repository"
)

// outlierParams holds the shared query parameters for the outlier endpoints.
type outlierParams struct {
	window model.WindowParam
	dur    time.Duration
	svc    string
	minZ   float64
	limit  int
}

// parseOutlierParams validates the common ?window/?service/?min_z/?limit params.
// On error it writes the HTTP response and returns ok=false.
func parseOutlierParams(w http.ResponseWriter, r *http.Request) (outlierParams, bool) {
	raw := r.URL.Query().Get("window")
	if raw == "" {
		raw = "1h"
	}
	wp, dur, ok := model.ParseWindow(raw)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid window: must be one of 5m, 15m, 1h, 6h, 24h")
		return outlierParams{}, false
	}

	// Default z-score threshold: 2.0 ≈ top ~2.5% of a normal distribution.
	minZ := 2.0
	if s := r.URL.Query().Get("min_z"); s != "" {
		if v, err := strconv.ParseFloat(s, 64); err == nil && v >= 0 {
			minZ = v
		} else {
			writeError(w, http.StatusBadRequest, "invalid min_z: must be a non-negative number")
			return outlierParams{}, false
		}
	}

	limit := 50
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	return outlierParams{
		window: wp,
		dur:    dur,
		svc:    r.URL.Query().Get("service"),
		minZ:   minZ,
		limit:  limit,
	}, true
}

// filterAndCap keeps only above-baseline outliers at or beyond the z threshold,
// then truncates to the limit. Items arrive already sorted by z-score desc.
func filterAndCap(items []model.OutlierItem, minZ float64, limit int) []model.OutlierItem {
	out := items[:0]
	for _, it := range items {
		if it.ZScore >= minZ {
			out = append(out, it)
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	if out == nil {
		out = []model.OutlierItem{}
	}
	return out
}

// GetOperationOutliers — GET /api/v1/outliers/operations
func GetOperationOutliers(w http.ResponseWriter, r *http.Request) {
	p, ok := parseOutlierParams(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	// Require ≥20 requests so a single slow call doesn't masquerade as an outlier.
	items, err := repository.ListOperationOutliers(ctx, p.svc, p.dur, 20)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query operation outliers")
		return
	}

	writeJSON(w, http.StatusOK, model.OutliersResponse{
		Type:            "operation",
		Metric:          "p95 latency (ms)",
		SecondaryMetric: "",
		Window:          string(p.window),
		Service:         p.svc,
		Items:           filterAndCap(items, p.minZ, p.limit),
		GeneratedAt:     time.Now().UTC(),
	})
}

// GetInstanceOutliers — GET /api/v1/outliers/instances
func GetInstanceOutliers(w http.ResponseWriter, r *http.Request) {
	p, ok := parseOutlierParams(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	items, err := repository.ListInstanceOutliers(ctx, p.svc, p.dur, 20)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query instance outliers")
		return
	}

	writeJSON(w, http.StatusOK, model.OutliersResponse{
		Type:            "instance",
		Metric:          "p95 latency (ms)",
		SecondaryMetric: "",
		Window:          string(p.window),
		Service:         p.svc,
		Items:           filterAndCap(items, p.minZ, p.limit),
		GeneratedAt:     time.Now().UTC(),
	})
}

// GetResourceOutliers — GET /api/v1/outliers/resources
func GetResourceOutliers(w http.ResponseWriter, r *http.Request) {
	p, ok := parseOutlierParams(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	items, err := repository.ListResourceOutliers(ctx, p.svc, p.dur)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query resource outliers")
		return
	}

	writeJSON(w, http.StatusOK, model.OutliersResponse{
		Type:            "resource",
		Metric:          "avg CPU (millicores)",
		SecondaryMetric: "avg memory (bytes)",
		Window:          string(p.window),
		Service:         p.svc,
		Items:           filterAndCap(items, p.minZ, p.limit),
		GeneratedAt:     time.Now().UTC(),
	})
}
