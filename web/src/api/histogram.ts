const BASE = '/api/v1'

export interface HistogramPoint {
  hour: string
  total_count: number
  total_sum: number
  avg: number
  bucket_counts: number[]
  bounds: number[]
}

export interface HistogramMetric {
  metric_name: string
  service_name: string
  points: HistogramPoint[]
}

export interface HistogramResponse {
  metrics: HistogramMetric[]
  window: string
  generated_at: string
}

export async function fetchHistogram(
  service?: string,
  metric?: string,
  window = '7d'
): Promise<HistogramResponse> {
  const params = new URLSearchParams({ window })
  if (service) params.set('service', service)
  if (metric) params.set('metric', metric)
  const res = await fetch(`${BASE}/metrics/histogram?${params}`)
  if (!res.ok) throw new Error('Failed to fetch histogram data')
  return res.json()
}

// Compute approximate percentile from histogram bucket counts + bounds.
// Uses linear interpolation within the matching bucket.
// bounds[i] is the upper bound of bucket i; counts[i] is the count in that bucket.
export function computePercentile(
  bounds: number[],
  counts: number[],
  p: number // 0-1
): number {
  const total = counts.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  const target = total * p
  let cumulative = 0
  for (let i = 0; i < counts.length; i++) {
    cumulative += counts[i]
    if (cumulative >= target) {
      const lowerBound = i === 0 ? 0 : bounds[i - 1]
      const upperBound = bounds[i] ?? bounds[bounds.length - 1]
      const prevCumulative = cumulative - counts[i]
      if (counts[i] === 0) return lowerBound
      const fraction = (target - prevCumulative) / counts[i]
      return lowerBound + fraction * (upperBound - lowerBound)
    }
  }
  return bounds[bounds.length - 1] ?? 0
}
