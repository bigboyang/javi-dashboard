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

export interface TraceSummary {
  trace_id: string
  service_name: string
  root_operation: string
  start_time: string
  duration_ms: number
  status_code: number  // 0=UNSET, 1=OK, 2=ERROR
  span_count: number
}

export interface TracesResponse {
  traces: TraceSummary[]
  window: string
  total: number
}

export interface TraceSpan {
  trace_id: string
  span_id: string
  parent_span_id: string
  service_name: string
  name: string
  start_time: string
  duration_ms: number
  status_code: number
  http_method: string
  http_status_code: number
  attrs: Record<string, string>
}

export interface TraceDetailResponse {
  trace_id: string
  spans: TraceSpan[]
}
