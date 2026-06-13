import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Radio, Pause, Play, GitBranch, ScrollText, BarChart2, AlertCircle, Trash2 } from 'lucide-react'
import { fetchLive } from '../api/live'
import type { LiveEvent, LiveSignal, LiveStats } from '../api/live'

const POLL_MS = 2000
const MAX_BUFFER = 600

const SIGNAL_META: Record<LiveSignal, { label: string; icon: typeof GitBranch; color: string }> = {
  span: { label: 'Spans', icon: GitBranch, color: '#6366f1' },
  log: { label: 'Logs', icon: ScrollText, color: '#10b981' },
  metric: { label: 'Metrics', icon: BarChart2, color: '#f59e0b' },
}

function eventKey(e: LiveEvent): string {
  return `${e.type}:${e.trace_id ?? ''}:${e.span_id ?? ''}:${e.time_ms}:${e.title}`
}

function severityColor(sev: string): string {
  if (sev === 'error') return 'var(--health-critical)'
  if (sev === 'warn') return 'var(--health-warn)'
  return 'var(--muted)'
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString([], { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function fmtDuration(ms?: number): string {
  if (ms == null) return ''
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}

function fmtValue(v?: number): string {
  if (v == null) return ''
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(2)
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: typeof GitBranch
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 130,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon size={13} style={{ color }} />
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function TypeBadge({ type }: { type: LiveSignal }) {
  const meta = SIGNAL_META[type]
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: meta.color,
        background: `${meta.color}1f`,
        padding: '2px 6px',
        borderRadius: 4,
        whiteSpace: 'nowrap',
      }}
    >
      {type}
    </span>
  )
}

function EventRow({ e }: { e: LiveEvent }) {
  const sevColor = severityColor(e.severity)
  return (
    <div
      className="live-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 56px 150px 1fr 90px',
        gap: 10,
        alignItems: 'center',
        padding: '6px 12px',
        borderBottom: '1px solid var(--border)',
        borderLeft: `2px solid ${e.severity === 'info' ? 'transparent' : sevColor}`,
        fontSize: 12,
      }}
    >
      <span style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'var(--muted)' }}>{fmtTime(e.time_ms)}</span>
      <TypeBadge type={e.type} />
      <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.service}>
        {e.service}
      </span>
      <div style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {e.severity === 'error' && <AlertCircle size={12} style={{ color: sevColor, flexShrink: 0 }} />}
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 11.5,
            color: e.severity === 'error' ? sevColor : 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={e.title}
        >
          {e.title}
        </span>
        {e.detail && (
          <span style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }} title={e.detail}>
            {e.detail}
          </span>
        )}
      </div>
      <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--muted)' }}>
        {e.type === 'span' ? fmtDuration(e.duration_ms) : e.type === 'metric' ? fmtValue(e.value) : ''}
      </span>
    </div>
  )
}

export function LiveStream() {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [stats, setStats] = useState<LiveStats | null>(null)
  const [paused, setPaused] = useState(false)
  const [connected, setConnected] = useState(true)
  const [service, setService] = useState('')
  const [enabled, setEnabled] = useState<Set<LiveSignal>>(new Set(['span', 'log', 'metric']))
  const [knownServices, setKnownServices] = useState<string[]>([])

  const cursorRef = useRef(0)
  const seenRef = useRef<Set<string>>(new Set())
  const pausedRef = useRef(paused)
  const serviceRef = useRef(service)
  pausedRef.current = paused
  serviceRef.current = service

  // Reset the buffer when the service filter changes — the cursor and dedup
  // set are scoped to the current filter.
  useEffect(() => {
    cursorRef.current = 0
    seenRef.current = new Set()
    setEvents([])
  }, [service])

  const poll = useCallback(async () => {
    if (pausedRef.current) return
    try {
      const res = await fetchLive(cursorRef.current, serviceRef.current || undefined)
      setConnected(true)
      setStats(res.stats)
      if (res.stats.active_services.length) {
        setKnownServices((prev) => Array.from(new Set([...prev, ...res.stats.active_services])).sort())
      }
      const fresh = res.events.filter((e) => {
        const k = eventKey(e)
        if (seenRef.current.has(k)) return false
        seenRef.current.add(k)
        return true
      })
      if (fresh.length > 0) {
        setEvents((prev) => {
          const merged = [...fresh, ...prev].slice(0, MAX_BUFFER)
          // Keep the dedup set from growing unbounded with the buffer.
          if (seenRef.current.size > MAX_BUFFER * 2) {
            seenRef.current = new Set(merged.map(eventKey))
          }
          return merged
        })
      }
      cursorRef.current = Math.max(cursorRef.current, res.latest_ms)
    } catch {
      setConnected(false)
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  const visible = useMemo(() => events.filter((e) => enabled.has(e.type)), [events, enabled])

  const toggleSignal = (s: LiveSignal) => {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      // Never allow an empty filter — re-enable the one just turned off.
      if (next.size === 0) next.add(s)
      return next
    })
  }

  const serviceOptions = useMemo(
    () => Array.from(new Set([...knownServices, ...(stats?.active_services ?? [])])).sort(),
    [knownServices, stats],
  )

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
      <style>{`@keyframes liveIn{from{background:rgba(99,102,241,0.18)}to{background:transparent}}.live-row{animation:liveIn 1.2s ease-out}@keyframes livePulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Radio size={18} style={{ color: 'var(--accent)' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Live Stream</h1>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            padding: '3px 9px',
            borderRadius: 12,
            color: connected && !paused ? '#10b981' : 'var(--muted)',
            background: connected && !paused ? 'rgba(16,185,129,0.12)' : 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: connected ? (paused ? 'var(--muted)' : '#10b981') : 'var(--health-critical)',
              animation: connected && !paused ? 'livePulse 1.4s ease-in-out infinite' : 'none',
            }}
          />
          {!connected ? 'DISCONNECTED' : paused ? 'PAUSED' : 'LIVE'}
        </span>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setPaused((p) => !p)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={() => {
            seenRef.current = new Set()
            setEvents([])
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--muted)',
            cursor: 'pointer',
          }}
        >
          <Trash2 size={13} />
          Clear
        </button>
      </div>

      {/* Throughput stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <StatCard
          icon={GitBranch}
          label="Spans / min"
          value={fmtValue(stats?.spans_per_min ?? 0)}
          sub={stats ? `${stats.span_errors_per_min} errors` : undefined}
          color={SIGNAL_META.span.color}
        />
        <StatCard
          icon={ScrollText}
          label="Logs / min"
          value={fmtValue(stats?.logs_per_min ?? 0)}
          sub={stats ? `${stats.log_errors_per_min} errors` : undefined}
          color={SIGNAL_META.log.color}
        />
        <StatCard
          icon={BarChart2}
          label="Metrics / min"
          value={fmtValue(stats?.metrics_per_min ?? 0)}
          color={SIGNAL_META.metric.color}
        />
        <StatCard
          icon={AlertCircle}
          label="Error rate"
          value={
            stats && stats.spans_per_min > 0
              ? `${((stats.span_errors_per_min / stats.spans_per_min) * 100).toFixed(1)}%`
              : '0%'
          }
          sub={stats ? `${stats.active_services.length} active services` : undefined}
          color="var(--health-critical)"
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
          {(Object.keys(SIGNAL_META) as LiveSignal[]).map((s) => {
            const meta = SIGNAL_META[s]
            const on = enabled.has(s)
            const Icon = meta.icon
            return (
              <button
                key={s}
                onClick={() => toggleSignal(s)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 11px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: on ? 700 : 400,
                  background: on ? meta.color : 'transparent',
                  color: on ? '#fff' : 'var(--muted)',
                }}
              >
                <Icon size={12} />
                {meta.label}
              </button>
            )
          })}
        </div>

        <select
          value={service}
          onChange={(e) => setService(e.target.value)}
          style={{
            fontSize: 12,
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          <option value="">All services</option>
          {serviceOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {visible.length} events buffered
        </span>
      </div>

      {/* Feed */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg)',
        }}
      >
        {/* Column header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '120px 56px 150px 1fr 90px',
            gap: 10,
            padding: '8px 12px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <span>Time</span>
          <span>Type</span>
          <span>Service</span>
          <span>Event</span>
          <span style={{ textAlign: 'right' }}>Value</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {visible.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
              <Radio size={32} style={{ marginBottom: 10, opacity: 0.3 }} />
              <div>{connected ? 'Waiting for telemetry…' : 'Cannot reach collector'}</div>
              <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
                Live events from the agent appear here as they arrive
              </div>
            </div>
          ) : (
            visible.map((e) => <EventRow key={eventKey(e)} e={e} />)
          )}
        </div>
      </div>
    </div>
  )
}
