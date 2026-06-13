import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart2, WifiOff } from 'lucide-react'
import { fetchHistogram, computePercentile } from '../api/histogram'
import type { HistogramMetric, HistogramPoint } from '../api/histogram'

const WINDOWS = ['1d', '7d', '30d'] as const

// ---- Bucket Bar Chart ----

function BucketChart({ bounds, counts }: { bounds: number[]; counts: number[] }) {
  const max = Math.max(...counts, 1)
  const totalW = 600
  const h = 60
  const barW = Math.max(Math.floor(totalW / Math.max(counts.length, 1)) - 2, 4)

  const label = (b: number) => {
    if (b >= 1000) return `${(b / 1000).toFixed(0)}k`
    return String(b)
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={totalW} height={h + 20} style={{ display: 'block' }}>
        {counts.map((c, i) => {
          const bh = (c / max) * h
          const x = i * (barW + 2)
          return (
            <g key={i}>
              <rect
                x={x} y={h - bh} width={barW} height={bh}
                fill="var(--accent)" opacity={0.7} rx={1}
              />
              {barW > 20 && (
                <text x={x + barW / 2} y={h + 14} textAnchor="middle"
                  fontSize={8} fill="var(--muted)">
                  {i < bounds.length ? label(bounds[i]) : '+Inf'}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ---- Percentile row from all points ----

function PercentileStats({ points }: { points: HistogramPoint[] }) {
  // Sum all bucket counts across all hours for overall distribution
  const allCounts = points.reduce<number[]>((acc, p) => {
    if (acc.length === 0) return [...p.bucket_counts]
    return acc.map((v, i) => v + (p.bucket_counts[i] ?? 0))
  }, [])
  const bounds = points[0]?.bounds ?? []

  const p50 = computePercentile(bounds, allCounts, 0.5)
  const p95 = computePercentile(bounds, allCounts, 0.95)
  const p99 = computePercentile(bounds, allCounts, 0.99)
  const totalCount = allCounts.reduce((a, b) => a + b, 0)
  const totalSum = points.reduce((a, p) => a + p.total_sum, 0)
  const avg = totalCount > 0 ? totalSum / totalCount : 0

  const fmt = (v: number) => {
    if (v >= 1000) return `${(v / 1000).toFixed(2)}k`
    return v.toFixed(2)
  }

  return (
    <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
      {[
        { label: 'avg', value: avg },
        { label: 'p50', value: p50 },
        { label: 'p95', value: p95 },
        { label: 'p99', value: p99 },
      ].map(({ label, value }) => (
        <div key={label} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>
            {label}
          </div>
          <div style={{
            fontSize: 18, fontWeight: 700,
            color: label === 'p99' ? 'var(--health-critical)' :
              label === 'p95' ? 'var(--health-warn)' : 'var(--text)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmt(value)}
          </div>
        </div>
      ))}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>
          total
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
          {totalCount.toLocaleString()}
        </div>
      </div>
    </div>
  )
}

// ---- Avg over time line chart ----

function AvgTimeline({ points }: { points: HistogramPoint[] }) {
  if (points.length < 2) return null
  const maxAvg = Math.max(...points.map(p => p.avg), 0.1)
  const W = 600
  const H = 50

  const pts = points.map((p, i) => ({
    x: (i / (points.length - 1)) * W,
    y: H - (p.avg / maxAvg) * H,
  }))

  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>avg over time</div>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      </svg>
    </div>
  )
}

// ---- Metric card ----

function MetricCard({ metric }: { metric: HistogramMetric }) {
  const [expanded, setExpanded] = useState(false)
  const latestPoint = metric.points[metric.points.length - 1]

  const shortMetric = metric.metric_name.split('.').slice(-2).join('.')

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16, marginBottom: 12,
    }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: 12 }}
        onClick={() => setExpanded(e => !e)}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {shortMetric}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {metric.metric_name} · {metric.service_name} · {metric.points.length} hours
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          {expanded ? '▲ collapse' : '▼ expand'}
        </div>
      </div>

      <PercentileStats points={metric.points} />

      {expanded && latestPoint && (
        <>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
            bucket distribution (latest hour)
          </div>
          <BucketChart bounds={latestPoint.bounds} counts={latestPoint.bucket_counts} />
          <AvgTimeline points={metric.points} />
        </>
      )}
    </div>
  )
}

// ---- Main page ----

export function HistogramDashboard() {
  const [window, setWindow] = useState<'1d' | '7d' | '30d'>('7d')
  const [serviceFilter, setServiceFilter] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['histogram', window, serviceFilter],
    queryFn: () => fetchHistogram(serviceFilter || undefined, undefined, window),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <BarChart2 size={20} color="var(--accent)" />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
          Histogram Percentiles
        </h2>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={serviceFilter}
          onChange={e => setServiceFilter(e.target.value)}
          placeholder="Service filter..."
          style={{
            padding: '6px 10px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--card)',
            color: 'var(--text)', fontSize: 12, width: 180,
          }}
        />
        {WINDOWS.map(w => (
          <button
            key={w}
            onClick={() => setWindow(w)}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12,
              border: '1px solid var(--border)',
              background: window === w ? 'var(--accent)' : 'var(--card)',
              color: window === w ? '#fff' : 'var(--text)',
              cursor: 'pointer',
            }}
          >
            {w}
          </button>
        ))}
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          Loading histogram data...
        </div>
      )}
      {error && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--health-critical)', fontSize: 13 }}>
          <WifiOff size={18} style={{ marginRight: 6 }} />
          Failed to load histogram data
        </div>
      )}
      {data && data.metrics.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          No histogram metrics found
        </div>
      )}
      {data && data.metrics.map(metric => (
        <MetricCard key={`${metric.service_name}|${metric.metric_name}`} metric={metric} />
      ))}
    </div>
  )
}
