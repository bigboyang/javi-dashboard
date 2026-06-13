import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, WifiOff, ChevronDown, ChevronRight } from 'lucide-react'
import { fetchDbQueries } from '../api/db_queries'
import { fetchServices } from '../api/apm'
import type { DbQuery } from '../api/db_queries'

const WINDOWS = ['1h', '6h', '24h', '7d'] as const
type Window = (typeof WINDOWS)[number]

const DB_COLORS: Record<string, string> = {
  mysql: '#f59e0b',
  postgresql: '#6366f1',
  postgres: '#6366f1',
  h2: '#10b981',
  redis: '#ef4444',
  mongodb: '#22c55e',
  sqlite: '#94a3b8',
}

function dbColor(system: string) {
  return DB_COLORS[system.toLowerCase()] ?? 'var(--muted)'
}

function durationColor(ms: number) {
  if (ms >= 500) return 'var(--health-critical)'
  if (ms >= 100) return 'var(--health-warn)'
  return 'var(--text)'
}

function fmtMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${ms.toFixed(1)}ms`
}

function DbSystemBadge({ system }: { system: string }) {
  const color = dbColor(system)
  return (
    <span style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 700,
      background: `${color}22`, color, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {system}
    </span>
  )
}

function QueryRow({ q }: { q: DbQuery }) {
  const [open, setOpen] = useState(false)
  const errorPct = q.total_count > 0 ? ((q.error_count / q.total_count) * 100).toFixed(1) : '0'

  const preview = q.db_statement
    ? q.db_statement.replace(/\s+/g, ' ').slice(0, 80) + (q.db_statement.length > 80 ? '…' : '')
    : '(no statement)'

  return (
    <>
      <tr
        onClick={() => setOpen(v => !v)}
        style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
      >
        <td style={{ padding: '10px 12px', width: 20 }}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </td>
        <td style={{ padding: '10px 8px' }}>
          <DbSystemBadge system={q.db_system} />
        </td>
        <td style={{ padding: '10px 0', maxWidth: 360 }}>
          <div style={{
            fontSize: 11, fontFamily: 'monospace', color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={q.db_statement}>
            {preview}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
            {q.service_name}
          </div>
        </td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{q.total_count.toLocaleString()}</span>
        </td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: durationColor(q.avg_ms) }}>
            {fmtMs(q.avg_ms)}
          </span>
        </td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: durationColor(q.p95_ms) }}>
            {fmtMs(q.p95_ms)}
          </span>
        </td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
          {q.error_count > 0 ? (
            <span style={{ fontSize: 11, color: 'var(--health-critical)', fontWeight: 600 }}>
              {q.error_count} ({errorPct}%)
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--health-ok)' }}>0</span>
          )}
        </td>
      </tr>
      {open && q.db_statement && (
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <td colSpan={7} style={{ padding: '0 16px 14px 48px' }}>
            <div style={{
              background: 'var(--bg)', borderRadius: 6, padding: '10px 14px',
              fontFamily: 'monospace', fontSize: 11, color: 'var(--text)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              border: '1px solid var(--border)', lineHeight: 1.6,
            }}>
              {q.db_statement}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export function DbQueryPage() {
  const [window, setWindow] = useState<Window>('24h')
  const [service, setService] = useState('')

  const { data: svcData } = useQuery({
    queryKey: ['services', '24h'],
    queryFn: () => fetchServices('24h'),
  })
  const services = svcData?.services?.map(s => s.name) ?? []

  const { data, isLoading, error } = useQuery({
    queryKey: ['dbQueries', window, service],
    queryFn: () => fetchDbQueries(window, service || undefined),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const queries = data?.queries ?? []

  const totalCalls = queries.reduce((s, q) => s + q.total_count, 0)
  const totalErrors = queries.reduce((s, q) => s + q.error_count, 0)

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Database size={18} style={{ color: '#f59e0b' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Database Queries</h1>
        {queries.length > 0 && (
          <>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10,
              background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
            }}>
              {queries.length} unique queries
            </span>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10,
              background: 'rgba(99,102,241,0.1)', color: 'var(--accent)',
            }}>
              {totalCalls.toLocaleString()} calls
            </span>
            {totalErrors > 0 && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: 'rgba(239,68,68,0.12)', color: 'var(--health-critical)',
              }}>
                {totalErrors} errors
              </span>
            )}
          </>
        )}
      </div>

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
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--health-critical)' }}>
          <WifiOff size={32} style={{ marginBottom: 8 }} />
          <div>Failed to load database queries</div>
        </div>
      ) : queries.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: 'var(--muted)',
          border: '1px dashed var(--border)', borderRadius: 8,
        }}>
          <Database size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
          <div>No database queries found</div>
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
            Requires spans with db.system attribute from javi-agent instrumentation
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 32 }} />
              <col style={{ width: 70 }} />
              <col />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 100 }} />
            </colgroup>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 12px' }} />
                <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>DB</th>
                <th style={{ padding: '8px 0', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Statement / Service</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Calls</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Avg</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>P95</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Errors</th>
              </tr>
            </thead>
            <tbody>
              {queries.map((q, i) => (
                <QueryRow key={`${q.service_name}-${q.db_system}-${i}`} q={q} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
