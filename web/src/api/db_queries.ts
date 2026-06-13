export interface DbQuery {
  service_name: string
  db_system: string
  db_statement: string
  total_count: number
  avg_ms: number
  p95_ms: number
  error_count: number
}

export interface DbQueriesResponse {
  queries: DbQuery[]
  window: string
  generated_at: string
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json() as Promise<T>
}

export function fetchDbQueries(window = '24h', service?: string): Promise<DbQueriesResponse> {
  const params = new URLSearchParams({ window })
  if (service) params.set('service', service)
  return apiFetch<DbQueriesResponse>(`/api/v1/db/queries?${params}`)
}
