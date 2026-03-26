export interface ServiceSummary {
  name: string
  rate: number        // req/min
  error_rate: number  // 0.0-1.0
  p50_ms: number
  p95_ms: number
  p99_ms: number
  total_requests: number
  error_count: number
}

export interface ServicesResponse {
  services: ServiceSummary[]
  window: string
  generated_at: string
}

export interface RedPoint {
  ts: string
  rate: number
  error_rate: number
  p50_ms: number
  p95_ms: number
  p99_ms: number
  count: number
  errors: number
}

export interface RedSeriesResponse {
  service: string
  window: string
  step: string
  series: RedPoint[]
}

export type TimeWindow = '5m' | '15m' | '1h' | '6h' | '24h'
export type DetailWindow = '1h' | '6h' | '24h'
