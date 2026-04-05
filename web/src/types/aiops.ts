// Phase 8: AIOps types — anomalies from apm.anomalies, RCA from apm.rca_reports

export type AnomalyType =
  | 'latency_p95_spike'
  | 'error_rate_spike'
  | 'traffic_drop'
  | 'multivariate_anomaly'

export type AnomalySeverity = 'warning' | 'critical'

export interface AnomalyRecord {
  id: string
  service_name: string
  span_name: string
  anomaly_type: AnomalyType
  minute: string
  current_value: number
  baseline_value: number
  z_score: number
  severity: AnomalySeverity
  detected_at: string
}

export interface AnomaliesResponse {
  anomalies: AnomalyRecord[]
  window: string
  generated_at: string
}

export interface CorrelatedSpan {
  span_id: string
  trace_id: string
  name: string
  status_code: number
  status_message?: string
  duration_ms: number
  exception_type?: string
}

export interface SimilarIncident {
  trace_id: string
  service_name: string
  score: number
  summary: string
}

export interface RCAReport {
  id: string
  anomaly_id: string
  service_name: string
  span_name: string
  anomaly_type: AnomalyType
  minute: string
  severity: AnomalySeverity
  z_score: number
  correlated_spans: CorrelatedSpan[]
  similar_incidents: SimilarIncident[]
  hypothesis: string
  llm_analysis: string
  created_at: string
}

export interface RCAResponse {
  reports: RCAReport[]
  window: string
  generated_at: string
}
