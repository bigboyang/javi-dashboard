import { useState, useId } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Activity, GitBranch, ScrollText } from 'lucide-react'
import { fetchServiceRed, fetchTraces, fetchLogs, fetchServices } from '../api/apm'
import type { DetailWindow } from '../types/apm'

const DETAIL_WINDOWS: DetailWindow[] = ['1h', '6h', '24h']
const STEP_MAP: Record<DetailWindow, string> = { '1h': '1m', '6h': '5m', '24h': '15m' }

// -----------------------------------------------------------------------
// Sparkline
// -----------------------------------------------------------------------

function Sparkline({
  data,
  color,
  label,
  unit,
  width = 280,
  height = 56,
}: {
  data: number[]
  color: string
  label: string
  unit: string
  width?: number
  height?: number
}) {
  const id = useId()
  const pL = 38
  const pR = 6
  const pT = 4
  const pB = 14
  const cW = width - pL - pR
  const cH = height - pT - pB

  if (data.length < 2) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 10 }}>
        no data
      </div>
    )
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const toX = (i: number) => pL + (i / (data.length - 1)) * cW
  const toY = (v: number) => pT + cH - ((v - min) / range) * cH

  const linePath = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
  const areaPath =
    `M ${toX(0).toFixed(1)},${(pT + cH).toFixed(1)} ` +
    data.map((v, i) => `L ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ') +
    ` L ${toX(data.length - 1).toFixed(1)},${(pT + cH).toFixed(1)} Z`

  const ticks = [min, max]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {ticks.map((t, ti) => (
        <g key={ti}>
          <text
            x={pL - 3}
            y={toY(t) + 4}
            textAnchor="end"
            style={{ fontSize: 7, fill: 'var(--muted)', fontFamily: 'inherit' }}
          >
            {t < 1 ? (t * 100).toFixed(1) + '%' : t.toFixed(0)}
          </text>
        </g>
      ))}
      <path d={areaPath} fill={`url(#${id}-fill)`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} />
      <text
        x={pL + cW / 2}
        y={height - 2}
        textAnchor="middle"
        style={{ fontSize: 8, fill: 'var(--muted)', fontFamily: 'inherit' }}
      >
        {label} ({unit})
      </text>
    </svg>
  )
}

// -----------------------------------------------------------------------
// Service Detail Page
// -----------------------------------------------------------------------

interface ServiceDetailPageProps {
  serviceName: string
}

export function ServiceDetailPage({ serviceName }: ServiceDetailPageProps) {
  const [window, setWindow] = useState<DetailWindow>('1h')

  const { data: servicesData } = useQuery({
    queryKey: ['services', '5m'],
    queryFn: () => fetchServices('5m'),
    staleTime: 15_000,
  })

  const { data: redData, isLoading: redLoading } = useQuery({
    queryKey: ['service-red', serviceName, window],
    queryFn: () => fetchServiceRed(serviceName, window, STEP_MAP[window]),
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

  const { data: tracesData, isLoading: tracesLoading } = useQuery({
    queryKey: ['traces-service', serviceName, '1h'],
    queryFn: () => fetchTraces('1h', serviceName, 20),
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['logs-service', serviceName, '1h'],
    queryFn: () => fetchLogs('1h', serviceName, undefined, undefined, 50),
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

  const summary = servicesData?.services.find((s) => s.name === serviceName)
  const series = redData?.series ?? []
  const rateData = series.map((p) => p.rate)
  const errorRateData = series.map((p) => p.error_rate)
  const p95Data = series.map((p) => p.p95_ms)
  const traces = tracesData?.traces ?? []
  const logs = logsData?.logs ?? []

  return (
    <div style={{ padding: '16px 20px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Back + header */}
      <div style={{ marginBottom: 14 }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            color: 'var(--muted)',
            textDecoration: 'none',
            marginBottom: 8,
          }}
        >
          <ArrowLeft size={11} /> Overview
        </Link>
        <h1
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text)',
            margin: '0 0 4px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {serviceName}
          <span
            style={{
              fontSize: 9,
              background: 'rgba(99,102,241,0.15)',
              color: 'var(--accent)',
              borderRadius: 3,
              padding: '2px 6px',
              fontWeight: 400,
            }}
          >
            SERVICE DETAIL
          </span>
        </h1>
        {summary && (
          <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--muted)' }}>
            <span>
              Rate:{' '}
              <strong style={{ color: 'var(--text)' }}>{summary.rate.toFixed(1)} req/min</strong>
            </span>
            <span>
              Error rate:{' '}
              <strong style={{ color: summary.error_rate > 0.05 ? 'var(--error)' : 'var(--success)' }}>
                {(summary.error_rate * 100).toFixed(2)}%
              </strong>
            </span>
            <span>
              P95:{' '}
              <strong style={{ color: summary.p95_ms > 500 ? 'var(--warning)' : 'var(--text)' }}>
                {summary.p95_ms.toFixed(1)}ms
              </strong>
            </span>
          </div>
        )}
      </div>

      {/* RED Charts */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '14px 16px',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Activity size={12} style={{ color: 'var(--accent)' }} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            RED Metrics
          </span>
          <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
            {DETAIL_WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                style={{
                  fontSize: 10,
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: window === w ? 'rgba(99,102,241,0.2)' : 'var(--border)',
                  color: window === w ? 'var(--accent)' : 'var(--muted)',
                  fontFamily: 'inherit',
                  fontWeight: window === w ? 700 : 400,
                }}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {redLoading && (
          <div style={{ color: 'var(--muted)', fontSize: 11 }}>loading…</div>
        )}

        {!redLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Sparkline data={rateData} color="var(--accent)" label="Rate" unit="req/min" />
            <Sparkline data={errorRateData} color="var(--error)" label="Error rate" unit="ratio" />
            <Sparkline data={p95Data} color="var(--warning)" label="P95" unit="ms" />
          </div>
        )}
      </div>

      {/* Traces & Logs side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Traces */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <GitBranch size={12} style={{ color: 'var(--accent)' }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Recent Traces
            </span>
            <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 'auto' }}>
              last 1h · {tracesData?.total ?? 0} total
            </span>
          </div>

          {tracesLoading && (
            <div style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: 11 }}>loading…</div>
          )}

          {!tracesLoading && traces.length === 0 && (
            <div style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: 11 }}>No traces found.</div>
          )}

          {traces.map((t) => (
            <div
              key={t.trace_id}
              style={{
                padding: '7px 14px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: t.status_code === 2 ? 'var(--error)' : 'var(--success)',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.root_operation}
                </div>
                <div style={{ fontSize: 9, color: 'var(--muted)' }}>
                  {t.duration_ms.toFixed(1)}ms · {t.span_count} spans
                </div>
              </div>
              <div style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>
                {new Date(t.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>
          ))}
        </div>

        {/* Logs */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ScrollText size={12} style={{ color: 'var(--accent)' }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Recent Logs
            </span>
            <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 'auto' }}>
              last 1h · {logsData?.total ?? 0} total
            </span>
          </div>

          {logsLoading && (
            <div style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: 11 }}>loading…</div>
          )}

          {!logsLoading && logs.length === 0 && (
            <div style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: 11 }}>No logs found.</div>
          )}

          <div style={{ maxHeight: 380, overflow: 'auto' }}>
            {logs.map((log, i) => (
              <div
                key={`${log.timestamp_nano}-${i}`}
                style={{
                  padding: '5px 14px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    flexShrink: 0,
                    color: logLevelColor(log.severity_text),
                    minWidth: 36,
                  }}
                >
                  {log.severity_text.slice(0, 4)}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--text)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {log.body}
                </span>
                <span style={{ fontSize: 8, color: 'var(--muted)', flexShrink: 0 }}>
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function logLevelColor(level: string): string {
  switch (level.toUpperCase()) {
    case 'ERROR':
    case 'FATAL':
      return 'var(--error)'
    case 'WARN':
    case 'WARNING':
      return 'var(--warning)'
    case 'DEBUG':
      return 'var(--muted)'
    default:
      return 'var(--success)'
  }
}
