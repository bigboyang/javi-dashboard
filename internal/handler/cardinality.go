package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/kkc/javi-dashboard/internal/model"
	"github.com/kkc/javi-dashboard/internal/repository"
)

// GetCardinalityKeys — GET /api/v1/cardinality/keys
// Lists the most common span-attribute keys for breakdown selection.
//
// Query params:
//
//	?window=5m|15m|1h|6h|24h  (default: 1h)
//	?service=<name>            (optional)
//	?limit=<n>                 (default: 50, max: 200)
func GetCardinalityKeys(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("window")
	if raw == "" {
		raw = "1h"
	}
	wp, dur, ok := model.ParseWindow(raw)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid window: must be one of 5m, 15m, 1h, 6h, 24h")
		return
	}

	service := r.URL.Query().Get("service")
	limit := 50
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	keys, err := repository.ListCardinalityKeys(ctx, service, dur, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query cardinality keys")
		return
	}
	if keys == nil {
		keys = []model.CardinalityKey{}
	}

	writeJSON(w, http.StatusOK, model.CardinalityKeysResponse{
		Keys:        keys,
		Window:      string(wp),
		Service:     service,
		GeneratedAt: time.Now().UTC(),
	})
}

// GetCardinalityValues — GET /api/v1/cardinality/values
// Breaks down latency/error by the values of one attribute key.
//
// Query params:
//
//	?key=<attribute key>       (required)
//	?window=5m|15m|1h|6h|24h  (default: 1h)
//	?service=<name>            (optional)
//	?limit=<n>                 (default: 50, max: 200)
func GetCardinalityValues(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	if key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	raw := r.URL.Query().Get("window")
	if raw == "" {
		raw = "1h"
	}
	wp, dur, ok := model.ParseWindow(raw)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid window: must be one of 5m, 15m, 1h, 6h, 24h")
		return
	}

	service := r.URL.Query().Get("service")
	limit := 50
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	values, err := repository.ListCardinalityValues(ctx, key, service, dur, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query cardinality values")
		return
	}
	if values == nil {
		values = []model.CardinalityValue{}
	}

	writeJSON(w, http.StatusOK, model.CardinalityValuesResponse{
		Key:         key,
		Values:      values,
		Window:      string(wp),
		Service:     service,
		GeneratedAt: time.Now().UTC(),
	})
}
