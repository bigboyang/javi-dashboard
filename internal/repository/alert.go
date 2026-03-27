package repository

import (
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kkc/javi-dashboard/internal/model"
)

var (
	alertMu    sync.RWMutex
	alertRules []model.AlertRule
)

// ListAlertRules returns a snapshot of all stored alert rules.
func ListAlertRules() []model.AlertRule {
	alertMu.RLock()
	defer alertMu.RUnlock()
	out := make([]model.AlertRule, len(alertRules))
	copy(out, alertRules)
	return out
}

// AddAlertRule appends a new rule and returns it with a generated ID.
func AddAlertRule(req model.CreateAlertRuleRequest) model.AlertRule {
	rule := model.AlertRule{
		ID:        uuid.New().String(),
		Name:      req.Name,
		Service:   req.Service,
		Metric:    req.Metric,
		Condition: req.Condition,
		Threshold: req.Threshold,
		Window:    model.WindowParam(req.Window),
		Enabled:   true,
		CreatedAt: time.Now().UTC(),
	}
	alertMu.Lock()
	alertRules = append(alertRules, rule)
	alertMu.Unlock()
	return rule
}

// RemoveAlertRule deletes the rule with the given id. Returns true if found.
func RemoveAlertRule(id string) bool {
	alertMu.Lock()
	defer alertMu.Unlock()
	for i, r := range alertRules {
		if r.ID == id {
			alertRules = append(alertRules[:i], alertRules[i+1:]...)
			return true
		}
	}
	return false
}

// EvaluateAlerts checks each enabled rule against the provided service summaries
// and returns a list of violations. It does not hit ClickHouse directly; the
// handler fetches service data and passes it in so evaluation stays cheap.
func EvaluateAlerts(services []model.ServiceSummary) []model.AlertFiring {
	rules := ListAlertRules()
	now := time.Now().UTC()
	var firing []model.AlertFiring

	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}
		for _, svc := range services {
			// Skip if rule targets a specific service that doesn't match.
			if rule.Service != "" && rule.Service != svc.Name {
				continue
			}

			var current float64
			switch rule.Metric {
			case model.AlertMetricErrorRate:
				current = svc.ErrorRate
			case model.AlertMetricP95Ms:
				current = svc.P95Ms
			case model.AlertMetricP99Ms:
				current = svc.P99Ms
			case model.AlertMetricRate:
				current = svc.Rate
			default:
				continue
			}

			var fires bool
			switch rule.Condition {
			case model.AlertConditionGT:
				fires = current > rule.Threshold
			case model.AlertConditionLT:
				fires = current < rule.Threshold
			}

			if fires {
				firing = append(firing, model.AlertFiring{
					RuleID:       rule.ID,
					RuleName:     rule.Name,
					Service:      svc.Name,
					Metric:       rule.Metric,
					Condition:    rule.Condition,
					Threshold:    rule.Threshold,
					CurrentValue: current,
					FiredAt:      now,
				})
			}
		}
	}
	return firing
}
