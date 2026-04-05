import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Coffee, WifiOff, Activity } from 'lucide-react'
import { fetchJVMServices, fetchJVMHealth, fetchJVMHistory } from '../api/jvm'
import type { JvmSnapshot } from '../types/jvm'

const HISTORY_WINDOWS = [
  { label: '1h', minutes: 60 },
  { label: '3h', minutes: 180 },
  { label: '12h', minutes: 720 },
] as const

type HistoryWindow = (typeof HISTORY_WINDOWS)[number]

// -----------------------------------------------------------------------
// Gauge
// -----------------------------------------------------------------------

function HeapGauge({ used, max }: { used: number; max: number }) {
  const id = useId()
  const pct = max > 0 ? Math.min(used / max, 1) : 0
  const color = pct > 0.85 ? 'var(--health-critical)' : pct > 0.7 ? 'var(--health-warn)' : 'var(--health-ok)'
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const dashoffset = circumference * (1 - pct)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={90} height={90} viewBox="0 0 90 90">
        <defs>
          <linearGradient id={`${id}-grad`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity={0.6} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        {/* Background ring */}
        <circle cx={45} cy={45} r={radius} fill="none" stroke="var(--border)" strokeWidth={8} />
        {/* Progress ring */}
        <circle
          cx={45}
          cy={45}
          r={radius}
          fill="none"
          stroke={`url(#${id}-grad)`}
          strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
          transform="rotate(-90 45 45)"
        />
        {/* Text */}
        <text x={45} y={42} textAnchor="middle" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--text)', fontFamily: 'inherit' }}>
          {(pct * 100).toFixed(0)}%
        </text>
        <text x={45} y={55} textAnchor="middle" style={{ fontSize: 8, fill: 'var(--muted)', fontFamily: 'inherit' }}>
          heap
        </text>
      </svg>
      <div style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center' }}>
        {fmtMB(used)} / {fmtMB(max)}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------
// Heap History Chart (SVG)
// -----------------------------------------------------------------------

function HeapHistoryChart({ snapshots }: { snapshots: JvmSnapshot[] }) {
  const id = useId()
  if (snapshots.length < 2) return null

  const W = 480
  const H = 80
  const pL = 40
  const pR = 8
  const pT = 6
  const pB = 16
  const chartW = W - pL - pR
  const chartH = H - pT - pB

  const heapPcts = snapshots.map((s) =>
    s.heap_max_bytes > 0 ? (s.heap_used_bytes / s.heap_max_bytes) * 100 : 0,
  )
  const maxPct = Math.max(...heapPcts, 1)

  const toX = (i: number) => pL + (i / (snapshots.length - 1)) * chartW
  const toY = (v: number) => pT + chartH - (v / maxPct) * chartH

  const linePath = heapPcts
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
    .join(' ')

  const areaPath =
    `M ${toX(0).toFixed(1)},${(pT + chartH).toFixed(1)} ` +
    heapPcts.map((v, i) => `L ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ') +
    ` L ${toX(heapPcts.length - 1).toFixed(1)},${(pT + chartH).toFixed(1)} Z`

  // Y-axis ticks
  const ticks = [0, 50, 100]

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', maxWidth: '100%' }}>
      <defs>
        <linearGradient id={`${id}-area`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--health-ok)" stopOpacity={0.25} />
          <stop offset="100%" stopColor="var(--health-ok)" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Y-axis ticks */}
      {ticks.map((t) => (
        <g key={t}>
          <text
            x={pL - 4}
            y={toY((t / 100) * maxPct) + 4}
            textAnchor="end"
            style={{ fontSize: 7, fill: 'var(--muted)', fontFamily: 'inherit' }}
          >
            {t}%
          </text>
          <line
            x1={pL}
            y1={toY((t / 100) * maxPct)}
            x2={pL + chartW}
            y2={toY((t / 100) * maxPct)}
            stroke="var(--border)"
            strokeWidth={0.5}
          />
        </g>
      ))}

      {/* Area */}
      <path d={areaPath} fill={`url(#${id}-area)`} />
      {/* Line */}
      <path d={linePath} fill="none" stroke="var(--health-ok)" strokeWidth={1.5} />
    </svg>
  )
}

// -----------------------------------------------------------------------
// Stat card
// -----------------------------------------------------------------------

function StatCard({
  label,
  value,
  unit,
  color,
}: {
  label: string
  value: string | number
  unit?: string
  color?: string
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '10px 14px',
        minWidth: 100,
      }}
    >
      <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color ?? 'var(--text)', display: 'flex', alignItems: 'baseline', gap: 3 }}>
        {value}
        {unit && <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 400 }}>{unit}</span>}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------
// JVM Dashboard
// -----------------------------------------------------------------------

export function JVMDashboard() {
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>(HISTORY_WINDOWS[0])

  const { data: services, isLoading: servicesLoading, error: servicesError } = useQuery({
    queryKey: ['jvm-services'],
    queryFn: fetchJVMServices,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  })

  // Auto-select first service
  const service = selectedService ?? services?.[0] ?? null

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['jvm-health', service],
    queryFn: () => fetchJVMHealth(service!),
    enabled: !!service,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  })

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['jvm-history', service, historyWindow.minutes],
    queryFn: () => fetchJVMHistory(service!, historyWindow.minutes),
    enabled: !!service,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  })

  const unavailable = servicesError || (!servicesLoading && (services ?? []).length === 0)

  return (
    <div style={{ padding: '16px 20px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <h1
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text)',
            margin: '0 0 4px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Coffee size={15} style={{ color: 'var(--warning)' }} />
          JVM Analytics
          <span
            style={{
              fontSize: 9,
              background: 'rgba(245,158,11,0.15)',
              color: 'var(--warning)',
              borderRadius: 3,
              padding: '2px 6px',
              fontWeight: 400,
              letterSpacing: '0.04em',
            }}
          >
            JAVA RUNTIME
          </span>
        </h1>
        <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>
          {service ? `Showing JVM metrics for ${service}` : 'No JVM data received yet'}
        </p>
      </div>

      {unavailable && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            background: 'rgba(99,102,241,0.07)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--muted)',
            fontSize: 11,
            marginBottom: 14,
          }}
        >
          <WifiOff size={13} />
          javi-forecast JVM feature store unavailable — ensure javi-agent is sending JVM metrics.
        </div>
      )}

      {/* Controls */}
      {(services ?? []).length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={service ?? ''}
            onChange={(e) => setSelectedService(e.target.value)}
            style={{
              fontSize: 10,
              padding: '4px 8px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {(services ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: 2 }}>
            {HISTORY_WINDOWS.map((w) => (
              <button
                key={w.label}
                onClick={() => setHistoryWindow(w)}
                style={{
                  fontSize: 10,
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: historyWindow.label === w.label ? 'rgba(245,158,11,0.2)' : 'var(--border)',
                  color: historyWindow.label === w.label ? 'var(--warning)' : 'var(--muted)',
                  fontFamily: 'inherit',
                  fontWeight: historyWindow.label === w.label ? 700 : 400,
                }}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {healthLoading && (
        <div style={{ color: 'var(--muted)', fontSize: 11 }}>loading JVM snapshot…</div>
      )}

      {health && (
        <>
          {/* Stats grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto repeat(4, 1fr)',
              gap: 10,
              marginBottom: 14,
              alignItems: 'start',
            }}
          >
            {/* Heap gauge */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <HeapGauge used={health.heap_used_bytes} max={health.heap_max_bytes} />
            </div>

            <StatCard
              label="Heap Used"
              value={fmtMB(health.heap_used_bytes)}
              unit="MB"
              color={
                health.heap_max_bytes > 0 && health.heap_used_bytes / health.heap_max_bytes > 0.85
                  ? 'var(--health-critical)'
                  : 'var(--text)'
              }
            />
            <StatCard label="Threads" value={health.thread_count} />
            <StatCard
              label="GC Count"
              value={health.gc_count_delta}
              unit={health.gc_collection_name ? health.gc_collection_name.slice(0, 12) : undefined}
            />
            <StatCard
              label="Process CPU"
              value={(health.process_cpu_utilization * 100).toFixed(1)}
              unit="%"
              color={health.process_cpu_utilization > 0.8 ? 'var(--health-critical)' : undefined}
            />
          </div>

          {/* Secondary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            <StatCard label="Heap Committed" value={fmtMB(health.heap_committed_bytes)} unit="MB" />
            <StatCard label="Heap Max" value={fmtMB(health.heap_max_bytes)} unit="MB" />
            <StatCard label="Thread Peak" value={health.thread_peak} />
            <StatCard
              label="GC Pause"
              value={health.gc_pause_ms_total_delta.toFixed(1)}
              unit="ms"
              color={health.gc_pause_ms_total_delta > 500 ? 'var(--health-warn)' : undefined}
            />
          </div>
        </>
      )}

      {/* Heap history chart */}
      {(history ?? []).length >= 2 && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            <Activity size={12} style={{ color: 'var(--health-ok)' }} />
            Heap Usage History — {historyWindow.label}
            {historyLoading && (
              <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>
                refreshing…
              </span>
            )}
          </div>
          <HeapHistoryChart snapshots={history ?? []} />
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function fmtMB(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1)
}
