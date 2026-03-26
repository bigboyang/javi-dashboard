import { useState, useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { fetchServiceRed } from '../api/apm'
import type { RedPoint, DetailWindow, ServiceSummary } from '../types/apm'

interface ServiceDetailProps {
  serviceName: string
  summary: ServiceSummary | undefined
  onClose: () => void
}

const DETAIL_WINDOWS: DetailWindow[] = ['1h', '6h', '24h']

const STEP_MAP: Record<DetailWindow, string> = {
  '1h': '1m',
  '6h': '5m',
  '24h': '15m',
}

// --- SVG Sparkline ---

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color: string
  /** If provided, renders a filled area under the line */
  fill?: boolean
  label: string
  unit: string
  /** Format function for y-axis tick labels */
  formatY: (v: number) => string
  /** Timestamps for x-axis */
  timestamps: string[]
}

function Sparkline({
  data,
  width = 300,
  height = 60,
  color,
  fill = false,
  label,
  unit,
  formatY,
  timestamps,
}: SparklineProps) {
  const id = useId()
  const paddingLeft = 46
  const paddingRight = 8
  const paddingTop = 6
  const paddingBottom = 20

  const chartW = width - paddingLeft - paddingRight
  const chartH = height - paddingTop - paddingBottom

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ width, height, color: 'var(--muted)' }}
      >
        no data
      </div>
    )
  }

  const minVal = Math.min(...data)
  const maxVal = Math.max(...data)
  const range = maxVal - minVal || 1

  const toX = (i: number) => paddingLeft + (i / (data.length - 1)) * chartW
  const toY = (v: number) => paddingTop + chartH - ((v - minVal) / range) * chartH

  // Build SVG path
  const points = data.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
  const linePath = `M ${points.join(' L ')}`
  const areaPath =
    `M ${toX(0).toFixed(1)},${(paddingTop + chartH).toFixed(1)} ` +
    `L ${points.join(' L ')} ` +
    `L ${toX(data.length - 1).toFixed(1)},${(paddingTop + chartH).toFixed(1)} Z`

  // Y-axis ticks: min, mid, max
  const yTicks = [maxVal, (maxVal + minVal) / 2, minVal]

  // X-axis ticks: first, middle, last timestamp labels
  const xTickIndices =
    timestamps.length >= 3
      ? [0, Math.floor((timestamps.length - 1) / 2), timestamps.length - 1]
      : [0]

  const formatTime = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  return (
    <div>
      <div className="text-xs mb-1 flex items-baseline justify-between">
        <span style={{ color: 'var(--muted)' }}>{label}</span>
        <span style={{ color }}>
          {formatY(data[data.length - 1])}{' '}
          <span style={{ color: 'var(--muted)', fontSize: '10px' }}>{unit}</span>
        </span>
      </div>
      <svg
        width={width}
        height={height}
        style={{ display: 'block', overflow: 'visible' }}
        aria-label={`${label} sparkline chart`}
        role="img"
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
          <clipPath id={`${id}-clip`}>
            <rect
              x={paddingLeft}
              y={paddingTop}
              width={chartW}
              height={chartH}
            />
          </clipPath>
        </defs>

        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <line
            key={i}
            x1={paddingLeft}
            y1={toY(tick).toFixed(1)}
            x2={paddingLeft + chartW}
            y2={toY(tick).toFixed(1)}
            stroke="var(--border)"
            strokeWidth={0.5}
            strokeDasharray={i === 0 || i === 2 ? 'none' : '2,3'}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((tick, i) => (
          <text
            key={i}
            x={paddingLeft - 4}
            y={Number(toY(tick).toFixed(1)) + 3}
            textAnchor="end"
            fontSize={8}
            fill="var(--muted)"
            fontFamily="inherit"
          >
            {formatY(tick)}
          </text>
        ))}

        {/* Area fill */}
        {fill && (
          <path
            d={areaPath}
            fill={`url(#${id}-fill)`}
            clipPath={`url(#${id}-clip)`}
          />
        )}

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath={`url(#${id}-clip)`}
        />

        {/* Last point dot */}
        <circle
          cx={toX(data.length - 1).toFixed(1)}
          cy={toY(data[data.length - 1]).toFixed(1)}
          r={2.5}
          fill={color}
        />

        {/* X-axis labels */}
        {xTickIndices.map((idx) => (
          <text
            key={idx}
            x={toX(idx).toFixed(1)}
            y={paddingTop + chartH + 14}
            textAnchor={
              idx === 0 ? 'start' : idx === timestamps.length - 1 ? 'end' : 'middle'
            }
            fontSize={8}
            fill="var(--muted)"
            fontFamily="inherit"
          >
            {timestamps[idx] ? formatTime(timestamps[idx]) : ''}
          </text>
        ))}

        {/* Y-axis border */}
        <line
          x1={paddingLeft}
          y1={paddingTop}
          x2={paddingLeft}
          y2={paddingTop + chartH}
          stroke="var(--border)"
          strokeWidth={1}
        />
      </svg>
    </div>
  )
}

// --- Metric badge ---

function MetricBadge({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs" style={{ color: 'var(--muted)', fontSize: '10px' }}>
        {label}
      </span>
      <span className="text-sm font-medium" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

// --- Main component ---

export function ServiceDetail({ serviceName, summary, onClose }: ServiceDetailProps) {
  const [detailWindow, setDetailWindow] = useState<DetailWindow>('1h')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['service-red', serviceName, detailWindow],
    queryFn: () => fetchServiceRed(serviceName, detailWindow, STEP_MAP[detailWindow]),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const series = data?.series ?? []
  const timestamps = series.map((p: RedPoint) => p.ts)
  const rateData = series.map((p: RedPoint) => p.rate)
  const errorData = series.map((p: RedPoint) => p.error_rate * 100)
  const p95Data = series.map((p: RedPoint) => p.p95_ms)

  const errorRateColor = (rate: number) => {
    if (rate < 0.01) return 'var(--success)'
    if (rate < 0.05) return 'var(--warning)'
    return 'var(--error)'
  }

  const latencyColor = (ms: number) => {
    if (ms < 100) return 'var(--success)'
    if (ms < 500) return 'var(--warning)'
    return 'var(--error)'
  }

  return (
    <div
      className="border-t"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--surface)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {serviceName}
          </h2>

          {/* RED metric badges from summary */}
          {summary && (
            <div
              className="flex items-center gap-5 pl-4 border-l"
              style={{ borderColor: 'var(--border)' }}
            >
              <MetricBadge
                label="RATE"
                value={`${summary.rate.toFixed(2)}/m`}
                color="var(--accent)"
              />
              <MetricBadge
                label="ERRORS"
                value={`${(summary.error_rate * 100).toFixed(2)}%`}
                color={errorRateColor(summary.error_rate)}
              />
              <MetricBadge
                label="P50"
                value={`${summary.p50_ms.toFixed(1)}ms`}
                color={latencyColor(summary.p50_ms)}
              />
              <MetricBadge
                label="P95"
                value={`${summary.p95_ms.toFixed(1)}ms`}
                color={latencyColor(summary.p95_ms)}
              />
              <MetricBadge
                label="P99"
                value={`${summary.p99_ms.toFixed(1)}ms`}
                color={latencyColor(summary.p99_ms)}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Window selector */}
          <div className="flex items-center gap-1">
            {DETAIL_WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setDetailWindow(w)}
                className="px-2 py-1 text-xs rounded transition-colors"
                style={{
                  background:
                    detailWindow === w ? 'rgba(99,102,241,0.2)' : 'transparent',
                  color: detailWindow === w ? 'var(--accent)' : 'var(--muted)',
                  border: `1px solid ${detailWindow === w ? 'rgba(99,102,241,0.4)' : 'transparent'}`,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {w}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--muted)', cursor: 'pointer', background: 'transparent', border: 'none' }}
            aria-label="Close detail panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Charts */}
      <div className="px-4 py-4">
        {isLoading && (
          <div className="flex gap-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <div
                  className="h-3 w-24 rounded animate-pulse mb-2"
                  style={{ background: 'var(--border)' }}
                />
                <div
                  className="rounded animate-pulse"
                  style={{ width: 300, height: 60, background: 'var(--border)' }}
                />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <p className="text-sm py-4" style={{ color: 'var(--error)' }}>
            Failed to load time-series data for {serviceName}.
          </p>
        )}

        {!isLoading && !isError && (
          <div className="flex flex-wrap gap-x-10 gap-y-6">
            <Sparkline
              data={rateData}
              timestamps={timestamps}
              color="var(--accent)"
              fill
              label="Request Rate"
              unit="req/min"
              formatY={(v) => v.toFixed(1)}
            />
            <Sparkline
              data={errorData}
              timestamps={timestamps}
              color={
                summary && summary.error_rate > 0.05
                  ? 'var(--error)'
                  : summary && summary.error_rate > 0.01
                    ? 'var(--warning)'
                    : 'var(--success)'
              }
              fill
              label="Error Rate"
              unit="%"
              formatY={(v) => v.toFixed(2) + '%'}
            />
            <Sparkline
              data={p95Data}
              timestamps={timestamps}
              color={
                summary && summary.p95_ms > 500
                  ? 'var(--error)'
                  : summary && summary.p95_ms > 100
                    ? 'var(--warning)'
                    : 'var(--success)'
              }
              fill
              label="P95 Latency"
              unit="ms"
              formatY={(v) => v.toFixed(0)}
            />
          </div>
        )}

        {!isLoading && !isError && series.length === 0 && (
          <p className="text-sm py-4" style={{ color: 'var(--muted)' }}>
            No time-series data available for the selected window.
          </p>
        )}
      </div>
    </div>
  )
}
