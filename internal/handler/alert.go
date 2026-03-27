package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kkc/javi-dashboard/internal/model"
	"github.com/kkc/javi-dashboard/internal/repository"
)

// GetAlertRules handles GET /api/v1/alerts/rules.
func GetAlertRules(w http.ResponseWriter, r *http.Request) {
	rules := repository.ListAlertRules()
	if rules == nil {
		rules = []model.AlertRule{}
	}
	writeJSON(w, http.StatusOK, model.AlertRulesResponse{Rules: rules})
}

// CreateAlertRule handles POST /api/v1/alerts/rules.
func CreateAlertRule(w http.ResponseWriter, r *http.Request) {
	var req model.CreateAlertRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if len(req.Name) > 100 {
		writeError(w, http.StatusBadRequest, "name too long: max 100 characters")
		return
	}

	switch req.Metric {
	case model.AlertMetricErrorRate, model.AlertMetricP95Ms,
		model.AlertMetricP99Ms, model.AlertMetricRate:
	default:
		writeError(w, http.StatusBadRequest,
			"invalid metric: must be one of error_rate, p95_ms, p99_ms, rate")
		return
	}

	switch req.Condition {
	case model.AlertConditionGT, model.AlertConditionLT:
	default:
		writeError(w, http.StatusBadRequest,
			"invalid condition: must be gt or lt")
		return
	}

	if req.Threshold < 0 {
		writeError(w, http.StatusBadRequest, "threshold must be >= 0")
		return
	}

	_, _, ok := model.ParseWindow(req.Window)
	if !ok {
		writeError(w, http.StatusBadRequest,
			"invalid window: must be one of 5m, 15m, 1h, 6h, 24h")
		return
	}

	rule := repository.AddAlertRule(req)
	writeJSON(w, http.StatusCreated, rule)
}

// DeleteAlertRule handles DELETE /api/v1/alerts/rules/{id}.
func DeleteAlertRule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "rule id is required")
		return
	}
	if !repository.RemoveAlertRule(id) {
		writeError(w, http.StatusNotFound, "rule not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetAlertStatus handles GET /api/v1/alerts/status.
// It fetches current service metrics and evaluates all enabled rules in one pass.
func GetAlertStatus(w http.ResponseWriter, r *http.Request) {
	_, dur, ok := windowFromRequest(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	services, err := repository.ListServices(ctx, dur)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query services")
		return
	}

	firing := repository.EvaluateAlerts(services)
	if firing == nil {
		firing = []model.AlertFiring{}
	}

	writeJSON(w, http.StatusOK, model.AlertStatusResponse{
		Firing:      firing,
		EvaluatedAt: time.Now().UTC(),
	})
}
