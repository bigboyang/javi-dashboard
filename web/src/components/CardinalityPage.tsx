import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, WifiOff } from 'lucide-react'
import { fetchCardinalityKeys, fetchCardinalityValues } from '../api/cardinality'
import { fetchServices } from '../api/apm'

const WINDOWS = ['15m', '1h', '6h', '24h'] as const
type Window = (typeof WINDOWS)[number]

function fmtMs(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n.toFixed(0)}ms`
}

function latencyColor(ms: number): string {
  if (ms < 100) return 'var(--success)'
  if (ms < 500) return 'var(--warning)'
  return 'var(--error)'
}

export function CardinalityPage() {
  const [window, setWindow] = useState<Window>('1h')
  const [service, setService] = useState('')
  const [key, setKey] = useState('')

  const { data: svcData } = useQuery({
    queryKey: ['services', '24h'],
    queryFn: () => fetchServices('24h'),
  })
  const services = svcData?.services?.map(s => s.name) ?? []

  const { data: keysData } = useQuery({
    queryKey: ['cardinalityKeys', window, service],
    queryFn: () => fetchCardinalityKeys(window, service || undefined),
    staleTime: 30_000,
  })
  const keys = keysData?.keys ?? []

  const { data, isLoading, error } = useQuery({
    queryKey: ['cardinalityValues', key, window, service],
    queryFn: () => fetchCardinalityValues(key, window, service || undefined),
    enabled: !!key,
    staleTime: 15_000,
  })
  const values = data?.values ?? []

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Layers size={18} style={{ color: 'var(--accent)' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Cardinality Explorer</h1>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 18px' }}>
        Break down latency &amp; errors by the values of a span attribute. Reveals which tag value is driving slowness.
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
          onChange={e => { setService(e.target.value); setKey('') }}
          style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
        >
          <option value="">All services</option>
          {services.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={key}
          onChange={e => setKey(e.target.value)}
          style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', minWidth: 220, fontFamily: 'monospace' }}
        >
          <option value="">Select attribute key…</option>
          {keys.map(k => <option key={k.key} value={k.key}>{k.key} ({k.count.toLocaleString()})</option>)}
        </select>
      </div>

      {/* Table */}
      {!key ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>
          <Layers size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
          <div>Select an attribute key to break down</div>
          {keys.length === 0 && (
            <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>No attribute keys found in this window</div>
          )}
        </div>
      ) : isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--health-critical)' }}>
          <WifiOff size={32} style={{ marginBottom: 8 }} />
          <div>Failed to load breakdown</div>
        </div>
      ) : values.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>
          No values for <span style={{ fontFamily: 'monospace' }}>{key}</span>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                  <span style={{ fontFamily: 'monospace' }}>{key}</span>
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>p95</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Error %</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {values.map(v => (
                <tr key={v.value} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', fontSize: 12, fontFamily: 'monospace', color: 'var(--text)', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.value}>
                    {v.value}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: latencyColor(v.p95_ms) }}>
                    {fmtMs(v.p95_ms)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: v.error_rate > 0.01 ? 'var(--error)' : 'var(--muted)' }}>
                    {(v.error_rate * 100).toFixed(1)}%
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                    {v.count.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
