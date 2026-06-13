export interface PodSummary {
  pod_name: string
  node_name: string
  namespace: string
  avg_cpu_m: number
  max_cpu_m: number
  cpu_limit_m: number
  avg_mem_bytes: number
  max_mem_bytes: number
  mem_limit_bytes: number
  last_seen_ms: number
}

export interface InfraPodsResponse {
  service: string
  window: string
  pods: PodSummary[]
  generated_at: string
}

export interface PodPoint {
  ts: number
  cpu_m: number
  mem_bytes: number
}

export interface InfraTimeseriesResponse {
  service: string
  pod_name: string
  points: PodPoint[]
  generated_at: string
}
