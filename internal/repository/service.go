// Package repository contains ClickHouse query functions for APM data.
// All functions accept a context.Context so callers can enforce request-scoped
// deadlines; none of them open their own connections — they use the package-level
// ch.DB handle established at startup.
package repository

import (
	"context"
	"fmt"
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
//   - duration_ns / 1e6 converts nanoseconds to milliseconds inside ClickHouse,
//     avoiding any floating-point round-trip through Go.
//   - The WHERE clause uses now() - INTERVAL {windowSec} SECOND so ClickHouse
//     can prune partitions that pre-date the window. Binding via query
//     parameters (?) rather than fmt.Sprintf prevents SQL injection for the
//     service name path parameter used in sibling queries.
func ListServices(ctx context.Context, window time.Duration) ([]model.ServiceSummary, error) {
	windowSec := windowSeconds(window)
	winMin := windowMinutes(window)

	// clickhouse-go/v2 uses positional ? placeholders.
	const query = `
SELECT
    service_name,
    count()                                          AS total_requests,
    countIf(status_code = 2)                         AS error_count,
    quantileExact(0.5)(duration_ns / 1e6)            AS p50_ms,
    quantileExact(0.95)(duration_ns / 1e6)           AS p95_ms,
    quantileExact(0.99)(duration_ns / 1e6)           AS p99_ms
FROM apm.spans
WHERE start_time >= now() - INTERVAL ? SECOND
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
//   - toStartOfInterval(start_time, INTERVAL {stepSec} SECOND) is ClickHouse's
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
    toStartOfInterval(start_time, INTERVAL ? SECOND) AS ts,
    count()                                           AS count,
    countIf(status_code = 2)                          AS error_count,
    quantileExact(0.5)(duration_ns / 1e6)             AS p50_ms,
    quantileExact(0.95)(duration_ns / 1e6)            AS p95_ms,
    quantileExact(0.99)(duration_ns / 1e6)            AS p99_ms
FROM apm.spans
WHERE service_name = ?
  AND start_time >= now() - INTERVAL ? SECOND
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
    operation_name,
    count()                                          AS total_requests,
    countIf(status_code = 2)                         AS error_count,
    quantileExact(0.5)(duration_ns / 1e6)            AS p50_ms,
    quantileExact(0.95)(duration_ns / 1e6)           AS p95_ms,
    quantileExact(0.99)(duration_ns / 1e6)           AS p99_ms
FROM apm.spans
WHERE service_name = ?
  AND start_time >= now() - INTERVAL ? SECOND
GROUP BY operation_name
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
