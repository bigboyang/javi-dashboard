import type {
  ForecastRedResponse,
  ForecastCapacityResponse,
  ForecastAnomaliesResponse,
  AnomalySeverity,
  ForecastServiceRED,
} from '../types/forecast'
import { apiFetch } from './client'

export function fetchForecastRed(): Promise<ForecastRedResponse> {
  return apiFetch<ForecastRedResponse>('/api/v1/forecast/red')
}

export function fetchForecastService(service: string, metric = 'all'): Promise<ForecastServiceRED[]> {
  const params = new URLSearchParams({ metric })
  return apiFetch<ForecastServiceRED[]>(
    `/api/v1/forecast/service/${encodeURIComponent(service)}?${params}`,
  )
}

export function fetchForecastCapacity(): Promise<ForecastCapacityResponse> {
  return apiFetch<ForecastCapacityResponse>('/api/v1/forecast/capacity')
}

export function fetchForecastAnomalies(severity?: AnomalySeverity): Promise<ForecastAnomaliesResponse> {
  const params = severity ? `?severity=${severity}` : ''
  return apiFetch<ForecastAnomaliesResponse>(`/api/v1/forecast/anomalies${params}`)
}
