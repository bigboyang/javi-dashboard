import { apiFetch } from './client'
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

export function fetchDbQueries(window = '24h', service?: string): Promise<DbQueriesResponse> {
  const params = new URLSearchParams({ window })
  if (service) params.set('service', service)
  return apiFetch<DbQueriesResponse>(`/api/v1/db/queries?${params}`)
}
