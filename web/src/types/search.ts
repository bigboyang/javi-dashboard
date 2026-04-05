export interface SearchResultItem {
  trace_id: string
  service_name: string
  score: number
  text: string
  timestamp_ms: number
}

export interface SearchResponse {
  query: string
  results: SearchResultItem[]
  total: number
}
