const BASE = '/api/v1'

export interface ProfilingSession {
  id: string
  service_name: string
  profile_type: string
  host: string
  duration_ms: number
  sampled_at: string
}

export interface ProfilingSessionsResponse {
  sessions: ProfilingSession[]
  generated_at: string
}

export interface ProfilingPayload {
  id: string
  service_name: string
  profile_type: string
  format: string
  payload: string
  host: string
  duration_ms: number
  sampled_at: string
}

export async function fetchProfilingSessions(
  service?: string,
  type?: string,
  limit = 20
): Promise<ProfilingSessionsResponse> {
  const params = new URLSearchParams()
  if (service) params.set('service', service)
  if (type) params.set('type', type)
  params.set('limit', String(limit))
  const res = await fetch(`${BASE}/profiling/sessions?${params}`)
  if (!res.ok) throw new Error('Failed to fetch profiling sessions')
  return res.json()
}

export async function fetchProfilingPayload(id: string): Promise<ProfilingPayload> {
  const res = await fetch(`${BASE}/profiling/sessions/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error('Failed to fetch profiling payload')
  return res.json()
}
