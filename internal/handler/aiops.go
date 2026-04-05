package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/kkc/javi-dashboard/internal/ch"
)

// -----------------------------------------------------------------------
// AIOps types
// -----------------------------------------------------------------------

type anomalyRecord struct {
	ID            string    `json:"id"`
	ServiceName   string    `json:"service_name"`
	SpanName      string    `json:"span_name"`
	AnomalyType   string    `json:"anomaly_type"`
	Minute        time.Time `json:"minute"`
	CurrentValue  float64   `json:"current_value"`
	BaselineValue float64   `json:"baseline_value"`
	ZScore        float64   `json:"z_score"`
	Severity      string    `json:"severity"`
	DetectedAt    time.Time `json:"detected_at"`
}

type anomaliesResponse struct {
	Anomalies   []anomalyRecord `json:"anomalies"`
	Window      string          `json:"window"`
	GeneratedAt time.Time       `json:"generated_at"`
}

type rcaReport struct {
	ID               string          `json:"id"`
	AnomalyID        string          `json:"anomaly_id"`
	ServiceName      string          `json:"service_name"`
	SpanName         string          `json:"span_name"`
	AnomalyType      string          `json:"anomaly_type"`
	Minute           time.Time       `json:"minute"`
	Severity         string          `json:"severity"`
	ZScore           float64         `json:"z_score"`
	CorrelatedSpans  json.RawMessage `json:"correlated_spans"`
	SimilarIncidents json.RawMessage `json:"similar_incidents"`
	Hypothesis       string          `json:"hypothesis"`
	LLMAnalysis      string          `json:"llm_analysis"`
	CreatedAt        time.Time       `json:"created_at"`
}

type rcaResponse struct {
	Reports     []rcaReport `json:"reports"`
	Window      string      `json:"window"`
	GeneratedAt time.Time   `json:"generated_at"`
}

// aiopsWindow extracts ?window from the request, defaulting to "1h".
// Returns the raw string and its duration, or writes a 400 and returns false.
func aiopsWindow(w http.ResponseWriter, r *http.Request) (string, time.Duration, bool) {
	raw := r.URL.Query().Get("window")
	if raw == "" {
		raw = "1h"
	}
	m := map[string]time.Duration{
		"5m": 5 * time.Minute, "15m": 15 * time.Minute,
		"1h": time.Hour, "6h": 6 * time.Hour, "24h": 24 * time.Hour,
	}
	dur, ok := m[raw]
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid window: must be one of 5m, 15m, 1h, 6h, 24h")
		return "", 0, false
	}
	return raw, dur, true
}

// -----------------------------------------------------------------------
// GetAIOpsAnomalies — GET /api/v1/aiops/anomalies
// -----------------------------------------------------------------------

// GetAIOpsAnomalies queries apm.anomalies for detected anomalies.
// Query params:
//
//	?window=5m|15m|1h|6h|24h  (default: 1h)
//	?service=<name>            (optional)
//	?severity=warning|critical (optional)
func GetAIOpsAnomalies(w http.ResponseWriter, r *http.Request) {
	rawWin, dur, ok := aiopsWindow(w, r)
	if !ok {
		return
	}

	service := r.URL.Query().Get("service")
	severity := r.URL.Query().Get("severity")
	windowSec := int64(dur.Seconds())

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	query := `
SELECT id, service_name, span_name, anomaly_type, minute,
       current_value, baseline_value, z_score, severity, detected_at
FROM apm.anomalies
WHERE detected_at >= now() - INTERVAL ? SECOND`
	args := []any{windowSec}

	if service != "" {
		query += " AND service_name = ?"
		args = append(args, service)
	}
	if severity != "" {
		query += " AND severity = ?"
		args = append(args, severity)
	}
	query += " ORDER BY detected_at DESC LIMIT 500"

	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query anomalies")
		return
	}
	defer rows.Close()

	anomalies := make([]anomalyRecord, 0)
	for rows.Next() {
		var a anomalyRecord
		if err := rows.Scan(
			&a.ID, &a.ServiceName, &a.SpanName, &a.AnomalyType,
			&a.Minute, &a.CurrentValue, &a.BaselineValue, &a.ZScore,
			&a.Severity, &a.DetectedAt,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan anomaly")
			return
		}
		anomalies = append(anomalies, a)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "anomaly rows error")
		return
	}

	writeJSON(w, http.StatusOK, anomaliesResponse{
		Anomalies:   anomalies,
		Window:      rawWin,
		GeneratedAt: time.Now(),
	})
}

// -----------------------------------------------------------------------
// GetAIOpsRCA — GET /api/v1/aiops/rca
// -----------------------------------------------------------------------

// GetAIOpsRCA queries apm.rca_reports for root cause analysis results.
// Query params:
//
//	?window=5m|15m|1h|6h|24h  (default: 1h)
//	?service=<name>            (optional)
func GetAIOpsRCA(w http.ResponseWriter, r *http.Request) {
	rawWin, dur, ok := aiopsWindow(w, r)
	if !ok {
		return
	}

	service := r.URL.Query().Get("service")
	windowSec := int64(dur.Seconds())

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	query := `
SELECT id, anomaly_id, service_name, span_name, anomaly_type, minute,
       severity, z_score, correlated_spans, similar_incidents,
       hypothesis, llm_analysis, created_at
FROM apm.rca_reports
WHERE created_at >= now() - INTERVAL ? SECOND`
	args := []any{windowSec}

	if service != "" {
		query += " AND service_name = ?"
		args = append(args, service)
	}
	query += " ORDER BY created_at DESC LIMIT 200"

	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query rca reports")
		return
	}
	defer rows.Close()

	reports := make([]rcaReport, 0)
	for rows.Next() {
		var rep rcaReport
		var csStr, siStr string
		if err := rows.Scan(
			&rep.ID, &rep.AnomalyID, &rep.ServiceName, &rep.SpanName, &rep.AnomalyType,
			&rep.Minute, &rep.Severity, &rep.ZScore, &csStr, &siStr,
			&rep.Hypothesis, &rep.LLMAnalysis, &rep.CreatedAt,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan rca report")
			return
		}
		if json.Valid([]byte(csStr)) {
			rep.CorrelatedSpans = json.RawMessage(csStr)
		} else {
			rep.CorrelatedSpans = json.RawMessage("[]")
		}
		if json.Valid([]byte(siStr)) {
			rep.SimilarIncidents = json.RawMessage(siStr)
		} else {
			rep.SimilarIncidents = json.RawMessage("[]")
		}
		reports = append(reports, rep)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "rca rows error")
		return
	}

	writeJSON(w, http.StatusOK, rcaResponse{
		Reports:     reports,
		Window:      rawWin,
		GeneratedAt: time.Now(),
	})
}
