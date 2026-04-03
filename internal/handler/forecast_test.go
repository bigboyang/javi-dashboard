package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// resetForecastCache clears the in-memory forecast cache between tests.
func resetForecastCache() {
	forecastCacheMu.Lock()
	forecastCache = map[string]cacheEntry{}
	forecastCacheMu.Unlock()
}

// newForecastUpstream starts a test HTTP server that acts as javi-forecast.
// It records call counts so tests can assert cache behaviour.
func newForecastUpstream(t *testing.T, path, body string, statusCode int) (*httptest.Server, *int) {
	t.Helper()
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != path {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

// ---------------------------------------------------------------------------
// GetForecastRED
// ---------------------------------------------------------------------------

func TestGetForecastRED_UpstreamOK(t *testing.T) {
	resetForecastCache()
	body := `{"services":[],"generated_at":"2026-04-03T00:00:00Z","horizon_hours":24}`
	srv, calls := newForecastUpstream(t, "/api/forecast/red", body, http.StatusOK)

	// Point the handler at the test server.
	orig := forecastBaseURL
	forecastBaseURL = srv.URL
	defer func() { forecastBaseURL = orig }()

	rec := callHandler(GetForecastRED, "GET", "/api/v1/forecast/red")

	if rec.Code != http.StatusOK {
		t.Errorf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type=%q, want application/json", ct)
	}
	if *calls != 1 {
		t.Errorf("expected 1 upstream call, got %d", *calls)
	}
	// Verify cache header
	if rec.Header().Get("X-Cache") != "MISS" {
		t.Errorf("first request should be a MISS, got %q", rec.Header().Get("X-Cache"))
	}
}

func TestGetForecastRED_CacheHit(t *testing.T) {
	resetForecastCache()
	body := `{"services":[],"generated_at":"2026-04-03T00:00:00Z","horizon_hours":24}`
	srv, calls := newForecastUpstream(t, "/api/forecast/red", body, http.StatusOK)

	orig := forecastBaseURL
	forecastBaseURL = srv.URL
	defer func() { forecastBaseURL = orig }()

	// Seed the cache directly.
	forecastCacheMu.Lock()
	forecastCache["/api/forecast/red"] = cacheEntry{
		body:      []byte(body),
		expiresAt: time.Now().Add(forecastTTL),
	}
	forecastCacheMu.Unlock()

	rec := callHandler(GetForecastRED, "GET", "/api/v1/forecast/red")

	if rec.Code != http.StatusOK {
		t.Errorf("want 200, got %d", rec.Code)
	}
	if rec.Header().Get("X-Cache") != "HIT" {
		t.Errorf("expected cache HIT, got %q", rec.Header().Get("X-Cache"))
	}
	if *calls != 0 {
		t.Errorf("cached response should not hit upstream, got %d calls", *calls)
	}
}

func TestGetForecastRED_CacheExpiry(t *testing.T) {
	resetForecastCache()
	body := `{"services":[],"generated_at":"2026-04-03T00:00:00Z","horizon_hours":24}`
	srv, calls := newForecastUpstream(t, "/api/forecast/red", body, http.StatusOK)

	orig := forecastBaseURL
	forecastBaseURL = srv.URL
	defer func() { forecastBaseURL = orig }()

	// Insert an already-expired cache entry.
	forecastCacheMu.Lock()
	forecastCache["/api/forecast/red"] = cacheEntry{
		body:      []byte(body),
		expiresAt: time.Now().Add(-time.Second), // expired
	}
	forecastCacheMu.Unlock()

	rec := callHandler(GetForecastRED, "GET", "/api/v1/forecast/red")

	if rec.Code != http.StatusOK {
		t.Errorf("want 200, got %d", rec.Code)
	}
	if rec.Header().Get("X-Cache") != "MISS" {
		t.Errorf("expired entry should be a MISS, got %q", rec.Header().Get("X-Cache"))
	}
	if *calls != 1 {
		t.Errorf("expected 1 upstream call after expiry, got %d", *calls)
	}
}

func TestGetForecastRED_UpstreamUnavailable(t *testing.T) {
	resetForecastCache()

	orig := forecastBaseURL
	forecastBaseURL = "http://127.0.0.1:0" // nothing listening here
	defer func() { forecastBaseURL = orig }()

	rec := callHandler(GetForecastRED, "GET", "/api/v1/forecast/red")

	if rec.Code != http.StatusBadGateway {
		t.Errorf("want 502, got %d", rec.Code)
	}
	var e errorResponse
	if err := json.NewDecoder(rec.Body).Decode(&e); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}
	if e.Error == "" {
		t.Error("expected non-empty error message")
	}
}

func TestGetForecastRED_UpstreamNonJSON(t *testing.T) {
	resetForecastCache()
	srv, _ := newForecastUpstream(t, "/api/forecast/red", "not-json", http.StatusOK)

	orig := forecastBaseURL
	forecastBaseURL = srv.URL
	defer func() { forecastBaseURL = orig }()

	rec := callHandler(GetForecastRED, "GET", "/api/v1/forecast/red")

	// We still proxy the response — but should NOT cache it.
	if rec.Code != http.StatusOK {
		t.Errorf("want 200 (pass-through), got %d", rec.Code)
	}

	forecastCacheMu.Lock()
	_, cached := forecastCache["/api/forecast/red"]
	forecastCacheMu.Unlock()
	if cached {
		t.Error("non-JSON response should not be cached")
	}
}

// ---------------------------------------------------------------------------
// GetForecastCapacity
// ---------------------------------------------------------------------------

func TestGetForecastCapacity_OK(t *testing.T) {
	resetForecastCache()
	body := `{"metrics":[],"generated_at":"2026-04-03T00:00:00Z","horizon_hours":24}`
	srv, _ := newForecastUpstream(t, "/api/forecast/capacity", body, http.StatusOK)

	orig := forecastBaseURL
	forecastBaseURL = srv.URL
	defer func() { forecastBaseURL = orig }()

	rec := callHandler(GetForecastCapacity, "GET", "/api/v1/forecast/capacity")

	if rec.Code != http.StatusOK {
		t.Errorf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

// ---------------------------------------------------------------------------
// GetForecastAnomalies
// ---------------------------------------------------------------------------

func TestGetForecastAnomalies_OK(t *testing.T) {
	resetForecastCache()
	body := `{"anomalies":[],"generated_at":"2026-04-03T00:00:00Z"}`
	srv, _ := newForecastUpstream(t, "/api/forecast/anomalies", body, http.StatusOK)

	orig := forecastBaseURL
	forecastBaseURL = srv.URL
	defer func() { forecastBaseURL = orig }()

	rec := callHandler(GetForecastAnomalies, "GET", "/api/v1/forecast/anomalies")

	if rec.Code != http.StatusOK {
		t.Errorf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

// ---------------------------------------------------------------------------
// Concurrency: once cache is warm, concurrent goroutines must never hit upstream
// ---------------------------------------------------------------------------

func TestGetForecastRED_ConcurrentCacheHit(t *testing.T) {
	resetForecastCache()
	body := `{"services":[],"generated_at":"2026-04-03T00:00:00Z","horizon_hours":24}`
	srv, calls := newForecastUpstream(t, "/api/forecast/red", body, http.StatusOK)

	orig := forecastBaseURL
	forecastBaseURL = srv.URL
	defer func() { forecastBaseURL = orig }()

	// Warm the cache with a single request first.
	rec0 := callHandler(GetForecastRED, "GET", "/api/v1/forecast/red")
	if rec0.Code != http.StatusOK {
		t.Fatalf("warm-up request failed: %d", rec0.Code)
	}
	callsAfterWarmup := *calls // should be 1

	// Now fire 20 concurrent requests — they must all hit the cache.
	const goroutines = 20
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			req := httptest.NewRequest(http.MethodGet, "/api/v1/forecast/red", nil)
			rec := httptest.NewRecorder()
			GetForecastRED(rec, req)
			if rec.Code != http.StatusOK {
				t.Errorf("concurrent request got %d", rec.Code)
			}
			if rec.Header().Get("X-Cache") != "HIT" {
				t.Errorf("expected HIT on warm cache, got %q", rec.Header().Get("X-Cache"))
			}
		}()
	}
	wg.Wait()

	if *calls != callsAfterWarmup {
		t.Errorf("warm-cache concurrent requests must not hit upstream, got %d extra calls", *calls-callsAfterWarmup)
	}
}
