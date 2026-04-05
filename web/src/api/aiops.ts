import type { AnomaliesResponse, RCAResponse } from '../types/aiops'

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

export function fetchAnomalies(
  window = '1h',
  service?: string,
  severity?: string,
): Promise<AnomaliesResponse> {
  const params = new URLSearchParams({ window })
  if (service) params.set('service', service)
  if (severity) params.set('severity', severity)
  return apiFetch<AnomaliesResponse>(`/api/v1/aiops/anomalies?${params}`)
}

export function fetchRCA(window = '1h', service?: string): Promise<RCAResponse> {
  const params = new URLSearchParams({ window })
  if (service) params.set('service', service)
  return apiFetch<RCAResponse>(`/api/v1/aiops/rca?${params}`)
}
