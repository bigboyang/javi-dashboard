const BASE = '/api/v1'

export interface ServiceCatalogEntry {
  service_name: string
  team: string
  slack_channel: string
  runbook_url: string
  tier: 'critical' | 'high' | 'standard' | 'low'
  on_call_rotation: string
  description: string
  updated_at: string
}

export interface CreateCatalogEntryRequest {
  service_name: string
  team?: string
  slack_channel?: string
  runbook_url?: string
  tier?: 'critical' | 'high' | 'standard' | 'low'
  on_call_rotation?: string
  description?: string
}

export async function fetchServiceCatalog(): Promise<{ entries: ServiceCatalogEntry[] }> {
  const res = await fetch(`${BASE}/catalog`)
  if (!res.ok) throw new Error('Failed to fetch service catalog')
  return res.json()
}

export async function upsertServiceCatalog(req: CreateCatalogEntryRequest): Promise<{ status: string }> {
  const res = await fetch(`${BASE}/catalog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to upsert service catalog entry')
  return res.json()
}

export async function deleteServiceCatalog(serviceName: string): Promise<{ status: string }> {
  const res = await fetch(`${BASE}/catalog?service=${encodeURIComponent(serviceName)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete catalog entry')
  return res.json()
}
