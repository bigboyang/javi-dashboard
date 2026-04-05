// Phase 8: JVM Analytics types

export interface JvmSnapshot {
  service_name: string
  timestamp_nano: number
  heap_used_bytes: number
  heap_committed_bytes: number
  heap_max_bytes: number
  gc_count_delta: number
  gc_pause_ms_total_delta: number
  gc_collection_name: string
  thread_count: number
  thread_peak: number
  thread_daemon: number
  process_cpu_utilization: number
  system_cpu_utilization: number
}

export interface DependencyEdge {
  source: string
  target: string
  p_value: number
  max_lag: number
  updated_at: string
}

export interface DependencyCausesResponse {
  service: string
  root_causes: string[]
  upstream_edges: DependencyEdge[]
}
