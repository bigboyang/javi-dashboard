package repository

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kkc/javi-dashboard/internal/ch"
	"github.com/kkc/javi-dashboard/internal/model"
)

var (
	alertMu    sync.RWMutex
	alertRules []model.AlertRule
	rulesOnce  sync.Once
)

// InitAlertRules creates the ClickHouse table and preloads rules into memory.
// Must be called once after ch.Connect() succeeds.
func InitAlertRules(ctx context.Context) error {
	if err := ch.EnsureAlertRulesTable(ctx); err != nil {
		return err
	}
	rows, err := ch.QueryActiveAlertRules(ctx)
	if err != nil {
		return err
	}
	alertMu.Lock()
	alertRules = alertRules[:0]
	for _, r := range rows {
		alertRules = append(alertRules, model.AlertRule{
			ID:        r.ID,
			Name:      r.Name,
			Service:   r.Service,
			Metric:    model.AlertMetric(r.Metric),
			Condition: model.AlertCondition(r.Condition),
			Threshold: r.Threshold,
			Window:    model.WindowParam(r.Window),
			Enabled:   r.Enabled,
			CreatedAt: r.CreatedAt,
		})
	}
	alertMu.Unlock()
	log.Printf("alert_rules: loaded %d rules from ClickHouse", len(rows))
	return nil
}

// ListAlertRules returns a snapshot of all stored alert rules.
func ListAlertRules() []model.AlertRule {
	alertMu.RLock()
	defer alertMu.RUnlock()
	out := make([]model.AlertRule, len(alertRules))
	copy(out, alertRules)
	return out
}

// AddAlertRule appends a new rule and persists it to ClickHouse.
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

	if ch.DB != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := ch.UpsertAlertRule(ctx, rule.ID, rule.Name, rule.Service,
				string(rule.Metric), string(rule.Condition), string(rule.Window),
				rule.Threshold, rule.Enabled, false, rule.CreatedAt); err != nil {
				log.Printf("alert_rules: ClickHouse persist failed: %v", err)
			}
		}()
	}

	return rule
}

// RemoveAlertRule soft-deletes the rule in ClickHouse and removes it from memory.
// Returns true if found.
func RemoveAlertRule(id string) bool {
	alertMu.Lock()
	var found *model.AlertRule
	for i, r := range alertRules {
		if r.ID == id {
			found = &alertRules[i]
			alertRules = append(alertRules[:i], alertRules[i+1:]...)
			break
		}
	}
	alertMu.Unlock()

	if found == nil {
		return false
	}

	if ch.DB != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := ch.UpsertAlertRule(ctx, found.ID, found.Name, found.Service,
				string(found.Metric), string(found.Condition), string(found.Window),
				found.Threshold, found.Enabled, true, time.Now().UTC()); err != nil {
				log.Printf("alert_rules: ClickHouse delete failed: %v", err)
			}
		}()
	}

	return true
}

// UpdateAlertRule patches enabled flag and/or threshold for an existing rule.
// Returns the updated rule and true if found.
func UpdateAlertRule(id string, req model.UpdateAlertRuleRequest) (model.AlertRule, bool) {
	alertMu.Lock()
	var updated model.AlertRule
	found := false
	for i, r := range alertRules {
		if r.ID == id {
			if req.Enabled != nil {
				alertRules[i].Enabled = *req.Enabled
			}
			if req.Threshold != nil {
				alertRules[i].Threshold = *req.Threshold
			}
			if req.Name != nil {
				alertRules[i].Name = *req.Name
			}
			updated = alertRules[i]
			found = true
			break
		}
	}
	alertMu.Unlock()

	if !found {
		return model.AlertRule{}, false
	}

	if ch.DB != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := ch.UpsertAlertRule(ctx, updated.ID, updated.Name, updated.Service,
				string(updated.Metric), string(updated.Condition), string(updated.Window),
				updated.Threshold, updated.Enabled, false, time.Now().UTC()); err != nil {
				log.Printf("alert_rules: ClickHouse update failed: %v", err)
			}
		}()
	}

	return updated, true
}

// EvaluateAlerts checks each enabled rule against the provided service summaries
// and returns a list of violations.
func EvaluateAlerts(services []model.ServiceSummary) []model.AlertFiring {
	rules := ListAlertRules()
	now := time.Now().UTC()
	var firing []model.AlertFiring

	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}
		for _, svc := range services {
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
