import { useState, useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitCompare, CheckSquare, Square, BarChart2 } from 'lucide-react'
import { fetchServices, fetchServiceRed } from '../api/apm'
import type { DetailWindow } from '../types/apm'

const WINDOWS: DetailWindow[] = ['1h', '6h', '24h']
const STEP_MAP: Record<DetailWindow, string> = { '1h': '1m', '6h': '5m', '24h': '15m' }
const MAX_SERVICES = 3

const SERVICE_COLORS = [
  { line: '#6366f1', fill: 'rgba(99,102,241,0.15)' },   // indigo (accent)
  { line: '#10b981', fill: 'rgba(16,185,129,0.15)' },   // emerald
  { line: '#f59e0b', fill: 'rgba(245,158,11,0.15)' },   // amber
]

// -----------------------------------------------------------------------
// Sparkline
// -----------------------------------------------------------------------

function Sparkline({
  data,
  color,
  width = 220,
  height = 52,
}: {
  data: number[]
  color: string
  fill?: string
  width?: number
  height?: number
}) {
  const id = useId()
  const pL = 4
  const pR = 4
  const pT = 4
  const pB = 4
  const cW = width - pL - pR
  const cH = height - pT - pB

  if (data.length < 2) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
          fontSize: 9,
        }}
      >
        no data
      </div>
    )
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const toX = (i: number) => pL + (i / (data.length - 1)) * cW
  const toY = (v: number) => pT + cH - ((v - min) / range) * cH

  const linePath = data
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
    .join(' ')
  const areaPath =
    `M ${toX(0).toFixed(1)},${(pT + cH).toFixed(1)} ` +
    data.map((v, i) => `L ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ') +
    ` L ${toX(data.length - 1).toFixed(1)},${(pT + cH).toFixed(1)} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${id}-g)`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  )
}

// -----------------------------------------------------------------------
// Service Card
// -----------------------------------------------------------------------

function ServiceCard({
  service,
  window,
  colorIdx,
}: {
  service: string
  window: DetailWindow
  colorIdx: number
}) {
  const color = SERVICE_COLORS[colorIdx]

  const { data, isLoading } = useQuery({
    queryKey: ['service-red', service, window],
    queryFn: () => fetchServiceRed(service, window, STEP_MAP[window]),
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

  const series = data?.series ?? []
  const rateData = series.map((p) => p.rate)
  const errorRateData = series.map((p) => p.error_rate)
  const p95Data = series.map((p) => p.p95_ms)

  const latest = series[series.length - 1]

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${color.line}40`,
        borderRadius: 8,
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color.line,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {service}
        </span>
      </div>

      {/* Stats row */}
      {latest && (
        <div
          style={{
            display: 'flex',
            gap: 0,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <StatCell label="Rate" value={`${latest.rate.toFixed(1)}`} unit="r/m" color={color.line} />
          <StatCell
            label="Err%"
            value={`${(latest.error_rate * 100).toFixed(2)}`}
            unit="%"
            color={latest.error_rate > 0.05 ? 'var(--error)' : 'var(--success)'}
            dimmed={latest.error_rate <= 0.05}
          />
          <StatCell
            label="P95"
            value={`${latest.p95_ms.toFixed(0)}`}
            unit="ms"
            color={latest.p95_ms > 500 ? 'var(--warning)' : color.line}
          />
        </div>
      )}

      {/* Sparklines */}
      {isLoading && (
        <div style={{ padding: '24px 14px', color: 'var(--muted)', fontSize: 10, textAlign: 'center' }}>
          loading…
        </div>
      )}

      {!isLoading && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <MetricRow label="Rate" unit="req/min">
            <Sparkline data={rateData} color={color.line} fill={color.fill} />
          </MetricRow>
          <MetricRow label="Error Rate" unit="ratio">
            <Sparkline data={errorRateData} color="var(--error)" fill="rgba(239,68,68,0.12)" />
          </MetricRow>
          <MetricRow label="P95" unit="ms">
            <Sparkline data={p95Data} color="var(--warning)" fill="rgba(245,158,11,0.12)" />
          </MetricRow>
        </div>
      )}
    </div>
  )
}

function StatCell({
  label,
  value,
  unit,
  color,
  dimmed,
}: {
  label: string
  value: string
  unit: string
  color: string
  dimmed?: boolean
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: '6px 10px',
        borderRight: '1px solid var(--border)',
        textAlign: 'center',
        opacity: dimmed ? 0.6 : 1,
      }}
    >
      <div style={{ fontSize: 8, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
        <span style={{ fontSize: 8, fontWeight: 400, color: 'var(--muted)', marginLeft: 1 }}>{unit}</span>
      </div>
    </div>
  )
}

function MetricRow({ label, unit, children }: { label: string; unit: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 8, color: 'var(--muted)', marginBottom: 2, paddingLeft: 2 }}>
        {label} <span style={{ opacity: 0.6 }}>({unit})</span>
      </div>
      {children}
    </div>
  )
}

// -----------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------

export function MultiServiceComparison() {
  const [window, setWindow] = useState<DetailWindow>('1h')
  const [selected, setSelected] = useState<string[]>([])

  const { data: servicesData, isLoading: servicesLoading } = useQuery({
    queryKey: ['services', '5m'],
    queryFn: () => fetchServices('5m'),
    staleTime: 15_000,
  })

  const services = servicesData?.services ?? []

  function toggleService(name: string) {
    setSelected((prev) => {
      if (prev.includes(name)) return prev.filter((s) => s !== name)
      if (prev.length >= MAX_SERVICES) return prev
      return [...prev, name]
    })
  }

  return (
    <div style={{ padding: '16px 20px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <GitCompare size={14} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Multi-Service Comparison
          </h1>
          <span
            style={{
              fontSize: 9,
              background: 'rgba(99,102,241,0.15)',
              color: 'var(--accent)',
              borderRadius: 3,
              padding: '2px 6px',
            }}
          >
            PHASE 9-B
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
          Select up to {MAX_SERVICES} services to compare RED metrics side by side.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Left: service selector */}
        <div
          style={{
            width: 180,
            flexShrink: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {/* Selector header */}
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BarChart2 size={12} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>Services</span>
            </div>
            <span style={{ fontSize: 9, color: 'var(--muted)' }}>
              {selected.length}/{MAX_SERVICES}
            </span>
          </div>

          {/* Window buttons */}
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              gap: 4,
            }}
          >
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                style={{
                  flex: 1,
                  fontSize: 10,
                  padding: '3px 0',
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

          {/* Service list */}
          {servicesLoading && (
            <div style={{ padding: '12px', color: 'var(--muted)', fontSize: 10 }}>loading…</div>
          )}

          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {services.map((svc) => {
              const isSelected = selected.includes(svc.name)
              const colorIdx = selected.indexOf(svc.name)
              const disabled = !isSelected && selected.length >= MAX_SERVICES

              return (
                <button
                  key={svc.name}
                  onClick={() => toggleService(svc.name)}
                  disabled={disabled}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 12px',
                    background: isSelected ? `${SERVICE_COLORS[colorIdx]?.line}14` : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    opacity: disabled ? 0.4 : 1,
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                  }}
                >
                  {isSelected ? (
                    <CheckSquare
                      size={12}
                      style={{ color: SERVICE_COLORS[colorIdx]?.line, flexShrink: 0 }}
                    />
                  ) : (
                    <Square size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  )}
                  <span
                    style={{
                      fontSize: 10,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? SERVICE_COLORS[colorIdx]?.line : 'var(--text)',
                    }}
                  >
                    {svc.name}
                  </span>
                  {/* error dot */}
                  {svc.error_rate > 0.05 && (
                    <div
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: 'var(--error)',
                        flexShrink: 0,
                        marginLeft: 'auto',
                      }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: comparison cards */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {selected.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: 300,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                gap: 8,
                color: 'var(--muted)',
              }}
            >
              <GitCompare size={28} style={{ opacity: 0.3 }} />
              <p style={{ fontSize: 12, margin: 0 }}>Select services from the list to compare</p>
              <p style={{ fontSize: 10, margin: 0, opacity: 0.6 }}>Up to {MAX_SERVICES} services</p>
            </div>
          )}

          {selected.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${selected.length}, 1fr)`,
                gap: 12,
              }}
            >
              {selected.map((svc, idx) => (
                <ServiceCard key={svc} service={svc} window={window} colorIdx={idx} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
