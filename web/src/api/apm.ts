import type { ServicesResponse, RedSeriesResponse, TracesResponse, TraceDetailResponse, LogsResponse, TopologyResponse, MetricNamesResponse, MetricSeriesResponse } from '../types/apm'

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

export function fetchLogs(
  window: string,
  service?: string,
  level?: string,
  search?: string,
  limit = 200,
): Promise<LogsResponse> {
  const params = new URLSearchParams({ window, limit: String(limit) })
  if (service) params.set('service', service)
  if (level) params.set('level', level)
  if (search) params.set('search', search)
  return apiFetch<LogsResponse>(`/api/v1/logs?${params}`)
}

export function fetchTopology(window: string): Promise<TopologyResponse> {
  return apiFetch<TopologyResponse>(`/api/v1/topology?window=${encodeURIComponent(window)}`)
}

export function fetchMetricNames(window: string, service?: string): Promise<MetricNamesResponse> {
  const params = new URLSearchParams({ window })
  if (service) params.set('service', service)
  return apiFetch<MetricNamesResponse>(`/api/v1/metrics/names?${params}`)
}

export function fetchMetricSeries(
  metric: string,
  window: string,
  step: string,
  service?: string,
): Promise<MetricSeriesResponse> {
  const params = new URLSearchParams({ metric, window, step })
  if (service) params.set('service', service)
  return apiFetch<MetricSeriesResponse>(`/api/v1/metrics/series?${params}`)
}
