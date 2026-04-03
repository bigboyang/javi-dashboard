// Phase 7: Forecast / AI-predicted metrics types

// -----------------------------------------------------------------------
// RED forecast time-series
// -----------------------------------------------------------------------

export interface ForecastPoint {
  ts: string           // ISO timestamp
  actual: number | null  // null for future (predicted-only) points
  predicted: number
  lower: number        // confidence band lower bound
  upper: number        // confidence band upper bound
}

export type ForecastMetric = 'rate' | 'error_rate' | 'p95_ms'

export interface ForecastServiceRED {
  service: string
  metric: ForecastMetric
  unit: string         // "req/min" | "ratio" | "ms"
  series: ForecastPoint[]
}

export interface ForecastRedResponse {
  services: ForecastServiceRED[]
  generated_at: string
  horizon_hours: number
}

// -----------------------------------------------------------------------
// Capacity headroom
// -----------------------------------------------------------------------

export interface CapacityMetric {
  resource: string       // "cpu" | "memory" | "request_rate"
  service: string
  current: number
  predicted_max: number  // peak utilization predicted within horizon
  capacity: number       // maximum supported value (100 for pct)
  headroom_pct: number   // (capacity - predicted_max) / capacity * 100
  saturation_at: string | null  // ISO ts when headroom → 0, null = safe
}

export interface ForecastCapacityResponse {
  metrics: CapacityMetric[]
  generated_at: string
  horizon_hours: number
}

// -----------------------------------------------------------------------
// Anomaly predictions
// -----------------------------------------------------------------------

export type AnomalySeverity = 'warn' | 'critical'

export interface AnomalyPrediction {
  id: string
  service: string
  metric: string
  severity: AnomalySeverity
  description: string
  predicted_at: string   // ISO ts — when anomaly expected to start
  confidence: number     // 0.0–1.0
  current_value: number
  threshold_value: number
}

export interface ForecastAnomaliesResponse {
  anomalies: AnomalyPrediction[]
  generated_at: string
}
