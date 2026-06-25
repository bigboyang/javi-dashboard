import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, WifiOff, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { fetchTopMovers } from '../api/top_movers'
import type { TopMover, TopMoverSort } from '../api/top_movers'

const WINDOWS = ['5m', '15m', '1h', '6h', '24h'] as const
type Window = (typeof WINDOWS)[number]

const SORTS: { key: TopMoverSort; label: string }[] = [
  { key: 'latency', label: 'Latency Δ' },
  { key: 'errors', label: 'Error Rate Δ' },
  { key: 'throughput', label: 'Throughput Δ' },
]

function fmtMs(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n.toFixed(0)}ms`
}

function fmtPct(frac: number) {
  return `${(frac * 100).toFixed(1)}%`
}

function fmtRate(n: number) {
  return `${n.toFixed(1)}/m`
}

// A delta is "bad" (red) when the metric went up for latency/errors. For the
// numeric sign we color: worse = red, better = green, flat = muted.
function deltaColor(delta: number, higherIsWorse = true): string {
  if (Math.abs(delta) < 1e-9) return 'var(--muted)'
  const worse = higherIsWorse ? delta > 0 : delta < 0
  return worse ? 'var(--health-critical, #ef4444)' : 'var(--success, #22c55e)'
}

function DeltaCell({
  delta,
  render,
  higherIsWorse = true,
}: {
  delta: number
  render: (d: number) => string
  higherIsWorse?: boolean
}) {
  const color = deltaColor(delta, higherIsWorse)
  const Icon = Math.abs(delta) < 1e-9 ? Minus : delta > 0 ? ArrowUp : ArrowDown
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        color,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <Icon size={11} />
      {render(Math.abs(delta))}
    </span>
  )
}

function MoverRow({ m }: { m: TopMover }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '8px 12px', fontSize: 12 }}>
        <Link
          to="/services/$name"
          params={{ name: m.name }}
          style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 600 }}
        >
          {m.name}
        </Link>
        {m.prev_requests === 0 && (
          <span
            style={{
              fontSize: 9,
              marginLeft: 6,
              padding: '1px 5px',
              borderRadius: 8,
              background: 'rgba(99,102,241,0.15)',
              color: 'var(--accent)',
            }}
          >
            NEW
          </span>
        )}
      </td>

      {/* p95: prev → cur */}
      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
        {fmtMs(m.prev_p95_ms)} → <span style={{ color: 'var(--text)' }}>{fmtMs(m.cur_p95_ms)}</span>
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12 }}>
        <DeltaCell delta={m.p95_delta_ms} render={fmtMs} />
      </td>

      {/* error rate: prev → cur */}
      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
        {fmtPct(m.prev_error_rate)} → <span style={{ color: 'var(--text)' }}>{fmtPct(m.cur_error_rate)}</span>
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12 }}>
        <DeltaCell delta={m.error_rate_delta} render={fmtPct} />
      </td>

      {/* throughput: prev → cur (higher is NOT worse; just informational) */}
      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
        {fmtRate(m.prev_rate)} → <span style={{ color: 'var(--text)' }}>{fmtRate(m.cur_rate)}</span>
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12 }}>
        <DeltaCell delta={m.cur_rate - m.prev_rate} render={fmtRate} higherIsWorse={false} />
      </td>
    </tr>
  )
}

export function TopMoversPage() {
  const [window, setWindow] = useState<Window>('1h')
  const [sort, setSort] = useState<TopMoverSort>('latency')

  const { data, isLoading, error } = useQuery({
    queryKey: ['topMovers', window, sort],
    queryFn: () => fetchTopMovers(window, sort),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const movers = data?.movers ?? []

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Top Movers</h1>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>
          {movers.length} services
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 18px' }}>
        Compares the current <strong>{window}</strong> window against the previous {window}. Largest regression first.
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Rank by:</span>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
            {SORTS.map(s => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: sort === s.key ? 700 : 400,
                  background: sort === s.key ? 'var(--accent)' : 'transparent',
                  color: sort === s.key ? '#fff' : 'var(--muted)',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--health-critical)' }}>
          <WifiOff size={32} style={{ marginBottom: 8 }} />
          <div>Failed to load top movers</div>
        </div>
      ) : movers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>
          <TrendingUp size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
          <div>No services with enough traffic to compare</div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Service</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>P95 (prev → cur)</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>P95 Δ</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Errors (prev → cur)</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Error Δ</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Rate (prev → cur)</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Rate Δ</th>
              </tr>
            </thead>
            <tbody>
              {movers.map(m => (
                <MoverRow key={m.name} m={m} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
