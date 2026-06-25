import { apiFetch } from './client'

export interface HeatmapBucket {
  index: number
  low_ms: number
  high_ms: number
}

export interface HeatmapCell {
  ts_ms: number
  bucket: number
  count: number
}

export interface LatencyHeatmapResponse {
  service: string
  window: string
  step: string
  columns: number[]       // epoch ms, ascending
  buckets: HeatmapBucket[]
  cells: HeatmapCell[]
  max_count: number
}

export function fetchLatencyHeatmap(
  window = '1h',
  step = '1m',
  service?: string,
): Promise<LatencyHeatmapResponse> {
  const params = new URLSearchParams({ window, step })
  if (service) params.set('service', service)
  return apiFetch<LatencyHeatmapResponse>(`/api/v1/metrics/latency-heatmap?${params}`)
}
