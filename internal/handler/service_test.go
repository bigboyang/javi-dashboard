package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// handlerFunc wraps a plain http.HandlerFunc so we can call ServeHTTP.
func callHandler(handler http.HandlerFunc, method, target string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

// decodeError unmarshals the standard error envelope from a recorder body.
func decodeError(t *testing.T, rec *httptest.ResponseRecorder) errorResponse {
	t.Helper()
	var e errorResponse
	if err := json.NewDecoder(rec.Body).Decode(&e); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}
	return e
}

// ---------------------------------------------------------------------------
// GetServices — parameter validation
// ---------------------------------------------------------------------------

func TestGetServices_InvalidWindow(t *testing.T) {
	rec := callHandler(GetServices, "GET", "/api/v1/services?window=999h")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
	e := decodeError(t, rec)
	if e.Error == "" {
		t.Error("expected non-empty error message")
	}
}

// ---------------------------------------------------------------------------
// GetREDSeries — parameter validation (no chi URL param needed for bad-window check)
// ---------------------------------------------------------------------------

func TestGetREDSeries_InvalidWindow(t *testing.T) {
	// Without chi routing we inject the service param directly in the URL.
	// The handler reads chi.URLParam, which returns "" for non-chi requests,
	// so we expect a 400 "service name is required" rather than a window error.
	rec := callHandler(GetREDSeries, "GET", "/api/v1/services/svc/red?window=bad")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

// ---------------------------------------------------------------------------
// GetTraces — parameter validation
// ---------------------------------------------------------------------------

func TestGetTraces_InvalidWindow(t *testing.T) {
	rec := callHandler(GetTraces, "GET", "/api/v1/traces?window=bad")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
	e := decodeError(t, rec)
	if e.Error == "" {
		t.Error("expected non-empty error message")
	}
}

func TestGetTraces_LimitZero(t *testing.T) {
	rec := callHandler(GetTraces, "GET", "/api/v1/traces?window=1h&limit=0")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

func TestGetTraces_LimitOver500(t *testing.T) {
	rec := callHandler(GetTraces, "GET", "/api/v1/traces?window=1h&limit=501")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

func TestGetTraces_LimitNonNumeric(t *testing.T) {
	rec := callHandler(GetTraces, "GET", "/api/v1/traces?window=1h&limit=abc")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

// ---------------------------------------------------------------------------
// GetTraceDetail — parameter validation
// ---------------------------------------------------------------------------

func TestGetTraceDetail_EmptyTraceID(t *testing.T) {
	// Without chi routing, URLParam returns "". Handler should respond 400.
	rec := callHandler(GetTraceDetail, "GET", "/api/v1/traces/")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
	e := decodeError(t, rec)
	if e.Error == "" {
		t.Error("expected non-empty error message")
	}
}

// ---------------------------------------------------------------------------
// Content-Type header
// ---------------------------------------------------------------------------

func TestGetTraces_ContentTypeIsJSON(t *testing.T) {
	rec := callHandler(GetTraces, "GET", "/api/v1/traces?window=bad")
	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type=%q, want application/json", ct)
	}
}

// ---------------------------------------------------------------------------
// GetLogs — parameter validation
// ---------------------------------------------------------------------------

func TestGetLogs_InvalidWindow(t *testing.T) {
	rec := callHandler(GetLogs, "GET", "/api/v1/logs?window=bad")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
	e := decodeError(t, rec)
	if e.Error == "" {
		t.Error("expected non-empty error message")
	}
}

func TestGetLogs_LimitZero(t *testing.T) {
	rec := callHandler(GetLogs, "GET", "/api/v1/logs?window=1h&limit=0")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

func TestGetLogs_LimitOver500(t *testing.T) {
	rec := callHandler(GetLogs, "GET", "/api/v1/logs?window=1h&limit=501")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

func TestGetLogs_LimitNonNumeric(t *testing.T) {
	rec := callHandler(GetLogs, "GET", "/api/v1/logs?window=1h&limit=abc")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

func TestGetLogs_SearchTooLong(t *testing.T) {
	long := make([]byte, 201)
	for i := range long {
		long[i] = 'a'
	}
	rec := callHandler(GetLogs, "GET", "/api/v1/logs?window=1h&search="+string(long))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

func TestGetLogs_ContentTypeIsJSON(t *testing.T) {
	rec := callHandler(GetLogs, "GET", "/api/v1/logs?window=bad")
	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type=%q, want application/json", ct)
	}
}

// ---------------------------------------------------------------------------
// GetTopology — parameter validation
// ---------------------------------------------------------------------------

func TestGetTopology_InvalidWindow(t *testing.T) {
	rec := callHandler(GetTopology, "GET", "/api/v1/topology?window=bad")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
	e := decodeError(t, rec)
	if e.Error == "" {
		t.Error("expected non-empty error message")
	}
}

func TestGetTopology_ContentTypeIsJSON(t *testing.T) {
	rec := callHandler(GetTopology, "GET", "/api/v1/topology?window=bad")
	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type=%q, want application/json", ct)
	}
}
