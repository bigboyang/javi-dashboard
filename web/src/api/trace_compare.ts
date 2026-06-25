import { apiFetch } from './client'

export interface TraceCompareNode {
  path_key: string
  operation: string
  service: string
  depth: number
  present_a: boolean
  present_b: boolean
  duration_a_ms: number
  duration_b_ms: number
  self_a_ms: number
  self_b_ms: number
  delta_ms: number
}

export interface TraceCompareResponse {
  trace_a: string
  trace_b: string
  total_a_ms: number
  total_b_ms: number
  nodes: TraceCompareNode[]
}

export function fetchTraceCompare(a: string, b: string): Promise<TraceCompareResponse> {
  const params = new URLSearchParams({ a, b })
  return apiFetch<TraceCompareResponse>(`/api/v1/traces/compare?${params}`)
}
