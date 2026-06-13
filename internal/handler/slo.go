package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kkc/javi-dashboard/internal/ch"
)

type sloDefinition struct {
	ServiceName string  `json:"service_name"`
	SloName     string  `json:"slo_name"`
	WindowHours int32   `json:"window_hours"`
	TargetPct   float64 `json:"target_pct"`
	MetricType  string  `json:"metric_type"`
	ThresholdMs float64 `json:"threshold_ms"`
	UpdatedAt   string  `json:"updated_at"`
}

type sloBurnAlert struct {
	ServiceName string  `json:"service_name"`
	SloName     string  `json:"slo_name"`
	BurnRate    float64 `json:"burn_rate"`
	Window      string  `json:"window"`
	Severity    string  `json:"severity"`
	AlertedAt   string  `json:"alerted_at"`
}

type sloStatusItem struct {
	sloDefinition
	CurrentErrorRate float64   `json:"current_error_rate"`
	Compliant        bool      `json:"compliant"`
	BurnAlerts       []sloBurnAlert `json:"burn_alerts"`
}

// GetSLODefinitions — GET /api/v1/slo/definitions
func GetSLODefinitions(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	rows, err := ch.DB.Query(ctx, `
SELECT service_name, slo_name, window_hours, target_pct, metric_type, threshold_ms,
       formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%SZ')
FROM apm.slo_definitions FINAL
ORDER BY service_name, slo_name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query slo definitions")
		return
	}
	defer rows.Close()

	defs := make([]sloDefinition, 0)
	for rows.Next() {
		var d sloDefinition
		if err := rows.Scan(
			&d.ServiceName, &d.SloName, &d.WindowHours, &d.TargetPct,
			&d.MetricType, &d.ThresholdMs, &d.UpdatedAt,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		defs = append(defs, d)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "row iteration error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"definitions": defs})
}

// CreateSLODefinition — POST /api/v1/slo/definitions
func CreateSLODefinition(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ServiceName string  `json:"service_name"`
		SloName     string  `json:"slo_name"`
		WindowHours int32   `json:"window_hours"`
		TargetPct   float64 `json:"target_pct"`
		MetricType  string  `json:"metric_type"`
		ThresholdMs float64 `json:"threshold_ms"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ServiceName == "" || req.SloName == "" {
		writeError(w, http.StatusBadRequest, "service_name and slo_name are required")
		return
	}
	if req.TargetPct <= 0 || req.TargetPct > 100 {
		writeError(w, http.StatusBadRequest, "target_pct must be between 0 and 100")
		return
	}
	if req.WindowHours <= 0 {
		req.WindowHours = 720
	}
	validMetrics := map[string]bool{"error_rate": true, "latency_p95": true, "latency_p99": true}
	if !validMetrics[req.MetricType] {
		writeError(w, http.StatusBadRequest, "metric_type must be error_rate, latency_p95, or latency_p99")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	err := ch.DB.Exec(ctx, `
INSERT INTO apm.slo_definitions
    (service_name, slo_name, window_hours, target_pct, metric_type, threshold_ms, updated_at)
VALUES (?, ?, ?, ?, ?, ?, now())`,
		req.ServiceName, req.SloName, req.WindowHours, req.TargetPct,
		req.MetricType, req.ThresholdMs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create slo definition")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"status": "created"})
}

// DeleteSLODefinition — DELETE /api/v1/slo/definitions/{service}/{name}
func DeleteSLODefinition(w http.ResponseWriter, r *http.Request) {
	service := chi.URLParam(r, "service")
	name := chi.URLParam(r, "name")
	if service == "" || name == "" {
		writeError(w, http.StatusBadRequest, "service and name are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	err := ch.DB.Exec(ctx,
		`ALTER TABLE apm.slo_definitions DELETE WHERE service_name = ? AND slo_name = ?`,
		service, name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete slo definition")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// GetSLOStatus — GET /api/v1/slo/status
// Returns SLO definitions enriched with current error rate and recent burn alerts
func GetSLOStatus(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	// Fetch all definitions
	rows, err := ch.DB.Query(ctx, `
SELECT service_name, slo_name, window_hours, target_pct, metric_type, threshold_ms,
       formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%SZ')
FROM apm.slo_definitions FINAL
ORDER BY service_name, slo_name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query slo definitions")
		return
	}
	defer rows.Close()

	defs := make([]sloDefinition, 0)
	for rows.Next() {
		var d sloDefinition
		if err := rows.Scan(
			&d.ServiceName, &d.SloName, &d.WindowHours, &d.TargetPct,
			&d.MetricType, &d.ThresholdMs, &d.UpdatedAt,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		defs = append(defs, d)
	}
	rows.Close()

	// Fetch recent burn alerts (last 24h)
	alertRows, err := ch.DB.Query(ctx, `
SELECT service_name, slo_name, burn_rate, window, severity,
       formatDateTime(alerted_at, '%Y-%m-%dT%H:%i:%SZ')
FROM apm.slo_burn_alerts
WHERE alerted_at >= now() - INTERVAL 24 HOUR
ORDER BY alerted_at DESC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query burn alerts")
		return
	}
	defer alertRows.Close()

	alertsByKey := make(map[string][]sloBurnAlert)
	for alertRows.Next() {
		var a sloBurnAlert
		if err := alertRows.Scan(
			&a.ServiceName, &a.SloName, &a.BurnRate, &a.Window, &a.Severity, &a.AlertedAt,
		); err != nil {
			continue
		}
		key := a.ServiceName + "|" + a.SloName
		alertsByKey[key] = append(alertsByKey[key], a)
	}

	// Compute current error rates per service from RED metrics (last 1h)
	errRateRows, err := ch.DB.Query(ctx, `
SELECT
    service_name,
    sum(error_count) / greatest(sum(total_count), 1) AS error_rate
FROM apm.mv_red_1h_state
WHERE dt >= today() - 1
GROUP BY service_name`)
	if err == nil {
		defer errRateRows.Close()
	}

	errorRates := make(map[string]float64)
	if err == nil {
		for errRateRows.Next() {
			var svc string
			var rate float64
			if errRateRows.Scan(&svc, &rate) == nil {
				errorRates[svc] = rate
			}
		}
	}

	// Build status items
	items := make([]sloStatusItem, 0, len(defs))
	for _, d := range defs {
		key := d.ServiceName + "|" + d.SloName
		currentErrRate := errorRates[d.ServiceName]
		compliant := true
		if d.MetricType == "error_rate" {
			errorBudget := 1.0 - d.TargetPct/100.0
			compliant = currentErrRate <= errorBudget
		}
		alerts := alertsByKey[key]
		if alerts == nil {
			alerts = []sloBurnAlert{}
		}
		items = append(items, sloStatusItem{
			sloDefinition:    d,
			CurrentErrorRate: currentErrRate,
			Compliant:        compliant,
			BurnAlerts:       alerts,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items":        items,
		"generated_at": time.Now(),
	})
}
