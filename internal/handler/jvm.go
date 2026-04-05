package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// jvm.go proxies JVM analytics endpoints to javi-forecast (/api/jvm/*)
// and Granger causality dependency endpoints (/dependency/*).
// Both services share the same forecastBaseURL / proxyForecast helper
// defined in forecast.go.

// -----------------------------------------------------------------------
// JVM Analytics — GET /api/v1/jvm/*
// -----------------------------------------------------------------------

// GetJVMServices — GET /api/v1/jvm/services
// Proxies to javi-forecast GET /api/jvm/services
// Returns: JSON array of service name strings.
func GetJVMServices(w http.ResponseWriter, r *http.Request) {
	proxyForecast(w, r, "/api/jvm/services")
}

// GetJVMHealth — GET /api/v1/jvm/health/{service}
// Proxies to javi-forecast GET /api/jvm/health/{service_name}
// Returns: latest JvmMetricEvent snapshot for the service.
func GetJVMHealth(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "service")
	if name == "" {
		writeError(w, http.StatusBadRequest, "service name is required")
		return
	}
	proxyForecast(w, r, "/api/jvm/health/"+name)
}

// GetJVMHistory — GET /api/v1/jvm/history/{service}
// Proxies to javi-forecast GET /api/jvm/history/{service_name}
// Query params forwarded: ?window_minutes=60
func GetJVMHistory(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "service")
	if name == "" {
		writeError(w, http.StatusBadRequest, "service name is required")
		return
	}
	proxyForecast(w, r, "/api/jvm/history/"+name)
}

// -----------------------------------------------------------------------
// Granger Causality — GET /api/v1/dependency/*
// -----------------------------------------------------------------------

// GetDependencyGraph — GET /api/v1/dependency/graph
// Proxies to javi-forecast GET /dependency/graph
// Returns: all Granger-causality edges (source, target, p_value, max_lag).
func GetDependencyGraph(w http.ResponseWriter, r *http.Request) {
	proxyForecast(w, r, "/dependency/graph")
}

// GetDependencyCauses — GET /api/v1/dependency/{service}/causes
// Proxies to javi-forecast GET /dependency/{service}/causes
// Returns: root-cause services and upstream edges for the given service.
func GetDependencyCauses(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "service")
	if name == "" {
		writeError(w, http.StatusBadRequest, "service name is required")
		return
	}
	proxyForecast(w, r, "/dependency/"+name+"/causes")
}
