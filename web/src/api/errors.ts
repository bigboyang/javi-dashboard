import type { ErrorGroupsResponse } from '../types/errors'
import { apiFetch } from './client'

export function fetchErrorGroups(
  window = '24h',
  service?: string,
  limit?: number,
): Promise<ErrorGroupsResponse> {
  const params = new URLSearchParams({ window })
  if (service) params.set('service', service)
  if (limit) params.set('limit', String(limit))
  return apiFetch<ErrorGroupsResponse>(`/api/v1/errors?${params}`)
}
