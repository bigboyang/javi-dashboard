import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bug, ChevronDown, ChevronRight, WifiOff } from 'lucide-react'
import { fetchErrorGroups } from '../api/errors'
import { fetchServices } from '../api/apm'
import type { ErrorGroup } from '../types/errors'

const WINDOWS = ['1h', '6h', '24h', '7d'] as const
type Window = (typeof WINDOWS)[number]

function fmtTime(ms: number) {
  const d = new Date(ms)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ago(ms: number) {
  const diff = Date.now() - ms
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

// -----------------------------------------------------------------------
// Row (expandable)
// -----------------------------------------------------------------------

function GroupRow({ g }: { g: ErrorGroup }) {
  const [open, setOpen] = useState(false)

  const countBadge = g.total_count >= 1000
    ? `${(g.total_count / 1000).toFixed(1)}k`
    : String(g.total_count)

  return (
    <>
      <tr
        onClick={() => setOpen(v => !v)}
        style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
      >
        <td style={{ padding: '10px 12px', width: 20 }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
        <td style={{ padding: '10px 0', maxWidth: 260 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--health-critical)', fontFamily: 'monospace' }}>
            {g.exception_type || '(unknown)'}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--muted)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280,
          }}>
            {g.exception_message}
          </div>
        </td>
        <td style={{ padding: '10px 12px', fontSize: 12 }}>{g.service_name}</td>
        <td style={{ padding: '10px 12px' }}>
          <span style={{
            fontSize: 12, fontWeight: 700,
            background: 'rgba(239,68,68,0.12)',
            color: 'var(--health-critical)',
            padding: '2px 8px', borderRadius: 10,
          }}>
            {countBadge}
          </span>
        </td>
        <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--muted)' }}>
          {ago(g.last_seen_ms)}
        </td>
        <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--muted)' }}>
          {fmtTime(g.first_seen_ms)}
        </td>
      </tr>
      {open && (
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <td />
          <td colSpan={5} style={{ padding: '0 12px 14px' }}>
            <div style={{
              background: 'var(--bg)', borderRadius: 6, padding: '12px 14px',
              fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              border: '1px solid var(--border)',
            }}>
              <div style={{ marginBottom: 6, color: 'var(--text)', fontWeight: 600 }}>
                {g.exception_type}
              </div>
              {g.exception_message}
              <div style={{ marginTop: 10, opacity: 0.6, fontSize: 10 }}>
                fingerprint: {g.fingerprint.toString(16).padStart(16, '0')} &nbsp;|&nbsp;
                first seen: {fmtTime(g.first_seen_ms)} &nbsp;|&nbsp;
                last seen: {fmtTime(g.last_seen_ms)}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------

export function ErrorGroupsPage() {
  const [window, setWindow] = useState<Window>('24h')
  const [service, setService] = useState('')
  const [search, setSearch] = useState('')

  const { data: svcData } = useQuery({
    queryKey: ['services', '24h'],
    queryFn: () => fetchServices('24h'),
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['errorGroups', window, service],
    queryFn: () => fetchErrorGroups(window, service || undefined),
  })

  const groups = (data?.groups ?? []).filter(g => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      g.exception_type.toLowerCase().includes(q) ||
      g.exception_message.toLowerCase().includes(q) ||
      g.service_name.toLowerCase().includes(q)
    )
  })

  const services = svcData?.services?.map(s => s.name) ?? []

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Bug size={18} style={{ color: 'var(--health-critical)' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Error Groups</h1>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 10,
          background: 'rgba(239,68,68,0.12)', color: 'var(--health-critical)',
        }}>
          {data?.groups.length ?? 0} groups
        </span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Window tabs */}
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

        {/* Search */}
        <input
          type="text"
          placeholder="Filter by type or message…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', flexGrow: 1, minWidth: 180,
          }}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--health-critical)' }}>
          <WifiOff size={32} style={{ marginBottom: 8 }} />
          <div>Failed to load error groups</div>
        </div>
      ) : groups.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: 'var(--muted)',
          border: '1px dashed var(--border)', borderRadius: 8,
        }}>
          <Bug size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
          <div>No errors in the selected window</div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: '40%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 12px' }} />
                <th style={{ padding: '8px 0', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Exception</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Service</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Count</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Last Seen</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>First Seen</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => <GroupRow key={`${g.fingerprint}-${g.service_name}`} g={g} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

