package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kkc/javi-dashboard/internal/model"
)

// postHandler sends a POST request with a JSON body to a handler.
func postHandler(handler http.HandlerFunc, target string, body any) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, target, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

// ---------------------------------------------------------------------------
// GetAlertRules
// ---------------------------------------------------------------------------

func TestGetAlertRules_ReturnsJSON(t *testing.T) {
	rec := callHandler(GetAlertRules, "GET", "/api/v1/alerts/rules")
	if rec.Code != http.StatusOK {
		t.Errorf("want 200, got %d", rec.Code)
	}
	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type=%q, want application/json", ct)
	}
	var resp model.AlertRulesResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Rules == nil {
		t.Error("expected non-nil rules slice")
	}
}

// ---------------------------------------------------------------------------
// CreateAlertRule — input validation
// ---------------------------------------------------------------------------

func TestCreateAlertRule_MissingName(t *testing.T) {
	rec := postHandler(CreateAlertRule, "/api/v1/alerts/rules", map[string]any{
		"name":      "",
		"metric":    "error_rate",
		"condition": "gt",
		"threshold": 0.05,
		"window":    "5m",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
	e := decodeError(t, rec)
	if e.Error == "" {
		t.Error("expected non-empty error message")
	}
}

func TestCreateAlertRule_InvalidMetric(t *testing.T) {
	rec := postHandler(CreateAlertRule, "/api/v1/alerts/rules", map[string]any{
		"name":      "test",
		"metric":    "unknown_metric",
		"condition": "gt",
		"threshold": 0.05,
		"window":    "5m",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

func TestCreateAlertRule_InvalidCondition(t *testing.T) {
	rec := postHandler(CreateAlertRule, "/api/v1/alerts/rules", map[string]any{
		"name":      "test",
		"metric":    "error_rate",
		"condition": "gte",
		"threshold": 0.05,
		"window":    "5m",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

func TestCreateAlertRule_NegativeThreshold(t *testing.T) {
	rec := postHandler(CreateAlertRule, "/api/v1/alerts/rules", map[string]any{
		"name":      "test",
		"metric":    "error_rate",
		"condition": "gt",
		"threshold": -1.0,
		"window":    "5m",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

func TestCreateAlertRule_InvalidWindow(t *testing.T) {
	rec := postHandler(CreateAlertRule, "/api/v1/alerts/rules", map[string]any{
		"name":      "test",
		"metric":    "error_rate",
		"condition": "gt",
		"threshold": 0.05,
		"window":    "99h",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

func TestCreateAlertRule_InvalidJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/alerts/rules",
		bytes.NewBufferString("{bad json"))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	CreateAlertRule(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

func TestCreateAlertRule_NameTooLong(t *testing.T) {
	long := make([]byte, 101)
	for i := range long {
		long[i] = 'a'
	}
	rec := postHandler(CreateAlertRule, "/api/v1/alerts/rules", map[string]any{
		"name":      string(long),
		"metric":    "error_rate",
		"condition": "gt",
		"threshold": 0.05,
		"window":    "5m",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
}

func TestCreateAlertRule_Valid(t *testing.T) {
	rec := postHandler(CreateAlertRule, "/api/v1/alerts/rules", map[string]any{
		"name":      "high error rate",
		"service":   "",
		"metric":    "error_rate",
		"condition": "gt",
		"threshold": 0.05,
		"window":    "5m",
	})
	if rec.Code != http.StatusCreated {
		t.Errorf("want 201, got %d: body=%s", rec.Code, rec.Body.String())
	}
	var rule model.AlertRule
	if err := json.NewDecoder(rec.Body).Decode(&rule); err != nil {
		t.Fatalf("failed to decode rule: %v", err)
	}
	if rule.ID == "" {
		t.Error("expected non-empty rule ID")
	}
	if rule.Name != "high error rate" {
		t.Errorf("unexpected rule name: %q", rule.Name)
	}
	if !rule.Enabled {
		t.Error("expected new rule to be enabled")
	}
}

// ---------------------------------------------------------------------------
// DeleteAlertRule — missing ID (without chi router URLParam returns "")
// ---------------------------------------------------------------------------

func TestDeleteAlertRule_EmptyID(t *testing.T) {
	rec := callHandler(DeleteAlertRule, "DELETE", "/api/v1/alerts/rules/")
	if rec.Code != http.StatusBadRequest && rec.Code != http.StatusNotFound {
		t.Errorf("want 400 or 404, got %d", rec.Code)
	}
}

// ---------------------------------------------------------------------------
// GetAlertStatus — parameter validation
// ---------------------------------------------------------------------------

func TestGetAlertStatus_InvalidWindow(t *testing.T) {
	rec := callHandler(GetAlertStatus, "GET", "/api/v1/alerts/status?window=bad")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rec.Code)
	}
	e := decodeError(t, rec)
	if e.Error == "" {
		t.Error("expected non-empty error message")
	}
}

func TestGetAlertStatus_ContentTypeIsJSON(t *testing.T) {
	rec := callHandler(GetAlertStatus, "GET", "/api/v1/alerts/status?window=bad")
	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type=%q, want application/json", ct)
	}
}
