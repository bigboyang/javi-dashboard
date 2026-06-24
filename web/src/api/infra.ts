import type { InfraPodsResponse, InfraTimeseriesResponse } from '../types/infra'
import { apiFetch } from './client'

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
