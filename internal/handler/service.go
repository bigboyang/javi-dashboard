package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kkc/javi-dashboard/internal/model"
	"github.com/kkc/javi-dashboard/internal/repository"
)

// queryTimeout is the maximum time we allow for a single dashboard query.
// ClickHouse aggregate queries over recent data are typically sub-second, so 10s
// provides a generous safety margin without letting a slow query stall the HTTP
// worker pool indefinitely.
const queryTimeout = 10 * time.Second

// writeJSON serializes v to JSON and writes it with the given HTTP status code.
// Callers that pass a non-200 status should not write the body separately.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// Encoding errors after WriteHeader are unrecoverable — log them if you add a
	// logger to the handler struct, but don't attempt a second WriteHeader call.
	_ = json.NewEncoder(w).Encode(v)
}

// errorResponse is the standard error envelope for all handler error paths.
type errorResponse struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorResponse{Error: msg})
}

// windowFromRequest extracts and validates the ?window= query parameter.
// When the parameter is absent it defaults to "5m". An invalid value produces a
// 400 response and returns false.
func windowFromRequest(w http.ResponseWriter, r *http.Request) (model.WindowParam, time.Duration, bool) {
	raw := r.URL.Query().Get("window")
	if raw == "" {
		raw = "5m"
	}
	wp, dur, ok := model.ParseWindow(raw)
	if !ok {
		writeError(w, http.StatusBadRequest,
			"invalid window: must be one of 5m, 15m, 1h, 6h, 24h")
		return "", 0, false
	}
	return wp, dur, true
}

// -----------------------------------------------------------------------
// GetServices — GET /api/v1/services
// -----------------------------------------------------------------------

// GetServices handles GET /api/v1/services.
// Query params:
//
//	?window=5m|15m|1h|6h|24h  (default: 5m)
func GetServices(w http.ResponseWriter, r *http.Request) {
	wp, dur, ok := windowFromRequest(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	services, err := repository.ListServices(ctx, dur)
	if err != nil {
		// Do not leak internal ClickHouse error messages to the client.
		writeError(w, http.StatusInternalServerError, "failed to query services")
		return
	}

	// Return an empty slice rather than JSON null when there are no services so
	// the frontend can always iterate without a nil-check.
	if services == nil {
		services = []model.ServiceSummary{}
	}

	writeJSON(w, http.StatusOK, model.ServicesResponse{
		Services:    services,
		Window:      string(wp),
		GeneratedAt: time.Now().UTC(),
	})
}

// -----------------------------------------------------------------------
// GetREDSeries — GET /api/v1/services/{service}/red
// -----------------------------------------------------------------------

// GetREDSeries handles GET /api/v1/services/{service}/red.
// Query params:
//
//	?window=5m|15m|1h|6h|24h  (default: 5m)
//	?step=1m|5m|15m|1h         (default: 1m)
//
// The step must be smaller than the window; if it is equal to or larger we
// return 400 rather than a single-bucket response that would confuse a line chart.
func GetREDSeries(w http.ResponseWriter, r *http.Request) {
	service := chi.URLParam(r, "service")
	if service == "" {
		writeError(w, http.StatusBadRequest, "service name is required")
		return
	}

	wp, windowDur, ok := windowFromRequest(w, r)
	if !ok {
		return
	}

	rawStep := r.URL.Query().Get("step")
	if rawStep == "" {
		rawStep = "1m"
	}
	stepLabel, stepDur, ok := model.ParseStep(rawStep)
	if !ok {
		writeError(w, http.StatusBadRequest,
			"invalid step: must be one of 1m, 5m, 15m, 1h")
		return
	}

	if stepDur >= windowDur {
		writeError(w, http.StatusBadRequest,
			"step must be smaller than window")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	series, err := repository.GetREDSeries(ctx, service, windowDur, stepDur)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query RED series")
		return
	}

	if series == nil {
		series = []model.REDPoint{}
	}

	writeJSON(w, http.StatusOK, model.REDSeriesResponse{
		Service: service,
		Window:  string(wp),
		Step:    stepLabel,
		Series:  series,
	})
}

// -----------------------------------------------------------------------
// GetOperations — GET /api/v1/services/{service}/operations
// -----------------------------------------------------------------------

// GetOperations handles GET /api/v1/services/{service}/operations.
// Query params:
//
//	?window=5m|15m|1h|6h|24h  (default: 5m)
func GetOperations(w http.ResponseWriter, r *http.Request) {
	service := chi.URLParam(r, "service")
	if service == "" {
		writeError(w, http.StatusBadRequest, "service name is required")
		return
	}

	wp, dur, ok := windowFromRequest(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	ops, err := repository.ListOperations(ctx, service, dur)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query operations")
		return
	}

	if ops == nil {
		ops = []model.OperationSummary{}
	}

	writeJSON(w, http.StatusOK, model.OperationsResponse{
		Service:    service,
		Window:     string(wp),
		Operations: ops,
	})
}
