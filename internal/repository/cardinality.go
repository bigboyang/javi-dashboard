package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/kkc/javi-dashboard/internal/ch"
	"github.com/kkc/javi-dashboard/internal/model"
)

// ListCardinalityKeys returns the most common span-attribute keys in the window,
// so the UI can offer them for breakdown. arrayJoin over mapKeys expands each
// span's attribute keys into rows; ordering by frequency surfaces useful keys
// first. Limited to keep the response bounded.
func ListCardinalityKeys(ctx context.Context, service string, window time.Duration, limit int) ([]model.CardinalityKey, error) {
	windowSec := windowSeconds(window)

	serviceFilter := ""
	args := []any{windowSec}
	if service != "" {
		serviceFilter = " AND service_name = ?"
		args = append(args, service)
	}

	query := `
SELECT
    arrayJoin(mapKeys(attributes)) AS k,
    count()                        AS cnt
FROM apm.spans
WHERE fromUnixTimestamp64Nano(start_time_nano) >= now() - INTERVAL ? SECOND` +
		serviceFilter + `
GROUP BY k
ORDER BY cnt DESC
LIMIT ` + itoaRepo(limit)

	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("cardinality keys query: %w", err)
	}
	defer rows.Close()

	var keys []model.CardinalityKey
	for rows.Next() {
		var k model.CardinalityKey
		if err := rows.Scan(&k.Key, &k.Count); err != nil {
			return nil, fmt.Errorf("cardinality keys scan: %w", err)
		}
		keys = append(keys, k)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("cardinality keys rows: %w", err)
	}
	return keys, nil
}

// ListCardinalityValues breaks down latency/error by the values of one attribute
// key, ordered by p95 descending so the slowest cohort is first. The key is
// bound as a parameter (Map subscript), never interpolated.
func ListCardinalityValues(ctx context.Context, key, service string, window time.Duration, limit int) ([]model.CardinalityValue, error) {
	windowSec := windowSeconds(window)

	// attributes[?] appears in both SELECT and WHERE, so the key is bound twice,
	// in positional order: SELECT key, window, WHERE key, then optional service.
	serviceFilter := ""
	args := []any{key, windowSec, key}
	if service != "" {
		serviceFilter = " AND service_name = ?"
		args = append(args, service)
	}

	query := `
SELECT
    attributes[?]                                AS v,
    count()                                      AS cnt,
    countIf(status_code = 2) / count()           AS err_rate,
    quantileExact(0.95)(duration_nano / 1e6)     AS p95
FROM apm.spans
WHERE fromUnixTimestamp64Nano(start_time_nano) >= now() - INTERVAL ? SECOND
  AND attributes[?] != ''` +
		serviceFilter + `
GROUP BY v
ORDER BY p95 DESC
LIMIT ` + itoaRepo(limit)

	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("cardinality values query: %w", err)
	}
	defer rows.Close()

	var values []model.CardinalityValue
	for rows.Next() {
		var v model.CardinalityValue
		if err := rows.Scan(&v.Value, &v.Count, &v.ErrorRate, &v.P95Ms); err != nil {
			return nil, fmt.Errorf("cardinality values scan: %w", err)
		}
		values = append(values, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("cardinality values rows: %w", err)
	}
	return values, nil
}

// itoaRepo renders a non-negative int for a validated LIMIT clause (callers pass
// bounded values only).
func itoaRepo(n int) string {
	if n <= 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
