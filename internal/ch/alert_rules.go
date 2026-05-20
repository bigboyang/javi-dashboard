package ch

import (
	"context"
	"fmt"
	"time"
)

// EnsureAlertRulesTable creates apm.alert_rules if it does not exist.
// ReplacingMergeTree deduplicates on id; deleted=1 is a soft-delete marker.
func EnsureAlertRulesTable(ctx context.Context) error {
	sql := `
CREATE TABLE IF NOT EXISTS apm.alert_rules (
    id        String,
    name      String,
    service   String,
    metric    LowCardinality(String),
    condition LowCardinality(String),
    threshold Float64,
    window    LowCardinality(String),
    enabled   UInt8,
    deleted   UInt8,
    created_at DateTime64(3, 'UTC')
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY id`
	return DB.Exec(ctx, sql)
}

// UpsertAlertRule inserts or replaces a rule row (ReplacingMergeTree handles dedup).
func UpsertAlertRule(ctx context.Context, id, name, service, metric, condition, window string, threshold float64, enabled, deleted bool, createdAt time.Time) error {
	var en, del uint8
	if enabled {
		en = 1
	}
	if deleted {
		del = 1
	}
	sql := `INSERT INTO apm.alert_rules
        (id, name, service, metric, condition, threshold, window, enabled, deleted, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	return DB.Exec(ctx, sql, id, name, service, metric, condition, threshold, window, en, del, createdAt)
}

type AlertRuleRow struct {
	ID        string
	Name      string
	Service   string
	Metric    string
	Condition string
	Threshold float64
	Window    string
	Enabled   bool
	CreatedAt time.Time
}

// QueryActiveAlertRules returns all non-deleted rules using FINAL to dedup.
func QueryActiveAlertRules(ctx context.Context) ([]AlertRuleRow, error) {
	rows, err := DB.Query(ctx, `
SELECT id, name, service, metric, condition, threshold, window, enabled, created_at
FROM apm.alert_rules FINAL
WHERE deleted = 0
ORDER BY created_at ASC`)
	if err != nil {
		return nil, fmt.Errorf("query alert_rules: %w", err)
	}
	defer rows.Close()

	var result []AlertRuleRow
	for rows.Next() {
		var r AlertRuleRow
		var enabled uint8
		if err := rows.Scan(&r.ID, &r.Name, &r.Service, &r.Metric, &r.Condition,
			&r.Threshold, &r.Window, &enabled, &r.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan alert_rule: %w", err)
		}
		r.Enabled = enabled == 1
		result = append(result, r)
	}
	return result, rows.Err()
}
