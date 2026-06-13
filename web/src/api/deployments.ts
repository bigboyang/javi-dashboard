const BASE = '/api/v1'

export interface DeploymentEvent {
  id: string
  service_name: string
  version: string
  environment: string
  deployed_by: string
  description: string
  deployed_at: string
}

export interface DeploymentEventsResponse {
  events: DeploymentEvent[]
  generated_at: string
}

export interface CreateDeploymentRequest {
  service_name: string
  version: string
  environment?: 'production' | 'staging' | 'development'
  deployed_by?: string
  description?: string
}

export async function fetchDeploymentEvents(
  service?: string,
  env?: string,
  limit = 50
): Promise<DeploymentEventsResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (service) params.set('service', service)
  if (env) params.set('env', env)
  const res = await fetch(`${BASE}/deployments?${params}`)
  if (!res.ok) throw new Error('Failed to fetch deployment events')
  return res.json()
}

export async function createDeploymentEvent(req: CreateDeploymentRequest): Promise<{ status: string; id: string }> {
  const res = await fetch(`${BASE}/deployments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create deployment event')
  return res.json()
}
