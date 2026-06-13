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

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json() as Promise<T>
}

export function fetchLogVolume(window = '6h', service?: string): Promise<LogVolumeResponse> {
  const params = new URLSearchParams({ window })
  if (service) params.set('service', service)
  return apiFetch<LogVolumeResponse>(`/api/v1/logs/volume?${params}`)
}
