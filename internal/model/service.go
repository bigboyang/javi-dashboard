package model

import "time"

// WindowParam enumerates the allowed query window values.
// Using a named type prevents arbitrary string injection into SQL via window arithmetic.
type WindowParam string

const (
	Window5m  WindowParam = "5m"
	Window15m WindowParam = "15m"
	Window1h  WindowParam = "1h"
	Window6h  WindowParam = "6h"
	Window24h WindowParam = "24h"
)

// ParseWindow converts a raw query string into a validated WindowParam and its
// equivalent time.Duration. Returns false when the value is not in the allow-list,
// so callers can respond with 400 without additional branching.
func ParseWindow(raw string) (WindowParam, time.Duration, bool) {
	switch WindowParam(raw) {
	case Window5m:
		return Window5m, 5 * time.Minute, true
	case Window15m:
		return Window15m, 15 * time.Minute, true
	case Window1h:
		return Window1h, time.Hour, true
	case Window6h:
		return Window6h, 6 * time.Hour, true
	case Window24h:
		return Window24h, 24 * time.Hour, true
	default:
		return Window5m, 5 * time.Minute, false
	}
}

// ParseStep converts a raw step query string into a validated time.Duration.
// Only a fixed set of safe values is accepted to prevent SQL injection via
// interval arithmetic. Returns false when the value is not in the allow-list.
func ParseStep(raw string) (string, time.Duration, bool) {
	switch raw {
	case "1m":
		return "1m", time.Minute, true
	case "5m":
		return "5m", 5 * time.Minute, true
	case "15m":
		return "15m", 15 * time.Minute, true
	case "1h":
		return "1h", time.Hour, true
	default:
		return "", 0, false
	}
}

// ServiceSummary carries the aggregate RED metrics for a single service.
// All duration fields are in milliseconds to match the dashboard contract.
type ServiceSummary struct {
	Name          string  `json:"name"`
	Rate          float64 `json:"rate"`           // requests per minute
	ErrorRate     float64 `json:"error_rate"`     // fraction 0–1
	P50Ms         float64 `json:"p50_ms"`
	P95Ms         float64 `json:"p95_ms"`
	P99Ms         float64 `json:"p99_ms"`
	TotalRequests uint64  `json:"total_requests"`
	ErrorCount    uint64  `json:"error_count"`
}

// ServicesResponse is the top-level envelope for GET /api/v1/services.
type ServicesResponse struct {
	Services    []ServiceSummary `json:"services"`
	Window      string           `json:"window"`
	GeneratedAt time.Time        `json:"generated_at"`
}

// REDPoint holds RED metrics for a single time bucket in a time-series response.
type REDPoint struct {
	Ts        time.Time `json:"ts"`
	Rate      float64   `json:"rate"`       // requests per minute within this bucket
	ErrorRate float64   `json:"error_rate"` // fraction 0–1
	P50Ms     float64   `json:"p50_ms"`
	P95Ms     float64   `json:"p95_ms"`
	P99Ms     float64   `json:"p99_ms"`
	Count     uint64    `json:"count"`
	Errors    uint64    `json:"errors"`
}

// REDSeriesResponse is the top-level envelope for GET /api/v1/services/{service}/red.
type REDSeriesResponse struct {
	Service string     `json:"service"`
	Window  string     `json:"window"`
	Step    string     `json:"step"`
	Series  []REDPoint `json:"series"`
}

// OperationSummary carries the aggregate RED metrics for a single operation
// within a service.
type OperationSummary struct {
	Operation     string  `json:"operation"`
	Rate          float64 `json:"rate"`
	ErrorRate     float64 `json:"error_rate"`
	P50Ms         float64 `json:"p50_ms"`
	P95Ms         float64 `json:"p95_ms"`
	P99Ms         float64 `json:"p99_ms"`
	TotalRequests uint64  `json:"total_requests"`
	ErrorCount    uint64  `json:"error_count"`
}

// OperationsResponse is the top-level envelope for
// GET /api/v1/services/{service}/operations.
type OperationsResponse struct {
	Service    string             `json:"service"`
	Window     string             `json:"window"`
	Operations []OperationSummary `json:"operations"`
}
