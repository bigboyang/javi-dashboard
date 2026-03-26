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

// TraceSummary is an aggregate view of a distributed trace for the explorer list.
// StatusCode follows OTLP semantics: 0=UNSET, 1=OK, 2=ERROR.
type TraceSummary struct {
	TraceID       string    `json:"trace_id"`
	ServiceName   string    `json:"service_name"`
	RootOperation string    `json:"root_operation"`
	StartTime     time.Time `json:"start_time"`
	DurationMs    float64   `json:"duration_ms"`
	StatusCode    uint8     `json:"status_code"`
	SpanCount     uint64    `json:"span_count"`
}

// TracesResponse is the top-level envelope for GET /api/v1/traces.
type TracesResponse struct {
	Traces []TraceSummary `json:"traces"`
	Window string         `json:"window"`
	Total  int            `json:"total"`
}

// TraceSpan carries the full details of a single span for the trace detail view.
type TraceSpan struct {
	TraceID        string            `json:"trace_id"`
	SpanID         string            `json:"span_id"`
	ParentSpanID   string            `json:"parent_span_id"`
	ServiceName    string            `json:"service_name"`
	Name           string            `json:"name"`
	StartTime      time.Time         `json:"start_time"`
	DurationMs     float64           `json:"duration_ms"`
	StatusCode     uint8             `json:"status_code"`
	HttpMethod     string            `json:"http_method"`
	HttpStatusCode uint16            `json:"http_status_code"`
	Attrs          map[string]string `json:"attrs"`
}

// TraceDetailResponse is the top-level envelope for GET /api/v1/traces/{traceId}.
type TraceDetailResponse struct {
	TraceID string      `json:"trace_id"`
	Spans   []TraceSpan `json:"spans"`
}

// LogEntry holds a single log record received via the OTLP log pipeline.
// SeverityNumber follows OTLP semantics: 1-4=TRACE, 5-8=DEBUG, 9-12=INFO,
// 13-16=WARN, 17-20=ERROR, 21-24=FATAL.
type LogEntry struct {
	TimestampNano  int64             `json:"timestamp_nano"`
	Timestamp      time.Time         `json:"timestamp"`
	ServiceName    string            `json:"service_name"`
	SeverityText   string            `json:"severity_text"`
	SeverityNumber uint8             `json:"severity_number"`
	Body           string            `json:"body"`
	TraceID        string            `json:"trace_id"`
	SpanID         string            `json:"span_id"`
	ResourceAttrs  map[string]string `json:"resource_attrs"`
	LogAttrs       map[string]string `json:"log_attrs"`
}

// LogsResponse is the top-level envelope for GET /api/v1/logs.
type LogsResponse struct {
	Logs   []LogEntry `json:"logs"`
	Window string     `json:"window"`
	Total  int        `json:"total"`
}

// TopologyNode represents a service node in the dependency graph.
// TotalRequests and ErrorCount reflect inbound call volume so node color
// communicates how healthy the service is as a dependency.
type TopologyNode struct {
	Name          string  `json:"name"`
	TotalRequests uint64  `json:"total_requests"`
	ErrorCount    uint64  `json:"error_count"`
	ErrorRate     float64 `json:"error_rate"`
}

// TopologyEdge represents a directed call relationship between two services.
// Caller→Callee means at least one span in Callee had a parent span in Caller.
type TopologyEdge struct {
	Caller     string  `json:"caller"`
	Callee     string  `json:"callee"`
	CallCount  uint64  `json:"call_count"`
	ErrorCount uint64  `json:"error_count"`
	ErrorRate  float64 `json:"error_rate"`
	P95Ms      float64 `json:"p95_ms"`
}

// TopologyResponse is the top-level envelope for GET /api/v1/topology.
type TopologyResponse struct {
	Nodes  []TopologyNode `json:"nodes"`
	Edges  []TopologyEdge `json:"edges"`
	Window string         `json:"window"`
}

// MetricName carries a summary of a single metric instrument within a window.
type MetricName struct {
	Name        string  `json:"name"`
	MetricType  string  `json:"metric_type"`
	ServiceName string  `json:"service_name"`
	DataPoints  uint64  `json:"data_points"`
	LastValue   float64 `json:"last_value"`
	MinValue    float64 `json:"min_value"`
	MaxValue    float64 `json:"max_value"`
}

// MetricNamesResponse is the top-level envelope for GET /api/v1/metrics/names.
type MetricNamesResponse struct {
	Metrics []MetricName `json:"metrics"`
	Window  string       `json:"window"`
	Service string       `json:"service"`
}

// MetricPoint holds aggregated statistics for one time bucket in a series.
type MetricPoint struct {
	Ts    time.Time `json:"ts"`
	Min   float64   `json:"min"`
	Max   float64   `json:"max"`
	Avg   float64   `json:"avg"`
	Count uint64    `json:"count"`
}

// MetricSeriesResponse is the top-level envelope for GET /api/v1/metrics/series.
type MetricSeriesResponse struct {
	MetricName string        `json:"metric_name"`
	MetricType string        `json:"metric_type"`
	Service    string        `json:"service"`
	Window     string        `json:"window"`
	Step       string        `json:"step"`
	Series     []MetricPoint `json:"series"`
}
