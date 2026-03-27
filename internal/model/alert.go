package model

import "time"

// AlertMetric identifies which RED metric to evaluate.
type AlertMetric string

const (
	AlertMetricErrorRate AlertMetric = "error_rate" // fraction 0-1
	AlertMetricP95Ms     AlertMetric = "p95_ms"
	AlertMetricP99Ms     AlertMetric = "p99_ms"
	AlertMetricRate      AlertMetric = "rate" // req/min
)

// AlertCondition is the comparison operator for a rule threshold.
type AlertCondition string

const (
	AlertConditionGT AlertCondition = "gt" // current_value > threshold
	AlertConditionLT AlertCondition = "lt" // current_value < threshold
)

// AlertRule defines a threshold-based alert on a RED metric for a service.
type AlertRule struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Service   string         `json:"service"`   // "" means all services
	Metric    AlertMetric    `json:"metric"`
	Condition AlertCondition `json:"condition"`
	Threshold float64        `json:"threshold"`
	Window    WindowParam    `json:"window"`
	Enabled   bool           `json:"enabled"`
	CreatedAt time.Time      `json:"created_at"`
}

// AlertFiring represents a rule violation for a specific service.
type AlertFiring struct {
	RuleID       string         `json:"rule_id"`
	RuleName     string         `json:"rule_name"`
	Service      string         `json:"service"`
	Metric       AlertMetric    `json:"metric"`
	Condition    AlertCondition `json:"condition"`
	Threshold    float64        `json:"threshold"`
	CurrentValue float64        `json:"current_value"`
	FiredAt      time.Time      `json:"fired_at"`
}

// AlertRulesResponse is the envelope for GET /api/v1/alerts/rules.
type AlertRulesResponse struct {
	Rules []AlertRule `json:"rules"`
}

// AlertStatusResponse is the envelope for GET /api/v1/alerts/status.
type AlertStatusResponse struct {
	Firing      []AlertFiring `json:"firing"`
	EvaluatedAt time.Time     `json:"evaluated_at"`
}

// CreateAlertRuleRequest is the parsed body for POST /api/v1/alerts/rules.
type CreateAlertRuleRequest struct {
	Name      string         `json:"name"`
	Service   string         `json:"service"`
	Metric    AlertMetric    `json:"metric"`
	Condition AlertCondition `json:"condition"`
	Threshold float64        `json:"threshold"`
	Window    string         `json:"window"`
}
