import type { ServicesResponse, RedSeriesResponse, TracesResponse, TraceDetailResponse } from '../types/apm'

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

export function fetchTraces(
  window: string,
  service?: string,
  limit = 100,
): Promise<TracesResponse> {
  const params = new URLSearchParams({ window, limit: String(limit) })
  if (service) params.set('service', service)
  return apiFetch<TracesResponse>(`/api/v1/traces?${params}`)
}

export function fetchTraceDetail(traceId: string): Promise<TraceDetailResponse> {
  return apiFetch<TraceDetailResponse>(`/api/v1/traces/${encodeURIComponent(traceId)}`)
}
