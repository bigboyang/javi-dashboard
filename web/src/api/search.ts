import type { SearchResponse } from '../types/search'

export async function fetchRAGSearch(
  query: string,
  service?: string,
  fromMs?: number,
  limit = 10,
): Promise<SearchResponse> {
  const res = await fetch('/api/v1/rag/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, service: service ?? '', from_ms: fromMs ?? 0, limit }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? res.statusText)
  }
  return res.json()
}
