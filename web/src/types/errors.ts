export interface ErrorGroup {
  fingerprint: number
  service_name: string
  exception_type: string
  exception_message: string
  total_count: number
  first_seen_ms: number
  last_seen_ms: number
  is_new: boolean  // first appeared within the selected window
}

export interface ErrorGroupsResponse {
  groups: ErrorGroup[]
  window: string
  generated_at: string
}
