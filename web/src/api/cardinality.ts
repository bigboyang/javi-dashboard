import { apiFetch } from './client'

export interface CardinalityKey {
  key: string
  count: number
}

export interface CardinalityKeysResponse {
  keys: CardinalityKey[]
  window: string
  service: string
  generated_at: string
}

export interface CardinalityValue {
  value: string
  count: number
  error_rate: number
  p95_ms: number
}

export interface CardinalityValuesResponse {
  key: string
  values: CardinalityValue[]
  window: string
  service: string
  generated_at: string
}

export function fetchCardinalityKeys(window = '1h', service?: string): Promise<CardinalityKeysResponse> {
  const params = new URLSearchParams({ window })
  if (service) params.set('service', service)
  return apiFetch<CardinalityKeysResponse>(`/api/v1/cardinality/keys?${params}`)
}

export function fetchCardinalityValues(key: string, window = '1h', service?: string): Promise<CardinalityValuesResponse> {
  const params = new URLSearchParams({ key, window })
  if (service) params.set('service', service)
  return apiFetch<CardinalityValuesResponse>(`/api/v1/cardinality/values?${params}`)
}
