import type { JvmSnapshot, DependencyEdge, DependencyCausesResponse } from '../types/jvm'

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

export function fetchJVMServices(): Promise<string[]> {
  return apiFetch<string[]>('/api/v1/jvm/services')
}

export function fetchJVMHealth(service: string): Promise<JvmSnapshot> {
  return apiFetch<JvmSnapshot>(`/api/v1/jvm/health/${encodeURIComponent(service)}`)
}

export function fetchJVMHistory(service: string, windowMinutes = 60): Promise<JvmSnapshot[]> {
  return apiFetch<JvmSnapshot[]>(
    `/api/v1/jvm/history/${encodeURIComponent(service)}?window_minutes=${windowMinutes}`,
  )
}

export function fetchDependencyGraph(): Promise<DependencyEdge[]> {
  return apiFetch<DependencyEdge[]>('/api/v1/dependency/graph')
}

export function fetchDependencyCauses(service: string): Promise<DependencyCausesResponse> {
  return apiFetch<DependencyCausesResponse>(
    `/api/v1/dependency/${encodeURIComponent(service)}/causes`,
  )
}
