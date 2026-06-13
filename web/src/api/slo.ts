export interface SLODefinition {
  service_name: string
  slo_name: string
  window_hours: number
  target_pct: number
  metric_type: 'error_rate' | 'latency_p95' | 'latency_p99'
  threshold_ms: number
  updated_at: string
}

export interface SLOBurnAlert {
  service_name: string
  slo_name: string
  burn_rate: number
  window: string
  severity: string
  alerted_at: string
}

export interface SLOStatusItem extends SLODefinition {
  current_error_rate: number
  compliant: boolean
  burn_alerts: SLOBurnAlert[]
}

export interface SLOStatusResponse {
  items: SLOStatusItem[]
  generated_at: string
}

export interface CreateSLORequest {
  service_name: string
  slo_name: string
  window_hours: number
  target_pct: number
  metric_type: 'error_rate' | 'latency_p95' | 'latency_p99'
  threshold_ms: number
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json() as Promise<T>
}

export function fetchSLODefinitions(): Promise<{ definitions: SLODefinition[] }> {
  return apiFetch('/api/v1/slo/definitions')
}

export function fetchSLOStatus(): Promise<SLOStatusResponse> {
  return apiFetch('/api/v1/slo/status')
}

export function createSLO(req: CreateSLORequest): Promise<{ status: string }> {
  return apiFetch('/api/v1/slo/definitions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

export function deleteSLO(service: string, name: string): Promise<{ status: string }> {
  return apiFetch(
    `/api/v1/slo/definitions/${encodeURIComponent(service)}/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  )
}
