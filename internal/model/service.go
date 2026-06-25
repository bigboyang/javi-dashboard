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
	// Apdex is the Application Performance Index in [0,1], computed against the
	// per-request ApdexThresholdMs: (satisfied + tolerating/2) / total.
	// satisfied = duration ≤ T, tolerating = T < duration ≤ 4T, frustrated = > 4T.
	Apdex float64 `json:"apdex"`
}

// ServicesResponse is the top-level envelope for GET /api/v1/services.
type ServicesResponse struct {
	Services    []ServiceSummary `json:"services"`
	Window      string           `json:"window"`
	GeneratedAt time.Time        `json:"generated_at"`
	// ApdexThresholdMs is the target response time T (milliseconds) used to
	// compute the per-service Apdex score in this response.
	ApdexThresholdMs float64 `json:"apdex_threshold_ms"`
}

// TopMover compares a service's RED metrics between the current window and the
// immediately preceding window of equal length, surfacing how much it changed.
// Positive deltas mean the metric got worse (higher latency/error rate).
type TopMover struct {
	Name           string  `json:"name"`
	CurP95Ms       float64 `json:"cur_p95_ms"`
	PrevP95Ms      float64 `json:"prev_p95_ms"`
	P95DeltaMs     float64 `json:"p95_delta_ms"`
	P95DeltaPct    float64 `json:"p95_delta_pct"` // relative change vs previous, fraction
	CurErrorRate   float64 `json:"cur_error_rate"`
	PrevErrorRate  float64 `json:"prev_error_rate"`
	ErrorRateDelta float64 `json:"error_rate_delta"`
	CurRate        float64 `json:"cur_rate"` // req/min in current window
	PrevRate       float64 `json:"prev_rate"`
	CurRequests    uint64  `json:"cur_requests"`
	PrevRequests   uint64  `json:"prev_requests"`
}

// TopMoversResponse is the top-level envelope for GET /api/v1/top-movers.
type TopMoversResponse struct {
	Movers      []TopMover `json:"movers"`
	Window      string     `json:"window"`
	SortBy      string     `json:"sort_by"`
	GeneratedAt time.Time  `json:"generated_at"`
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
	// SelfMs is the span's exclusive (self) time: its duration minus the summed
	// duration of its direct children. It answers "how much time was spent in
	// this span itself vs. in callees". Clamped at 0 because parallel children
	// can sum past the parent's wall-clock duration.
	SelfMs         float64           `json:"self_ms"`
	// OnCriticalPath marks spans on the trace's dominant path: starting at the
	// root, at each level we follow the child that finishes last (the one gating
	// when its parent's subtree completes). These are the spans to optimize first.
	OnCriticalPath bool              `json:"on_critical_path"`
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

// OutlierItem is one entity (operation / instance / pod) scored against its
// peers. ZScore = (Value - Baseline) / stddev of the peer set; higher means a
// stronger outlier. Baseline is the peer mean. Secondary/ErrorRate carry an
// extra dimension whose meaning depends on the outlier Type.
type OutlierItem struct {
	Label     string  `json:"label"`
	Service   string  `json:"service"`
	Value     float64 `json:"value"`
	Baseline  float64 `json:"baseline"`
	ZScore    float64 `json:"z_score"`
	Count     uint64  `json:"count"`
	ErrorRate float64 `json:"error_rate"`
	Secondary float64 `json:"secondary"`
}

// OutliersResponse is the envelope for the GET /api/v1/outliers/* endpoints.
// Metric/SecondaryMetric label what Value and Secondary mean for this Type so
// the frontend can render generic columns.
type OutliersResponse struct {
	Type            string        `json:"type"`
	Metric          string        `json:"metric"`
	SecondaryMetric string        `json:"secondary_metric"`
	Window          string        `json:"window"`
	Service         string        `json:"service"`
	Items           []OutlierItem `json:"items"`
	GeneratedAt     time.Time     `json:"generated_at"`
}

// HeatmapBucket defines one latency band on the heatmap's Y axis. Bands are
// log2-scaled: band Index covers [2^Index, 2^(Index+1)) milliseconds.
type HeatmapBucket struct {
	Index  int     `json:"index"`
	LowMs  float64 `json:"low_ms"`
	HighMs float64 `json:"high_ms"`
}

// HeatmapCell is one (time-column, latency-band) tile with its span count.
type HeatmapCell struct {
	TsMs   int64  `json:"ts_ms"`
	Bucket int    `json:"bucket"`
	Count  uint64 `json:"count"`
}

// LatencyHeatmapResponse is the top-level envelope for GET /api/v1/metrics/latency-heatmap.
// Columns is the time axis (one entry per step bucket); Buckets is the latency axis.
type LatencyHeatmapResponse struct {
	Service  string          `json:"service"`
	Window   string          `json:"window"`
	Step     string          `json:"step"`
	Columns  []int64         `json:"columns"` // epoch ms, ascending
	Buckets  []HeatmapBucket `json:"buckets"`
	Cells    []HeatmapCell   `json:"cells"`
	MaxCount uint64          `json:"max_count"`
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
