import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Zap, WifiOff, ChevronDown, ChevronRight } from 'lucide-react'
import { fetchSlowSpans } from '../api/slow_spans'
import { fetchServices } from '../api/apm'
import type { SlowSpan } from '../api/slow_spans'

const WINDOWS = ['1h', '6h', '24h', '7d'] as const
type Window = (typeof WINDOWS)[number]

const MIN_MS_OPTIONS = [100, 200, 500, 1000, 2000]

const DB_ATTR_KEYS = ['db.system', 'db.query.text', 'db.statement', 'db.operation', 'db.name', 'peer.service']
const HTTP_ATTR_KEYS = ['http.method', 'http.url', 'http.status_code', 'http.target']

function fmtTime(ms: number) {
  const d = new Date(ms)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function durationColor(ms: number) {
  if (ms >= 2000) return 'var(--health-critical)'
  if (ms >= 500) return 'var(--health-warn)'
  return '#f59e0b'
}

function StatusBadge({ code }: { code: number }) {
  const label = code === 2 ? 'ERROR' : code === 1 ? 'OK' : 'UNSET'
  const color = code === 2 ? 'var(--health-critical)' : 'var(--muted)'
  return (
    <span style={{ fontSize: 10, color, fontWeight: code === 2 ? 700 : 400 }}>{label}</span>
  )
}

function AttrSection({ title, keys, attrs }: { title: string; keys: string[]; attrs: Record<string, string> }) {
  const entries = keys.filter(k => attrs[k]).map(k => [k, attrs[k]] as const)
  if (entries.length === 0) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </div>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 4, marginBottom: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{k}</span>
          <span style={{
            fontSize: 11, color: 'var(--text)', fontFamily: 'monospace',
            wordBreak: 'break-all', whiteSpace: 'pre-wrap',
          }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function SpanRow({ span }: { span: SlowSpan }) {
  const [open, setOpen] = useState(false)

  const knownKeys = new Set([...DB_ATTR_KEYS, ...HTTP_ATTR_KEYS])
  const otherAttrs = Object.entries(span.attrs ?? {}).filter(([k]) => !knownKeys.has(k))
  const hasAttrs = Object.keys(span.attrs ?? {}).length > 0

  return (
    <>
      <tr
        onClick={() => setOpen(v => !v)}
        style={{ borderBottom: open ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}
      >
        <td style={{ padding: '8px 8px', width: 20 }}>
          {open ? <ChevronDown size={12} style={{ color: 'var(--muted)' }} /> : <ChevronRight size={12} style={{ color: 'var(--muted)' }} />}
        </td>
        <td style={{ padding: '8px 8px', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
          {fmtTime(span.start_time_ms)}
        </td>
        <td style={{ padding: '8px 8px', fontSize: 12, color: 'var(--text)' }}>
          {span.service_name}
        </td>
        <td style={{ padding: '8px 8px', fontSize: 11, fontFamily: 'monospace', maxWidth: 300 }}>
          <span style={{
            display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--text)',
          }} title={span.name}>
            {span.name}
          </span>
        </td>
        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: durationColor(span.duration_ms),
            fontVariantNumeric: 'tabular-nums',
          }}>
            {span.duration_ms >= 1000
              ? `${(span.duration_ms / 1000).toFixed(2)}s`
              : `${span.duration_ms.toFixed(0)}ms`}
          </span>
        </td>
        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
          <StatusBadge code={span.status_code} />
        </td>
        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 10, color: 'var(--accent)' }}>
          {span.trace_id.slice(0, 8)}
        </td>
      </tr>
      {open && (
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <td colSpan={7} style={{ padding: '0 16px 14px 40px' }}>
            <div style={{
              background: 'var(--bg)', borderRadius: 6, padding: '12px 16px',
              border: '1px solid var(--border)',
            }}>
              {/* Core span info */}
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '3px 8px', marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>span_id</span>
                <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'monospace' }}>{span.span_id}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>trace_id</span>
                <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'monospace' }}>{span.trace_id}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>start_time</span>
                <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'monospace' }}>{new Date(span.start_time_ms).toISOString()}</span>
              </div>

              {/* Grouped attributes */}
              <AttrSection title="Database" keys={DB_ATTR_KEYS} attrs={span.attrs ?? {}} />
              <AttrSection title="HTTP" keys={HTTP_ATTR_KEYS} attrs={span.attrs ?? {}} />

              {/* Other attributes */}
              {otherAttrs.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Other Attributes
                  </div>
                  {otherAttrs.map(([k, v]) => (
                    <div key={k} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 4, marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{k}</span>
                      <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}

              {!hasAttrs && (
                <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                  No custom attributes on this span
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export function SlowSpansPage() {
  const [window, setWindow] = useState<Window>('1h')
  const [service, setService] = useState('')
  const [minMs, setMinMs] = useState(200)

  const { data: svcData } = useQuery({
    queryKey: ['services', '24h'],
    queryFn: () => fetchServices('24h'),
  })
  const services = svcData?.services?.map(s => s.name) ?? []

  const { data, isLoading, error } = useQuery({
    queryKey: ['slowSpans', window, service, minMs],
    queryFn: () => fetchSlowSpans(window, service || undefined, minMs),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const spans = data?.spans ?? []

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Zap size={18} style={{ color: '#f59e0b' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Slow Operations</h1>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 10,
          background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
        }}>
          {spans.length} spans
        </span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Window */}
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

        {/* Service filter */}
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

        {/* Min latency threshold */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Min latency:</span>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
            {MIN_MS_OPTIONS.map(ms => (
              <button
                key={ms}
                onClick={() => setMinMs(ms)}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: minMs === ms ? 700 : 400,
                  background: minMs === ms ? 'var(--accent)' : 'transparent',
                  color: minMs === ms ? '#fff' : 'var(--muted)',
                }}
              >
                {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
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
          <div>Failed to load slow spans</div>
        </div>
      ) : spans.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: 'var(--muted)',
          border: '1px dashed var(--border)', borderRadius: 8,
        }}>
          <Zap size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
          <div>No slow operations found</div>
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
            Try a wider window or lower the latency threshold
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 28 }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '38%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '13%' }} />
            </colgroup>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 8px' }} />
                <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Time</th>
                <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Service</th>
                <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Operation</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Duration</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Trace</th>
              </tr>
            </thead>
            <tbody>
              {spans.map(s => (
                <SpanRow key={`${s.trace_id}-${s.span_id}`} span={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
