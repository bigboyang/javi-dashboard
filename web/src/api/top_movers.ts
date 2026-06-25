import { apiFetch } from './client'

export type TopMoverSort = 'latency' | 'errors' | 'throughput'

export interface TopMover {
  name: string
  cur_p95_ms: number
  prev_p95_ms: number
  p95_delta_ms: number
  p95_delta_pct: number
  cur_error_rate: number
  prev_error_rate: number
  error_rate_delta: number
  cur_rate: number
  prev_rate: number
  cur_requests: number
  prev_requests: number
}

export interface TopMoversResponse {
  movers: TopMover[]
  window: string
  sort_by: TopMoverSort
  generated_at: string
}

export function fetchTopMovers(
  window = '1h',
  sort: TopMoverSort = 'latency',
  limit = 20,
): Promise<TopMoversResponse> {
  const params = new URLSearchParams({ window, sort, limit: String(limit) })
  return apiFetch<TopMoversResponse>(`/api/v1/top-movers?${params}`)
}
