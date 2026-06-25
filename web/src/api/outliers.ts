import { apiFetch } from './client'

export type OutlierType = 'operations' | 'instances' | 'resources'

export interface OutlierItem {
  label: string
  service: string
  value: number
  baseline: number
  z_score: number
  count: number
  error_rate: number
  secondary: number
}

export interface OutliersResponse {
  type: string
  metric: string
  secondary_metric: string
  window: string
  service: string
  items: OutlierItem[]
  generated_at: string
}

export function fetchOutliers(
  type: OutlierType,
  window = '1h',
  service?: string,
  minZ = 2,
): Promise<OutliersResponse> {
  const params = new URLSearchParams({ window, min_z: String(minZ) })
  if (service) params.set('service', service)
  return apiFetch<OutliersResponse>(`/api/v1/outliers/${type}?${params}`)
}
