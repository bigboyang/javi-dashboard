package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// forecastBaseURL is the javi-forecast service address.
// Override via FORECAST_URL env var (default: http://localhost:8001).
var forecastBaseURL = func() string {
	if v := os.Getenv("FORECAST_URL"); v != "" {
		return v
	}
	return "http://localhost:8001"
}()

// cacheEntry holds a cached forecast response with an expiry timestamp.
type cacheEntry struct {
	body      []byte
	expiresAt time.Time
}

var (
	forecastCache   = map[string]cacheEntry{}
	forecastCacheMu sync.Mutex
	forecastTTL     = 60 * time.Second
)

// proxyForecast fetches the given javi-forecast path, serves the response with
// a 60-second in-memory cache, and writes errors as JSON.
func proxyForecast(w http.ResponseWriter, r *http.Request, path string) {
	forecastCacheMu.Lock()
	if entry, ok := forecastCache[path]; ok && time.Now().Before(entry.expiresAt) {
		body := entry.body
		forecastCacheMu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
		return
	}
	forecastCacheMu.Unlock()

	url := forecastBaseURL + path
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, url, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "forecast request error")
		return
	}
	// Forward query string (e.g., ?metric=all, ?severity=warn)
	req.URL.RawQuery = r.URL.RawQuery

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, "forecast service unavailable")
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read forecast response")
		return
	}

	// Validate that upstream returned JSON before caching.
	if resp.StatusCode == http.StatusOK && json.Valid(body) {
		forecastCacheMu.Lock()
		forecastCache[path] = cacheEntry{body: body, expiresAt: time.Now().Add(forecastTTL)}
		forecastCacheMu.Unlock()
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Cache", "MISS")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(body)
}

// -----------------------------------------------------------------------
// GetForecastRED — GET /api/v1/forecast/red
// -----------------------------------------------------------------------

// GetForecastRED proxies to javi-forecast /api/forecast/red.
// Returns forecast time-series for all services (rate, error_rate, p95_ms).
func GetForecastRED(w http.ResponseWriter, r *http.Request) {
	proxyForecast(w, r, "/api/forecast/red")
}

// -----------------------------------------------------------------------
// GetForecastService — GET /api/v1/forecast/service/{name}
// -----------------------------------------------------------------------

// GetForecastService proxies to javi-forecast /api/forecast/service/{name}.
// Query params are forwarded (e.g., ?metric=all).
func GetForecastService(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if name == "" {
		writeError(w, http.StatusBadRequest, "service name is required")
		return
	}
	proxyForecast(w, r, "/api/forecast/service/"+name)
}

// -----------------------------------------------------------------------
// GetForecastCapacity — GET /api/v1/forecast/capacity
// -----------------------------------------------------------------------

// GetForecastCapacity proxies to javi-forecast /api/forecast/capacity.
// Returns capacity headroom predictions (CPU, memory, request rate).
func GetForecastCapacity(w http.ResponseWriter, r *http.Request) {
	proxyForecast(w, r, "/api/forecast/capacity")
}

// -----------------------------------------------------------------------
// GetForecastAnomalies — GET /api/v1/forecast/anomalies
// -----------------------------------------------------------------------

// GetForecastAnomalies proxies to javi-forecast /api/forecast/anomalies.
// Query params forwarded: ?severity=warn|critical
func GetForecastAnomalies(w http.ResponseWriter, r *http.Request) {
	proxyForecast(w, r, "/api/forecast/anomalies")
}
