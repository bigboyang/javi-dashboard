// Package repository contains ClickHouse query functions for APM data.
// All functions accept a context.Context so callers can enforce request-scoped
// deadlines; none of them open their own connections — they use the package-level
// ch.DB handle established at startup.
package repository

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/kkc/javi-dashboard/internal/ch"
	"github.com/kkc/javi-dashboard/internal/model"
)

// windowSeconds converts a time.Duration to a plain integer number of seconds
// for use inside ClickHouse interval arithmetic. Only values that originate from
// model.ParseWindow reach this function, so the input is always in our allow-list.
func windowSeconds(d time.Duration) int64 {
	return int64(d.Seconds())
}

// windowMinutes converts a time.Duration to a float64 number of minutes used to
// compute the request-rate denominator.
func windowMinutes(d time.Duration) float64 {
	return d.Minutes()
}

// stepSeconds converts a step duration to seconds for toStartOfInterval().
func stepSeconds(d time.Duration) int64 {
	return int64(d.Seconds())
}

// -----------------------------------------------------------------------
// ListServices
// -----------------------------------------------------------------------

// serviceRow is an intermediate scan target that matches the column order
// returned by the aggregate query. We scan into concrete types and then
// convert to the public model to keep the boundary between SQL and Go clear.
type serviceRow struct {
	ServiceName   string
	TotalRequests uint64
	ErrorCount    uint64
	P50Ms         float64
	P95Ms         float64
	P99Ms         float64
}

// ListServices returns aggregate RED metrics for every service that had at
// least one span inside the requested window.
//
// Query design notes:
//   - We use quantileExact rather than quantileTDigest so that small data sets
//     (dev/staging) return accurate values. For very high-volume production
//     deployments, switching to quantileTDigest(0.5/0.95/0.99) reduces memory
//     at the cost of ~1% approximation error.
//   - duration_nano / 1e6 converts nanoseconds to milliseconds inside ClickHouse,
//     avoiding any floating-point round-trip through Go.
//   - start_time_nano is stored as Int64 nanoseconds since epoch; we convert via
//     fromUnixTimestamp64Nano so ClickHouse can apply its DateTime partition pruning.
//   - Binding via query parameters (?) rather than fmt.Sprintf prevents SQL injection.
func ListServices(ctx context.Context, window time.Duration) ([]model.ServiceSummary, error) {
	windowSec := windowSeconds(window)
	winMin := windowMinutes(window)

	// clickhouse-go/v2 uses positional ? placeholders.
	const query = `
SELECT
    service_name,
    count()                                               AS total_requests,
    countIf(status_code = 2)                              AS error_count,
    quantileExact(0.5)(duration_nano / 1e6)               AS p50_ms,
    quantileExact(0.95)(duration_nano / 1e6)              AS p95_ms,
    quantileExact(0.99)(duration_nano / 1e6)              AS p99_ms
FROM apm.spans
WHERE fromUnixTimestamp64Nano(start_time_nano) >= now() - INTERVAL ? SECOND
GROUP BY service_name
ORDER BY total_requests DESC
`
	rows, err := ch.DB.Query(ctx, query, windowSec)
	if err != nil {
		return nil, fmt.Errorf("list services query: %w", err)
	}
	defer rows.Close()

	var results []model.ServiceSummary
	for rows.Next() {
		var r serviceRow
		if err := rows.Scan(
			&r.ServiceName,
			&r.TotalRequests,
			&r.ErrorCount,
			&r.P50Ms,
			&r.P95Ms,
			&r.P99Ms,
		); err != nil {
			return nil, fmt.Errorf("list services scan: %w", err)
		}

		rate := float64(r.TotalRequests) / winMin
		errorRate := 0.0
		if r.TotalRequests > 0 {
			errorRate = float64(r.ErrorCount) / float64(r.TotalRequests)
		}

		results = append(results, model.ServiceSummary{
			Name:          r.ServiceName,
			Rate:          rate,
			ErrorRate:     errorRate,
			P50Ms:         r.P50Ms,
			P95Ms:         r.P95Ms,
			P99Ms:         r.P99Ms,
			TotalRequests: r.TotalRequests,
			ErrorCount:    r.ErrorCount,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list services rows: %w", err)
	}
	return results, nil
}

// -----------------------------------------------------------------------
// GetREDSeries
// -----------------------------------------------------------------------

// redSeriesRow is an intermediate scan target for the time-series query.
type redSeriesRow struct {
	Ts            time.Time
	Count         uint64
	ErrorCount    uint64
	P50Ms         float64
	P95Ms         float64
	P99Ms         float64
}

// GetREDSeries returns time-bucketed RED metrics for a single service.
//
// Query design notes:
//   - toStartOfInterval on a DateTime64 derived from start_time_nano is ClickHouse's
//     native time-bucketing function and is index-friendly.
//   - We fill gaps in the series on the Go side after scanning, which is simpler
//     than a ClickHouse WITH FILL clause and produces consistent JSON even when
//     a step bucket has zero spans.
//   - service_name is bound as a query parameter to prevent injection.
func GetREDSeries(
	ctx context.Context,
	service string,
	window time.Duration,
	step time.Duration,
) ([]model.REDPoint, error) {
	windowSec := windowSeconds(window)
	stepSec := stepSeconds(step)

	const query = `
SELECT
    toStartOfInterval(fromUnixTimestamp64Nano(start_time_nano), INTERVAL ? SECOND) AS ts,
    count()                                                                          AS count,
    countIf(status_code = 2)                                                         AS error_count,
    quantileExact(0.5)(duration_nano / 1e6)                                          AS p50_ms,
    quantileExact(0.95)(duration_nano / 1e6)                                         AS p95_ms,
    quantileExact(0.99)(duration_nano / 1e6)                                         AS p99_ms
FROM apm.spans
WHERE service_name = ?
  AND fromUnixTimestamp64Nano(start_time_nano) >= now() - INTERVAL ? SECOND
GROUP BY ts
ORDER BY ts ASC
`
	rows, err := ch.DB.Query(ctx, query, stepSec, service, windowSec)
	if err != nil {
		return nil, fmt.Errorf("red series query: %w", err)
	}
	defer rows.Close()

	stepMin := step.Minutes()

	// Scan raw rows into a map keyed by bucket timestamp so we can fill gaps.
	buckets := make(map[time.Time]model.REDPoint)
	for rows.Next() {
		var r redSeriesRow
		if err := rows.Scan(
			&r.Ts,
			&r.Count,
			&r.ErrorCount,
			&r.P50Ms,
			&r.P95Ms,
			&r.P99Ms,
		); err != nil {
			return nil, fmt.Errorf("red series scan: %w", err)
		}

		errorRate := 0.0
		if r.Count > 0 {
			errorRate = float64(r.ErrorCount) / float64(r.Count)
		}

		buckets[r.Ts] = model.REDPoint{
			Ts:        r.Ts.UTC(),
			Rate:      float64(r.Count) / stepMin,
			ErrorRate: errorRate,
			P50Ms:     r.P50Ms,
			P95Ms:     r.P95Ms,
			P99Ms:     r.P99Ms,
			Count:     r.Count,
			Errors:    r.ErrorCount,
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("red series rows: %w", err)
	}

	// Build a contiguous series with zero-filled gaps so the dashboard can render
	// a complete line without client-side gap handling.
	seriesLen := int(window / step)
	series := make([]model.REDPoint, 0, seriesLen)

	// Align the start of the series to the step boundary.
	now := time.Now().UTC()
	seriesStart := now.Add(-window).Truncate(step)
	for t := seriesStart; !t.After(now.Truncate(step)); t = t.Add(step) {
		if p, ok := buckets[t]; ok {
			series = append(series, p)
		} else {
			// Zero-fill: a bucket with no data produces explicit zero values so the
			// frontend receives a complete, gap-free series.
			series = append(series, model.REDPoint{Ts: t})
		}
	}
	return series, nil
}

// -----------------------------------------------------------------------
// ListOperations
// -----------------------------------------------------------------------

// operationRow is an intermediate scan target for the top-operations query.
type operationRow struct {
	OperationName string
	TotalRequests uint64
	ErrorCount    uint64
	P50Ms         float64
	P95Ms         float64
	P99Ms         float64
}

// ListOperations returns per-operation aggregate RED metrics for a service,
// ordered by total_requests descending. The result is implicitly limited to the
// top 50 operations to prevent unbounded response sizes; adjust via the LIMIT
// clause if your services have more meaningful operations.
func ListOperations(
	ctx context.Context,
	service string,
	window time.Duration,
) ([]model.OperationSummary, error) {
	windowSec := windowSeconds(window)
	winMin := windowMinutes(window)

	const query = `
SELECT
    name                                                  AS operation_name,
    count()                                               AS total_requests,
    countIf(status_code = 2)                              AS error_count,
    quantileExact(0.5)(duration_nano / 1e6)               AS p50_ms,
    quantileExact(0.95)(duration_nano / 1e6)              AS p95_ms,
    quantileExact(0.99)(duration_nano / 1e6)              AS p99_ms
FROM apm.spans
WHERE service_name = ?
  AND fromUnixTimestamp64Nano(start_time_nano) >= now() - INTERVAL ? SECOND
GROUP BY name
ORDER BY total_requests DESC
LIMIT 50
`
	rows, err := ch.DB.Query(ctx, query, service, windowSec)
	if err != nil {
		return nil, fmt.Errorf("list operations query: %w", err)
	}
	defer rows.Close()

	var results []model.OperationSummary
	for rows.Next() {
		var r operationRow
		if err := rows.Scan(
			&r.OperationName,
			&r.TotalRequests,
			&r.ErrorCount,
			&r.P50Ms,
			&r.P95Ms,
			&r.P99Ms,
		); err != nil {
			return nil, fmt.Errorf("list operations scan: %w", err)
		}

		errorRate := 0.0
		if r.TotalRequests > 0 {
			errorRate = float64(r.ErrorCount) / float64(r.TotalRequests)
		}

		results = append(results, model.OperationSummary{
			Operation:     r.OperationName,
			Rate:          float64(r.TotalRequests) / winMin,
			ErrorRate:     errorRate,
			P50Ms:         r.P50Ms,
			P95Ms:         r.P95Ms,
			P99Ms:         r.P99Ms,
			TotalRequests: r.TotalRequests,
			ErrorCount:    r.ErrorCount,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list operations rows: %w", err)
	}
	return results, nil
}

// -----------------------------------------------------------------------
// ListTraces
// -----------------------------------------------------------------------

// traceSummaryRow is an intermediate scan target for the trace list query.
type traceSummaryRow struct {
	TraceID       string
	ServiceName   string
	RootOperation string
	StartTime     time.Time
	DurationMs    float64
	StatusCode    uint8
	SpanCount     uint64
}

// ListTraces returns recent distributed traces grouped by trace_id. Each row
// reflects the root span's service and operation (the earliest span in the
// trace by start_time_nano), the wall-clock duration of the full trace, the
// worst status code across all spans, and the total span count.
//
// An optional service filter narrows results to traces where the root span
// originated from a given service. Pass "" to return all services.
func ListTraces(
	ctx context.Context,
	service string,
	window time.Duration,
	limit int,
) ([]model.TraceSummary, error) {
	windowSec := windowSeconds(window)

	// Build query with optional service filter using separate query strings to
	// avoid passing an empty string as a ClickHouse parameter for the LowCardinality
	// service_name column, which can produce unexpected type coercions.
	var (
		query string
		args  []any
	)
	if service != "" {
		query = `
SELECT
    trace_id,
    argMin(service_name, start_time_nano)                                           AS service_name,
    argMin(name, start_time_nano)                                                   AS root_operation,
    fromUnixTimestamp64Nano(min(start_time_nano))                                   AS start_time,
    (max(start_time_nano + duration_nano) - min(start_time_nano)) / 1e6             AS duration_ms,
    max(status_code)                                                                AS status_code,
    count()                                                                         AS span_count
FROM apm.spans
WHERE fromUnixTimestamp64Nano(start_time_nano) >= now() - INTERVAL ? SECOND
  AND service_name = ?
GROUP BY trace_id
ORDER BY start_time DESC
LIMIT ?
`
		args = []any{windowSec, service, limit}
	} else {
		query = `
SELECT
    trace_id,
    argMin(service_name, start_time_nano)                                           AS service_name,
    argMin(name, start_time_nano)                                                   AS root_operation,
    fromUnixTimestamp64Nano(min(start_time_nano))                                   AS start_time,
    (max(start_time_nano + duration_nano) - min(start_time_nano)) / 1e6             AS duration_ms,
    max(status_code)                                                                AS status_code,
    count()                                                                         AS span_count
FROM apm.spans
WHERE fromUnixTimestamp64Nano(start_time_nano) >= now() - INTERVAL ? SECOND
GROUP BY trace_id
ORDER BY start_time DESC
LIMIT ?
`
		args = []any{windowSec, limit}
	}

	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list traces query: %w", err)
	}
	defer rows.Close()

	var results []model.TraceSummary
	for rows.Next() {
		var r traceSummaryRow
		if err := rows.Scan(
			&r.TraceID,
			&r.ServiceName,
			&r.RootOperation,
			&r.StartTime,
			&r.DurationMs,
			&r.StatusCode,
			&r.SpanCount,
		); err != nil {
			return nil, fmt.Errorf("list traces scan: %w", err)
		}
		results = append(results, model.TraceSummary{
			TraceID:       r.TraceID,
			ServiceName:   r.ServiceName,
			RootOperation: r.RootOperation,
			StartTime:     r.StartTime.UTC(),
			DurationMs:    r.DurationMs,
			StatusCode:    r.StatusCode,
			SpanCount:     r.SpanCount,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list traces rows: %w", err)
	}
	return results, nil
}

// -----------------------------------------------------------------------
// GetTraceSpans
// -----------------------------------------------------------------------

// traceSpanRow is an intermediate scan target for the trace detail query.
type traceSpanRow struct {
	TraceID        string
	SpanID         string
	ParentSpanID   string
	ServiceName    string
	Name           string
	StartTime      time.Time
	DurationMs     float64
	StatusCode     uint8
	HttpMethod     string
	HttpStatusCode uint16
	Attrs          map[string]string
}

// -----------------------------------------------------------------------
// ListLogs
// -----------------------------------------------------------------------

// logRow is an intermediate scan target for the log list query.
type logRow struct {
	TimestampNano  int64
	ServiceName    string
	SeverityText   string
	SeverityNumber uint8
	Body           string
	TraceID        string
	SpanID         string
	ResourceAttrs  map[string]string
	LogAttrs       map[string]string
}

// ListLogs returns recent log entries filtered by time window, service name,
// severity level, and an optional case-insensitive body search string.
//
// Query design notes:
//   - All user-supplied filter values (service, level, search) are bound as
//     positional ? parameters to prevent SQL injection.
//   - positionCaseInsensitive is ClickHouse's built-in case-insensitive
//     substring search — cheaper than ilike for long body strings.
//   - We build the WHERE clause dynamically but never interpolate user values
//     directly into the query string.
func ListLogs(
	ctx context.Context,
	service string,
	level string,
	search string,
	window time.Duration,
	limit int,
) ([]model.LogEntry, error) {
	windowSec := windowSeconds(window)

	whereExtra := ""
	args := []any{windowSec}

	if service != "" {
		whereExtra += " AND service_name = ?"
		args = append(args, service)
	}
	if level != "" {
		whereExtra += " AND upper(severity_text) = upper(?)"
		args = append(args, level)
	}
	if search != "" {
		whereExtra += " AND positionCaseInsensitive(body, ?) > 0"
		args = append(args, search)
	}
	args = append(args, limit)

	query := `
SELECT
    timestamp_nano,
    service_name,
    severity_text,
    severity_number,
    body,
    trace_id,
    span_id,
    resource_attrs,
    log_attrs
FROM apm.logs
WHERE fromUnixTimestamp64Nano(timestamp_nano) >= now() - INTERVAL ? SECOND` +
		whereExtra + `
ORDER BY timestamp_nano DESC
LIMIT ?
`
	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list logs query: %w", err)
	}
	defer rows.Close()

	var results []model.LogEntry
	for rows.Next() {
		var r logRow
		r.ResourceAttrs = make(map[string]string)
		r.LogAttrs = make(map[string]string)
		if err := rows.Scan(
			&r.TimestampNano,
			&r.ServiceName,
			&r.SeverityText,
			&r.SeverityNumber,
			&r.Body,
			&r.TraceID,
			&r.SpanID,
			&r.ResourceAttrs,
			&r.LogAttrs,
		); err != nil {
			return nil, fmt.Errorf("list logs scan: %w", err)
		}
		results = append(results, model.LogEntry{
			TimestampNano:  r.TimestampNano,
			Timestamp:      time.Unix(0, r.TimestampNano).UTC(),
			ServiceName:    r.ServiceName,
			SeverityText:   r.SeverityText,
			SeverityNumber: r.SeverityNumber,
			Body:           r.Body,
			TraceID:        r.TraceID,
			SpanID:         r.SpanID,
			ResourceAttrs:  r.ResourceAttrs,
			LogAttrs:       r.LogAttrs,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list logs rows: %w", err)
	}
	return results, nil
}

// -----------------------------------------------------------------------
// GetServiceTopology
// -----------------------------------------------------------------------

// topologyEdgeRow is an intermediate scan target for the service dependency query.
type topologyEdgeRow struct {
	Caller     string
	Callee     string
	CallCount  uint64
	ErrorCount uint64
	P95Ms      float64
}

// GetServiceTopology returns the service dependency graph derived from trace span
// parent-child relationships. An edge A→B exists when at least one span in service B
// had a parent span belonging to service A within the requested window.
//
// Query design notes:
//   - We self-join apm.spans on (trace_id, parent_span_id = span_id) to identify
//     cross-service parent-child span pairs. ClickHouse's bloom filter index on
//     trace_id makes this join efficient for recent-window queries.
//   - Only edges where parent.service_name != child.service_name are included;
//     intra-service parent-child spans are not dependency edges.
//   - Node stats are derived from the edge data: a node's TotalRequests reflects
//     inbound call volume (how often it is called as a callee).
func GetServiceTopology(ctx context.Context, window time.Duration) ([]model.TopologyNode, []model.TopologyEdge, error) {
	windowSec := windowSeconds(window)

	const query = `
SELECT
    parent.service_name                                        AS caller,
    child.service_name                                         AS callee,
    count()                                                    AS call_count,
    countIf(child.status_code = 2)                            AS error_count,
    quantileExact(0.95)(child.duration_nano / 1e6)            AS p95_ms
FROM apm.spans AS child
INNER JOIN apm.spans AS parent
    ON child.trace_id     = parent.trace_id
   AND child.parent_span_id = parent.span_id
WHERE fromUnixTimestamp64Nano(child.start_time_nano) >= now() - INTERVAL ? SECOND
  AND parent.service_name != child.service_name
GROUP BY caller, callee
ORDER BY call_count DESC
`
	rows, err := ch.DB.Query(ctx, query, windowSec)
	if err != nil {
		return nil, nil, fmt.Errorf("topology query: %w", err)
	}
	defer rows.Close()

	// Use a map to accumulate per-node inbound stats as we scan edges.
	nodeStats := make(map[string]*model.TopologyNode)

	var edges []model.TopologyEdge
	for rows.Next() {
		var r topologyEdgeRow
		if err := rows.Scan(
			&r.Caller,
			&r.Callee,
			&r.CallCount,
			&r.ErrorCount,
			&r.P95Ms,
		); err != nil {
			return nil, nil, fmt.Errorf("topology scan: %w", err)
		}

		errorRate := 0.0
		if r.CallCount > 0 {
			errorRate = float64(r.ErrorCount) / float64(r.CallCount)
		}
		edges = append(edges, model.TopologyEdge{
			Caller:     r.Caller,
			Callee:     r.Callee,
			CallCount:  r.CallCount,
			ErrorCount: r.ErrorCount,
			ErrorRate:  errorRate,
			P95Ms:      r.P95Ms,
		})

		// Ensure both endpoints appear as nodes.
		if _, ok := nodeStats[r.Caller]; !ok {
			nodeStats[r.Caller] = &model.TopologyNode{Name: r.Caller}
		}
		if _, ok := nodeStats[r.Callee]; !ok {
			nodeStats[r.Callee] = &model.TopologyNode{Name: r.Callee}
		}
		// Accumulate inbound volume on the callee node.
		nodeStats[r.Callee].TotalRequests += r.CallCount
		nodeStats[r.Callee].ErrorCount += r.ErrorCount
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("topology rows: %w", err)
	}

	nodes := make([]model.TopologyNode, 0, len(nodeStats))
	for _, n := range nodeStats {
		if n.TotalRequests > 0 {
			n.ErrorRate = float64(n.ErrorCount) / float64(n.TotalRequests)
		}
		nodes = append(nodes, *n)
	}
	sort.Slice(nodes, func(i, j int) bool { return nodes[i].Name < nodes[j].Name })

	return nodes, edges, nil
}

// GetTraceSpans returns all spans for a given trace ID ordered by start time.
// It includes HTTP semantic convention fields and the full span attribute map
// so the frontend can render a waterfall timeline and attribute details.
func GetTraceSpans(ctx context.Context, traceID string) ([]model.TraceSpan, error) {
	const query = `
SELECT
    trace_id,
    span_id,
    parent_span_id,
    service_name,
    name,
    fromUnixTimestamp64Nano(start_time_nano)    AS start_time,
    duration_nano / 1e6                         AS duration_ms,
    status_code,
    http_method,
    http_status_code,
    span_attrs
FROM apm.spans
WHERE trace_id = ?
ORDER BY start_time_nano ASC
`
	rows, err := ch.DB.Query(ctx, query, traceID)
	if err != nil {
		return nil, fmt.Errorf("get trace spans query: %w", err)
	}
	defer rows.Close()

	var results []model.TraceSpan
	for rows.Next() {
		var r traceSpanRow
		if r.Attrs == nil {
			r.Attrs = make(map[string]string)
		}
		if err := rows.Scan(
			&r.TraceID,
			&r.SpanID,
			&r.ParentSpanID,
			&r.ServiceName,
			&r.Name,
			&r.StartTime,
			&r.DurationMs,
			&r.StatusCode,
			&r.HttpMethod,
			&r.HttpStatusCode,
			&r.Attrs,
		); err != nil {
			return nil, fmt.Errorf("get trace spans scan: %w", err)
		}
		results = append(results, model.TraceSpan{
			TraceID:        r.TraceID,
			SpanID:         r.SpanID,
			ParentSpanID:   r.ParentSpanID,
			ServiceName:    r.ServiceName,
			Name:           r.Name,
			StartTime:      r.StartTime.UTC(),
			DurationMs:     r.DurationMs,
			StatusCode:     r.StatusCode,
			HttpMethod:     r.HttpMethod,
			HttpStatusCode: r.HttpStatusCode,
			Attrs:          r.Attrs,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("get trace spans rows: %w", err)
	}
	return results, nil
}
