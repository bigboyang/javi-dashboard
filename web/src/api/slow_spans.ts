export interface SlowSpan {
  trace_id: string
  span_id: string
  service_name: string
  name: string
  duration_ms: number
  status_code: number
  start_time_ms: number
  attrs: Record<string, string>
}

export interface SlowSpansResponse {
  spans: SlowSpan[]
  window: string
  min_ms: number
  generated_at: string
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json() as Promise<T>
}

export function fetchSlowSpans(
  window = '1h',
  service?: string,
  minMs = 200,
  limit = 50,
): Promise<SlowSpansResponse> {
  const params = new URLSearchParams({ window, min_ms: String(minMs), limit: String(limit) })
  if (service) params.set('service', service)
  return apiFetch<SlowSpansResponse>(`/api/v1/spans/slow?${params}`)
}
