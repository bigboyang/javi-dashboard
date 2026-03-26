import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMetricNames, fetchMetricSeries } from '../api/apm'
import type { MetricName, MetricPoint, TimeWindow } from '../types/apm'

const WINDOWS: TimeWindow[] = ['5m', '15m', '1h', '6h', '24h']
const STEPS: Record<TimeWindow, string[]> = {
  '5m': ['1m'],
  '15m': ['1m', '5m'],
  '1h': ['1m', '5m', '15m'],
  '6h': ['5m', '15m', '1h'],
  '24h': ['15m', '1h'],
}

function fmtValue(v: number): string {
  if (v === 0) return '0'
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(2)}K`
  return v % 1 === 0 ? String(v) : v.toFixed(3)
}

function typeColor(t: string): string {
  switch (t) {
    case 'gauge': return 'var(--accent)'
    case 'sum': return 'var(--success)'
    case 'histogram': return '#f59e0b'
    default: return 'var(--muted)'
  }
}

// Minimal spark-line chart rendered as an SVG polyline.
function Sparkline({ series }: { series: MetricPoint[] }) {
  if (series.length < 2) return null

  const W = 160
  const H = 36
  const values = series.map((p) => p.avg)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W
      const y = H - ((v - min) / range) * H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline
        points={pts}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  )
}

// Bar chart for time-series data shown in the detail panel.
function MetricChart({ series, metricType }: { series: MetricPoint[]; metricType: string }) {
  if (series.length === 0) return (
    <p className="text-xs" style={{ color: 'var(--muted)' }}>No data in this window</p>
  )

  const W = 560
  const H = 120
  const PAD = { top: 8, right: 8, bottom: 24, left: 48 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const vals = series.map((p) => p.avg)
  const dataMin = Math.min(...vals)
  const dataMax = Math.max(...vals)
  const range = dataMax - dataMin || 1

  const barW = Math.max(2, (chartW / series.length) - 1)

  const scaleY = (v: number) => chartH - ((v - dataMin) / range) * chartH

  // Y-axis tick labels
  const ticks = [dataMin, dataMin + range * 0.5, dataMax]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', maxWidth: W, height: 'auto', overflow: 'visible' }}
    >
      <g transform={`translate(${PAD.left}, ${PAD.top})`}>
        {/* Grid lines */}
        {ticks.map((tick, i) => {
          const y = scaleY(tick)
          return (
            <g key={i}>
              <line
                x1={0} y1={y} x2={chartW} y2={y}
                stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,3"
              />
              <text
                x={-4} y={y + 3}
                textAnchor="end" fontSize={9} fill="var(--muted)"
              >
                {fmtValue(tick)}
              </text>
            </g>
          )
        })}

        {/* Bars */}
        {series.map((p, i) => {
          const x = (i / series.length) * chartW
          const y = scaleY(p.avg)
          const barH = chartH - y
          const hasData = p.count > 0
          return (
            <rect
              key={i}
              x={x}
              y={hasData ? y : chartH}
              width={barW}
              height={hasData ? Math.max(1, barH) : 0}
              fill={typeColor(metricType)}
              opacity={0.75}
              rx={1}
            />
          )
        })}

        {/* X-axis baseline */}
        <line
          x1={0} y1={chartH} x2={chartW} y2={chartH}
          stroke="var(--border)" strokeWidth={1}
        />

        {/* X-axis labels: first & last bucket time */}
        {series.length > 0 && (
          <>
            <text x={0} y={chartH + 14} fontSize={9} fill="var(--muted)">
              {new Date(series[0].ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </text>
            <text x={chartW} y={chartH + 14} textAnchor="end" fontSize={9} fill="var(--muted)">
              {new Date(series[series.length - 1].ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </text>
          </>
        )}
      </g>
    </svg>
  )
}

interface DetailState {
  metric: MetricName
}

interface Props {
  services: string[]
}

export function MetricsExplorer({ services }: Props) {
  const [window, setWindow] = useState<TimeWindow>('5m')
  const [step, setStep] = useState('1m')
  const [serviceFilter, setServiceFilter] = useState('')
  const [detail, setDetail] = useState<DetailState | null>(null)

  const availableSteps = STEPS[window]

  const { data: namesData, isLoading, isError } = useQuery({
    queryKey: ['metricNames', window, serviceFilter],
    queryFn: () => fetchMetricNames(window, serviceFilter || undefined),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const { data: seriesData } = useQuery({
    queryKey: ['metricSeries', detail?.metric.name, window, step, serviceFilter],
    queryFn: () =>
      fetchMetricSeries(
        detail!.metric.name,
        window,
        step,
        serviceFilter || undefined,
      ),
    enabled: !!detail,
    staleTime: 10_000,
  })

  const handleWindowChange = (w: TimeWindow) => {
    setWindow(w)
    const steps = STEPS[w]
    if (!steps.includes(step)) setStep(steps[0])
    setDetail(null)
  }

  const handleMetricClick = (m: MetricName) => {
    setDetail((prev) => (prev?.metric.name === m.name ? null : { metric: m }))
  }

  const metrics = namesData?.metrics ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            Custom Metrics
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            OTLP metric instruments — gauge · sum · histogram
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Service filter */}
          <select
            value={serviceFilter}
            onChange={(e) => { setServiceFilter(e.target.value); setDetail(null) }}
            className="text-xs px-2 py-1 rounded"
            style={{
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
          >
            <option value="">All services</option>
            {services.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Step selector (only shown when detail open) */}
          {detail && (
            <div className="flex gap-1">
              {availableSteps.map((s) => (
                <button
                  key={s}
                  onClick={() => setStep(s)}
                  className="px-2 py-1 rounded text-xs font-medium transition-colors"
                  style={{
                    background: step === s ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: step === s ? 'var(--accent)' : 'var(--muted)',
                    border: step === s ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Window selector */}
          <div className="flex gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => handleWindowChange(w)}
                className="px-2 py-1 rounded text-xs font-medium transition-colors"
                style={{
                  background: window === w ? 'rgba(99,102,241,0.15)' : 'transparent',
                  color: window === w ? 'var(--accent)' : 'var(--muted)',
                  border: window === w ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                }}
              >
                {w}
              </button>
            ))}
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-1.5 ml-1">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--success)', boxShadow: '0 0 4px var(--success)' }}
            />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              live · 30s
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Metric list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <p className="text-xs p-6" style={{ color: 'var(--muted)' }}>Loading metrics…</p>
          )}
          {isError && (
            <p className="text-xs p-6" style={{ color: 'var(--error)' }}>Failed to load metrics</p>
          )}
          {!isLoading && !isError && metrics.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48">
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                No metrics found
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                Widen the time window or ingest OTLP metric data
              </p>
            </div>
          )}
          {!isLoading && metrics.length > 0 && (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Metric', 'Type', 'Service', 'Data Points', 'Last Value', 'Min', 'Max', 'Trend'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left font-medium"
                      style={{ color: 'var(--muted)', background: 'var(--surface)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => {
                  const isActive = detail?.metric.name === m.name
                  return (
                    <tr
                      key={m.name}
                      onClick={() => handleMetricClick(m)}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isActive ? 'rgba(99,102,241,0.06)' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <td className="px-4 py-2 font-mono" style={{ color: 'var(--text)', maxWidth: 240 }}>
                        <span className="truncate block">{m.name}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className="px-1.5 py-0.5 rounded text-xs"
                          style={{
                            background: `${typeColor(m.metric_type)}22`,
                            color: typeColor(m.metric_type),
                          }}
                        >
                          {m.metric_type || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>
                        {m.service_name || '—'}
                      </td>
                      <td className="px-4 py-2 font-mono" style={{ color: 'var(--muted)' }}>
                        {m.data_points.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 font-mono font-semibold" style={{ color: 'var(--text)' }}>
                        {fmtValue(m.last_value)}
                      </td>
                      <td className="px-4 py-2 font-mono" style={{ color: 'var(--muted)' }}>
                        {fmtValue(m.min_value)}
                      </td>
                      <td className="px-4 py-2 font-mono" style={{ color: 'var(--muted)' }}>
                        {fmtValue(m.max_value)}
                      </td>
                      <td className="px-4 py-2">
                        {seriesData && isActive ? (
                          <Sparkline series={seriesData.series} />
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {detail && (
          <div
            className="flex-shrink-0 w-80 border-l overflow-y-auto"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="p-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-mono font-semibold break-all leading-snug"
                    style={{ color: 'var(--text)' }}
                  >
                    {detail.metric.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="px-1.5 py-0.5 rounded text-xs"
                      style={{
                        background: `${typeColor(detail.metric.metric_type)}22`,
                        color: typeColor(detail.metric.metric_type),
                        fontSize: '10px',
                      }}
                    >
                      {detail.metric.metric_type || 'unknown'}
                    </span>
                    {detail.metric.service_name && (
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        {detail.metric.service_name}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setDetail(null)}
                  className="text-xs px-2 py-1 rounded ml-2 shrink-0"
                  style={{ color: 'var(--muted)', background: 'var(--border)' }}
                >
                  ✕
                </button>
              </div>

              {/* Stats grid */}
              <div
                className="grid grid-cols-3 gap-2 mb-4 p-3 rounded"
                style={{ background: 'var(--bg)' }}
              >
                <StatCell label="Last" value={fmtValue(detail.metric.last_value)} />
                <StatCell label="Min" value={fmtValue(detail.metric.min_value)} />
                <StatCell label="Max" value={fmtValue(detail.metric.max_value)} />
                <StatCell label="Data Points" value={detail.metric.data_points.toLocaleString()} />
              </div>

              {/* Chart */}
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>
                avg · {window} window · {step} step
              </p>
              {seriesData ? (
                <MetricChart series={seriesData.series} metricType={seriesData.metric_type} />
              ) : (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Loading series…</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-sm font-medium font-mono mt-0.5" style={{ color: 'var(--text)' }}>
        {value}
      </p>
    </div>
  )
}
