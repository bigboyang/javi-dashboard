package repository

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/kkc/javi-dashboard/internal/ch"
	"github.com/kkc/javi-dashboard/internal/model"
)

// minOutlierPeers is the smallest peer-group size for which a z-score is
// statistically meaningful. Services with fewer peers (e.g. one operation, one
// pod) are excluded from outlier results because a stddev over 1–2 samples is
// noise, not signal.
const minOutlierPeers = 3

// rawGroup is a per-entity aggregate before peer scoring.
type rawGroup struct {
	service   string
	label     string
	value     float64 // the metric being scored (e.g. p95 ms, cpu millicores)
	count     uint64  // sample size (requests / datapoints)
	errorRate float64 // 0 when not applicable
	secondary float64 // extra dimension (e.g. memory bytes); 0 when N/A
}

// scoreOutliers computes a per-service z-score for each group: peers are the
// other groups in the same service. Groups in services with fewer than
// minOutlierPeers peers are dropped (cannot be scored reliably). The result is
// sorted by z-score descending so the strongest outliers come first.
func scoreOutliers(raw []rawGroup) []model.OutlierItem {
	bySvc := make(map[string][]rawGroup)
	for _, g := range raw {
		bySvc[g.service] = append(bySvc[g.service], g)
	}

	items := make([]model.OutlierItem, 0, len(raw))
	for svc, groups := range bySvc {
		if len(groups) < minOutlierPeers {
			continue
		}
		// Peer mean and population stddev of the scored value.
		var sum float64
		for _, g := range groups {
			sum += g.value
		}
		mean := sum / float64(len(groups))
		var variance float64
		for _, g := range groups {
			d := g.value - mean
			variance += d * d
		}
		variance /= float64(len(groups))
		stddev := math.Sqrt(variance)

		for _, g := range groups {
			z := 0.0
			if stddev > 0 {
				z = (g.value - mean) / stddev
			}
			items = append(items, model.OutlierItem{
				Label:     g.label,
				Service:   svc,
				Value:     g.value,
				Baseline:  mean,
				ZScore:    z,
				Count:     g.count,
				ErrorRate: g.errorRate,
				Secondary: g.secondary,
			})
		}
	}

	sort.SliceStable(items, func(i, j int) bool {
		if items[i].ZScore != items[j].ZScore {
			return items[i].ZScore > items[j].ZScore
		}
		return items[i].Value > items[j].Value
	})
	return items
}

// -----------------------------------------------------------------------
// Operation latency outliers (spans)
// -----------------------------------------------------------------------

// ListOperationOutliers scores each operation's p95 latency against the other
// operations in the same service. minCount drops low-traffic operations.
func ListOperationOutliers(ctx context.Context, service string, window time.Duration, minCount uint64) ([]model.OutlierItem, error) {
	windowSec := windowSeconds(window)

	serviceFilter := ""
	args := []any{windowSec}
	if service != "" {
		serviceFilter = " AND service_name = ?"
		args = append(args, service)
	}
	args = append(args, minCount)

	query := `
SELECT
    service_name,
    name                                            AS label,
    count()                                         AS cnt,
    countIf(status_code = 2) / count()              AS err_rate,
    quantileExact(0.95)(duration_nano / 1e6)        AS p95
FROM apm.spans
WHERE fromUnixTimestamp64Nano(start_time_nano) >= now() - INTERVAL ? SECOND` +
		serviceFilter + `
GROUP BY service_name, label
HAVING cnt >= ?
`
	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("operation outliers query: %w", err)
	}
	defer rows.Close()

	var raw []rawGroup
	for rows.Next() {
		var g rawGroup
		if err := rows.Scan(&g.service, &g.label, &g.count, &g.errorRate, &g.value); err != nil {
			return nil, fmt.Errorf("operation outliers scan: %w", err)
		}
		raw = append(raw, g)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("operation outliers rows: %w", err)
	}
	return scoreOutliers(raw), nil
}

// -----------------------------------------------------------------------
// Instance latency outliers (spans, resource attributes)
// -----------------------------------------------------------------------

// ListInstanceOutliers scores each service instance's p95 latency against the
// other instances of the same service. The instance identity is read from the
// span attribute map (service.instance.id, falling back to host.name); spans
// that carry neither are excluded, so this degrades to an empty result when the
// agents do not emit instance attributes.
func ListInstanceOutliers(ctx context.Context, service string, window time.Duration, minCount uint64) ([]model.OutlierItem, error) {
	windowSec := windowSeconds(window)

	serviceFilter := ""
	args := []any{windowSec}
	if service != "" {
		serviceFilter = " AND service_name = ?"
		args = append(args, service)
	}
	args = append(args, minCount)

	query := `
SELECT
    service_name,
    if(attributes['service.instance.id'] != '', attributes['service.instance.id'], attributes['host.name']) AS label,
    count()                                         AS cnt,
    countIf(status_code = 2) / count()              AS err_rate,
    quantileExact(0.95)(duration_nano / 1e6)        AS p95
FROM apm.spans
WHERE fromUnixTimestamp64Nano(start_time_nano) >= now() - INTERVAL ? SECOND
  AND (attributes['service.instance.id'] != '' OR attributes['host.name'] != '')` +
		serviceFilter + `
GROUP BY service_name, label
HAVING cnt >= ?
`
	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("instance outliers query: %w", err)
	}
	defer rows.Close()

	var raw []rawGroup
	for rows.Next() {
		var g rawGroup
		if err := rows.Scan(&g.service, &g.label, &g.count, &g.errorRate, &g.value); err != nil {
			return nil, fmt.Errorf("instance outliers scan: %w", err)
		}
		raw = append(raw, g)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("instance outliers rows: %w", err)
	}
	return scoreOutliers(raw), nil
}

// -----------------------------------------------------------------------
// Resource (pod) outliers (k8s_pod_metrics)
// -----------------------------------------------------------------------

// ListResourceOutliers scores each pod's average CPU usage (millicores) against
// the other pods of the same service, carrying average memory as the secondary
// dimension. Requires the apm.k8s_pod_metrics table to be populated.
func ListResourceOutliers(ctx context.Context, service string, window time.Duration) ([]model.OutlierItem, error) {
	fromMs := time.Now().Add(-window).UnixMilli()
	toMs := time.Now().UnixMilli()

	serviceFilter := ""
	args := []any{fromMs, toMs}
	if service != "" {
		serviceFilter = " AND service_name = ?"
		args = append(args, service)
	}

	query := `
SELECT
    service_name,
    pod_name                       AS label,
    count()                        AS cnt,
    avg(cpu_usage_millicore)       AS avg_cpu_m,
    avg(memory_usage_bytes)        AS avg_mem_bytes
FROM apm.k8s_pod_metrics
WHERE timestamp >= fromUnixTimestamp64Milli(?)
  AND timestamp <= fromUnixTimestamp64Milli(?)` +
		serviceFilter + `
GROUP BY service_name, label
`
	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("resource outliers query: %w", err)
	}
	defer rows.Close()

	var raw []rawGroup
	for rows.Next() {
		var g rawGroup
		if err := rows.Scan(&g.service, &g.label, &g.count, &g.value, &g.secondary); err != nil {
			return nil, fmt.Errorf("resource outliers scan: %w", err)
		}
		raw = append(raw, g)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("resource outliers rows: %w", err)
	}
	return scoreOutliers(raw), nil
}
