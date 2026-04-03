package model

import "time"

// -----------------------------------------------------------------------
// Phase 7: Forecast / AI-predicted RED metrics
// -----------------------------------------------------------------------

// ForecastPoint holds a single timestep of the forecast time-series.
// Actual is nil for future points (predictions only).
type ForecastPoint struct {
	Ts        time.Time `json:"ts"`
	Actual    *float64  `json:"actual"`    // nil for future timestamps
	Predicted float64   `json:"predicted"` // model forecast
	Lower     float64   `json:"lower"`     // confidence interval lower bound
	Upper     float64   `json:"upper"`     // confidence interval upper bound
}

// ForecastMetric is the metric name used in forecast series.
type ForecastMetric string

const (
	ForecastMetricRate      ForecastMetric = "rate"
	ForecastMetricErrorRate ForecastMetric = "error_rate"
	ForecastMetricP95Ms     ForecastMetric = "p95_ms"
)

// ForecastServiceRED carries the forecast time-series for one service/metric pair.
type ForecastServiceRED struct {
	Service string         `json:"service"`
	Metric  ForecastMetric `json:"metric"`
	Unit    string         `json:"unit"`   // "req/min" | "ratio" | "ms"
	Series  []ForecastPoint `json:"series"`
}

// ForecastRedResponse is the envelope for GET /api/v1/forecast/red.
type ForecastRedResponse struct {
	Services     []ForecastServiceRED `json:"services"`
	GeneratedAt  time.Time            `json:"generated_at"`
	HorizonHours int                  `json:"horizon_hours"`
}

// -----------------------------------------------------------------------
// Capacity headroom
// -----------------------------------------------------------------------

// CapacityMetric carries the capacity prediction for one resource/service pair.
type CapacityMetric struct {
	Resource      string    `json:"resource"`       // "cpu" | "memory" | "request_rate"
	Service       string    `json:"service"`
	Current       float64   `json:"current"`        // current utilization
	PredictedMax  float64   `json:"predicted_max"`  // peak within horizon
	Capacity      float64   `json:"capacity"`       // max supported (100 for pct)
	HeadroomPct   float64   `json:"headroom_pct"`   // remaining headroom %
	SaturationAt  *string   `json:"saturation_at"`  // ISO ts when headroom → 0, nil = safe
}

// ForecastCapacityResponse is the envelope for GET /api/v1/forecast/capacity.
type ForecastCapacityResponse struct {
	Metrics      []CapacityMetric `json:"metrics"`
	GeneratedAt  time.Time        `json:"generated_at"`
	HorizonHours int              `json:"horizon_hours"`
}

// -----------------------------------------------------------------------
// Anomaly predictions
// -----------------------------------------------------------------------

// AnomalySeverity is the forecast anomaly severity level.
type AnomalySeverity string

const (
	AnomalySeverityWarn     AnomalySeverity = "warn"
	AnomalySeverityCritical AnomalySeverity = "critical"
)

// AnomalyPrediction holds a single predicted anomaly event.
type AnomalyPrediction struct {
	ID             string          `json:"id"`
	Service        string          `json:"service"`
	Metric         string          `json:"metric"`
	Severity       AnomalySeverity `json:"severity"`
	Description    string          `json:"description"`
	PredictedAt    time.Time       `json:"predicted_at"`    // when anomaly expected to start
	Confidence     float64         `json:"confidence"`      // 0.0–1.0
	CurrentValue   float64         `json:"current_value"`
	ThresholdValue float64         `json:"threshold_value"`
}

// ForecastAnomaliesResponse is the envelope for GET /api/v1/forecast/anomalies.
type ForecastAnomaliesResponse struct {
	Anomalies   []AnomalyPrediction `json:"anomalies"`
	GeneratedAt time.Time           `json:"generated_at"`
}
