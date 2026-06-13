import type { ErrorGroupsResponse } from '../types/errors'

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

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
