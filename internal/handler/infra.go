package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kkc/javi-dashboard/internal/ch"
)

// podSummary contains aggregated resource usage for one pod over the query window.
type podSummary struct {
	PodName      string  `json:"pod_name"`
	NodeName     string  `json:"node_name"`
	Namespace    string  `json:"namespace"`
	AvgCPUm      float64 `json:"avg_cpu_m"`
	MaxCPUm      float64 `json:"max_cpu_m"`
	CPULimitm    float64 `json:"cpu_limit_m"`
	AvgMemBytes  float64 `json:"avg_mem_bytes"`
	MaxMemBytes  int64   `json:"max_mem_bytes"`
	MemLimitBytes int64  `json:"mem_limit_bytes"`
	LastSeenMs   int64   `json:"last_seen_ms"`
}

type infraPodsResponse struct {
	Service     string       `json:"service"`
	Window      string       `json:"window"`
	Pods        []podSummary `json:"pods"`
	GeneratedAt time.Time    `json:"generated_at"`
}

// podPoint is a single timeseries data point for one pod.
type podPoint struct {
	TimestampMs int64   `json:"ts"`
	CPUm        float64 `json:"cpu_m"`
	MemBytes    int64   `json:"mem_bytes"`
}

type infraTimeseriesResponse struct {
	Service     string     `json:"service"`
	PodName     string     `json:"pod_name"`
	Points      []podPoint `json:"points"`
	GeneratedAt time.Time  `json:"generated_at"`
}

// GetInfraPods — GET /api/v1/infra/pods/{service}
// Returns per-pod resource summary aggregated over the given window.
// Query params:
//
//	?window=1h|6h|24h (default: 1h)
func GetInfraPods(w http.ResponseWriter, r *http.Request) {
	service := chi.URLParam(r, "service")
	if service == "" {
		writeError(w, http.StatusBadRequest, "service name is required")
		return
	}

	rawWin := r.URL.Query().Get("window")
	if rawWin == "" {
		rawWin = "1h"
	}
	winMap := map[string]time.Duration{
		"1h": time.Hour, "6h": 6 * time.Hour, "24h": 24 * time.Hour,
	}
	dur, ok := winMap[rawWin]
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid window: must be one of 1h, 6h, 24h")
		return
	}

	fromMs := time.Now().Add(-dur).UnixMilli()
	toMs := time.Now().UnixMilli()

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	rows, err := ch.DB.Query(ctx, `
SELECT
    pod_name,
    node_name,
    namespace,
    avg(cpu_usage_millicore)   AS avg_cpu_m,
    max(cpu_usage_millicore)   AS max_cpu_m,
    any(cpu_limit_millicore)   AS cpu_limit_m,
    avg(memory_usage_bytes)    AS avg_mem_bytes,
    max(memory_usage_bytes)    AS max_mem_bytes,
    any(memory_limit_bytes)    AS mem_limit_bytes,
    max(timestamp)             AS last_seen
FROM apm.k8s_pod_metrics
WHERE service_name = ?
  AND timestamp >= fromUnixTimestamp64Milli(?)
  AND timestamp <= fromUnixTimestamp64Milli(?)
GROUP BY pod_name, node_name, namespace
ORDER BY pod_name`, service, fromMs, toMs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query pod metrics")
		return
	}
	defer rows.Close()

	pods := make([]podSummary, 0, 16)
	for rows.Next() {
		var p podSummary
		var lastSeen time.Time
		if err := rows.Scan(
			&p.PodName, &p.NodeName, &p.Namespace,
			&p.AvgCPUm, &p.MaxCPUm, &p.CPULimitm,
			&p.AvgMemBytes, &p.MaxMemBytes, &p.MemLimitBytes,
			&lastSeen,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		p.LastSeenMs = lastSeen.UnixMilli()
		pods = append(pods, p)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "row iteration error")
		return
	}

	writeJSON(w, http.StatusOK, infraPodsResponse{
		Service:     service,
		Window:      rawWin,
		Pods:        pods,
		GeneratedAt: time.Now(),
	})
}

// GetInfraTimeseries — GET /api/v1/infra/pods/{service}/timeseries
// Returns CPU+memory time series for a specific pod.
// Query params:
//
//	?pod=<pod_name>   (required)
//	?window=1h|6h|24h (default: 1h)
func GetInfraTimeseries(w http.ResponseWriter, r *http.Request) {
	service := chi.URLParam(r, "service")
	if service == "" {
		writeError(w, http.StatusBadRequest, "service name is required")
		return
	}
	pod := r.URL.Query().Get("pod")
	if pod == "" {
		writeError(w, http.StatusBadRequest, "pod name is required")
		return
	}

	rawWin := r.URL.Query().Get("window")
	if rawWin == "" {
		rawWin = "1h"
	}
	winMap := map[string]time.Duration{
		"1h": time.Hour, "6h": 6 * time.Hour, "24h": 24 * time.Hour,
	}
	dur, ok := winMap[rawWin]
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid window: must be one of 1h, 6h, 24h")
		return
	}

	fromMs := time.Now().Add(-dur).UnixMilli()
	toMs := time.Now().UnixMilli()

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	limit := 500
	rows, err := ch.DB.Query(ctx, `
SELECT
    toUnixTimestamp64Milli(timestamp) AS ts,
    cpu_usage_millicore,
    memory_usage_bytes
FROM apm.k8s_pod_metrics
WHERE service_name = ?
  AND pod_name = ?
  AND timestamp >= fromUnixTimestamp64Milli(?)
  AND timestamp <= fromUnixTimestamp64Milli(?)
ORDER BY timestamp ASC
LIMIT `+strconv.Itoa(limit),
		service, pod, fromMs, toMs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query timeseries")
		return
	}
	defer rows.Close()

	points := make([]podPoint, 0, 128)
	for rows.Next() {
		var pt podPoint
		if err := rows.Scan(&pt.TimestampMs, &pt.CPUm, &pt.MemBytes); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		points = append(points, pt)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "row iteration error")
		return
	}

	writeJSON(w, http.StatusOK, infraTimeseriesResponse{
		Service:     service,
		PodName:     pod,
		Points:      points,
		GeneratedAt: time.Now(),
	})
}
