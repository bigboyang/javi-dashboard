import { apiFetch } from './client'
export interface LogVolumeBucket {
  ts: number
  severity: string
  count: number
}

export interface LogVolumeResponse {
  buckets: LogVolumeBucket[]
  window: string
  generated_at: string
}

export function fetchLogVolume(window = '6h', service?: string): Promise<LogVolumeResponse> {
  const params = new URLSearchParams({ window })
  if (service) params.set('service', service)
  return apiFetch<LogVolumeResponse>(`/api/v1/logs/volume?${params}`)
}
