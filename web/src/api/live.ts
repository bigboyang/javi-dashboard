export type LiveSignal = 'span' | 'log' | 'metric'
export type LiveSeverity = 'error' | 'warn' | 'info'

export interface LiveEvent {
  type: LiveSignal
  time_ms: number
  service: string
  title: string
  detail: string
  severity: LiveSeverity
  trace_id?: string
  span_id?: string
  duration_ms?: number
  value?: number
  kind?: string
}

export interface LiveStats {
  spans_per_min: number
  span_errors_per_min: number
  logs_per_min: number
  log_errors_per_min: number
  metrics_per_min: number
  active_services: string[]
}

export interface LiveResponse {
  events: LiveEvent[]
  stats: LiveStats
  latest_ms: number
  server_now_ms: number
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json() as Promise<T>
}

export function fetchLive(
  since?: number,
  service?: string,
  limit = 200,
): Promise<LiveResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (since && since > 0) params.set('since', String(since))
  if (service) params.set('service', service)
  return apiFetch<LiveResponse>(`/api/v1/live?${params}`)
}
