import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Grid3x3, WifiOff } from 'lucide-react'
import { fetchLatencyHeatmap } from '../api/latency_heatmap'
import { fetchServices } from '../api/apm'

const WINDOWS = ['15m', '1h', '6h', '24h'] as const
type Window = (typeof WINDOWS)[number]

// A reasonable step per window keeps the column count readable.
const STEP_FOR: Record<Window, string> = {
  '15m': '1m',
  '1h': '1m',
  '6h': '15m',
  '24h': '1h',
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`
  return `${ms.toFixed(0)}ms`
}

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

// Log-scaled intensity → heat color (dark slate → indigo → amber → red).
function heatColor(count: number, max: number): string {
  if (count <= 0 || max <= 0) return 'transparent'
  const t = Math.log(count + 1) / Math.log(max + 1) // 0..1
  // Piecewise gradient across four stops.
  const stops = [
    [30, 41, 59],    // slate-800
    [99, 102, 241],  // indigo-500
    [245, 158, 11],  // amber-500
    [239, 68, 68],   // red-500
  ]
  const seg = Math.min(Math.floor(t * 3), 2)
  const local = t * 3 - seg
  const [r1, g1, b1] = stops[seg]
  const [r2, g2, b2] = stops[seg + 1]
  const r = Math.round(r1 + (r2 - r1) * local)
  const g = Math.round(g1 + (g2 - g1) * local)
  const b = Math.round(b1 + (b2 - b1) * local)
  return `rgb(${r}, ${g}, ${b})`
}

export function LatencyHeatmapPage() {
  const [window, setWindow] = useState<Window>('1h')
  const [service, setService] = useState('')

  const { data: svcData } = useQuery({
    queryKey: ['services', '24h'],
    queryFn: () => fetchServices('24h'),
  })
  const services = svcData?.services?.map(s => s.name) ?? []

  const step = STEP_FOR[window]
  const { data, isLoading, error } = useQuery({
    queryKey: ['latencyHeatmap', window, step, service],
    queryFn: () => fetchLatencyHeatmap(window, step, service || undefined),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const columns = data?.columns ?? []
  // Latency bands slowest-first so the worst latency sits at the top of the grid.
  const bucketsDesc = [...(data?.buckets ?? [])].sort((a, b) => b.index - a.index)
  const max = data?.max_count ?? 0

  // Fast lookup of count by (ts, bucket).
  const lookup = new Map<string, number>()
  for (const c of data?.cells ?? []) {
    lookup.set(`${c.ts_ms}|${c.bucket}`, c.count)
  }

  // Sparse time-axis labels: show ~6 ticks to avoid clutter.
  const tickEvery = Math.max(1, Math.ceil(columns.length / 6))

  const hasData = columns.length > 0 && bucketsDesc.length > 0 && max > 0

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Grid3x3 size={18} style={{ color: 'var(--accent)' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Latency Heatmap</h1>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 18px' }}>
        Request count by latency band over time. Reveals bimodal distributions that percentiles hide.
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
          {WINDOWS.map(w => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: window === w ? 700 : 400,
                background: window === w ? 'var(--accent)' : 'transparent',
                color: window === w ? '#fff' : 'var(--muted)',
              }}
            >
              {w}
            </button>
          ))}
        </div>

        <select
          value={service}
          onChange={e => setService(e.target.value)}
          style={{
            fontSize: 12, padding: '5px 10px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', cursor: 'pointer',
          }}
        >
          <option value="">All services</option>
          {services.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <span style={{ fontSize: 11, color: 'var(--muted)' }}>step: {step}</span>
      </div>

      {/* Heatmap */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--health-critical)' }}>
          <WifiOff size={32} style={{ marginBottom: 8 }} />
          <div>Failed to load latency heatmap</div>
        </div>
      ) : !hasData ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>
          <Grid3x3 size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
          <div>No latency data in this window</div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, overflowX: 'auto' }}>
          <div style={{ minWidth: Math.max(640, columns.length * 14 + 70) }}>
            {/* Rows: one per latency band (slowest on top) */}
            {bucketsDesc.map(bk => (
              <div key={bk.index} style={{ display: 'flex', alignItems: 'center', height: 18, marginBottom: 1 }}>
                <div style={{
                  width: 64, flexShrink: 0, textAlign: 'right', paddingRight: 8,
                  fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace',
                }}>
                  {fmtMs(bk.low_ms)}
                </div>
                <div style={{ display: 'flex', flex: 1, gap: 1 }}>
                  {columns.map(ts => {
                    const count = lookup.get(`${ts}|${bk.index}`) ?? 0
                    return (
                      <div
                        key={ts}
                        title={`${fmtClock(ts)} · ${fmtMs(bk.low_ms)}–${fmtMs(bk.high_ms)}: ${count} req`}
                        style={{
                          flex: 1, height: '100%', minWidth: 6, borderRadius: 1,
                          background: count > 0 ? heatColor(count, max) : 'var(--surface)',
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Time axis */}
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
              <div style={{ width: 64, flexShrink: 0 }} />
              <div style={{ display: 'flex', flex: 1, gap: 1, position: 'relative' }}>
                {columns.map((ts, i) => (
                  <div key={ts} style={{ flex: 1, minWidth: 6, fontSize: 9, color: 'var(--muted)', textAlign: 'left', overflow: 'visible', whiteSpace: 'nowrap' }}>
                    {i % tickEvery === 0 ? fmtClock(ts) : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 10, color: 'var(--muted)' }}>
            <span>less</span>
            {[0.0001, 0.25, 0.5, 0.75, 1].map((t, i) => (
              <div key={i} style={{
                width: 18, height: 10, borderRadius: 2,
                background: heatColor(Math.round(Math.expm1(t * Math.log(max + 1))), max),
              }} />
            ))}
            <span>more (peak {max} req)</span>
          </div>
        </div>
      )}
    </div>
  )
}
