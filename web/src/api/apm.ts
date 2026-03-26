import type { ServicesResponse, RedSeriesResponse } from '../types/apm'

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export function fetchServices(window: string): Promise<ServicesResponse> {
  return apiFetch<ServicesResponse>(`/api/v1/services?window=${encodeURIComponent(window)}`)
}

export function fetchServiceRed(
  service: string,
  window: string,
  step: string,
): Promise<RedSeriesResponse> {
  return apiFetch<RedSeriesResponse>(
    `/api/v1/services/${encodeURIComponent(service)}/red?window=${encodeURIComponent(window)}&step=${encodeURIComponent(step)}`,
  )
}
