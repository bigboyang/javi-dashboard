import type { InfraPodsResponse, InfraTimeseriesResponse } from '../types/infra'

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

export function fetchInfraPods(service: string, window = '1h'): Promise<InfraPodsResponse> {
  return apiFetch<InfraPodsResponse>(
    `/api/v1/infra/pods/${encodeURIComponent(service)}?window=${encodeURIComponent(window)}`,
  )
}

export function fetchInfraTimeseries(
  service: string,
  pod: string,
  window = '1h',
): Promise<InfraTimeseriesResponse> {
  const params = new URLSearchParams({ pod, window })
  return apiFetch<InfraTimeseriesResponse>(
    `/api/v1/infra/pods/${encodeURIComponent(service)}/timeseries?${params}`,
  )
}
