import type { ForecastServiceRED, ForecastPoint } from '../../types/forecast'

const W = 480
const H = 120
const PAD = { top: 8, right: 8, bottom: 20, left: 40 }
const INNER_W = W - PAD.left - PAD.right
const INNER_H = H - PAD.top - PAD.bottom

function fmtMetric(metric: string, v: number): string {
  if (metric === 'error_rate') return `${(v * 100).toFixed(1)}%`
  if (metric === 'p95_ms') return `${v.toFixed(0)}ms`
  return `${v.toFixed(1)}`
}

function metricLabel(metric: string): string {
  switch (metric) {
    case 'rate': return 'Request Rate (req/min)'
    case 'error_rate': return 'Error Rate'
    case 'p95_ms': return 'P95 Latency (ms)'
    default: return metric
  }
}

function buildChart(series: ForecastPoint[]) {
  if (series.length < 2) return null

  const times = series.map((p) => new Date(p.ts).getTime())
  const tMin = times[0]
  const tMax = times[times.length - 1]
  const tRange = tMax - tMin || 1

  const allVals = series.flatMap((p) => [
    p.actual ?? p.predicted,
    p.predicted,
    p.lower,
    p.upper,
  ])
  const vMin = Math.min(...allVals)
  const vMax = Math.max(...allVals)
  const vRange = vMax - vMin || 1

  const xOf = (i: number) => PAD.left + ((times[i] - tMin) / tRange) * INNER_W
  const yOf = (v: number) => PAD.top + INNER_H - ((v - vMin) / vRange) * INNER_H

  // Confidence band polygon (upper→lower)
  const bandPts = [
    ...series.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.upper).toFixed(1)}`),
    ...[...series].reverse().map((p, ri) => {
      const i = series.length - 1 - ri
      return `${xOf(i).toFixed(1)},${yOf(p.lower).toFixed(1)}`
    }),
  ].join(' ')

  // X-axis tick labels (4 ticks)
  const ticks = [0, Math.floor(series.length / 3), Math.floor((2 * series.length) / 3), series.length - 1]

  // Split actual and predicted at the boundary
  const splitIdx = series.findIndex((p) => p.actual === null)
  const actualSeries = splitIdx === -1 ? series : series.slice(0, splitIdx + 1)
  const actualPolyline = actualSeries
    .map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.actual ?? p.predicted).toFixed(1)}`)
    .join(' ')
  const predictedStartIdx = splitIdx === -1 ? series.length : Math.max(0, splitIdx - 1)
  const predictedPolyline = series
    .slice(predictedStartIdx)
    .map((p, i) => `${xOf(predictedStartIdx + i).toFixed(1)},${yOf(p.predicted).toFixed(1)}`)
    .join(' ')

  return { bandPts, actualPolyline, predictedPolyline, ticks, xOf, yOf, vMin, vMax, times }
}

export function ForecastRedChart({ data }: { data: ForecastServiceRED }) {
  const chart = buildChart(data.series)

  if (!chart) {
    return (
      <div
        style={{
          height: H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
          fontSize: 11,
        }}
      >
        no data
      </div>
    )
  }

  const { bandPts, actualPolyline, predictedPolyline, ticks, xOf, yOf, vMin, vMax, times } = chart
  const lastActual = data.series.find((p) => p.actual !== null)
    ? [...data.series].reverse().find((p) => p.actual !== null)
    : null

  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: 'var(--muted)',
          marginBottom: 4,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{data.service}</span>
        <span>{metricLabel(data.metric)}</span>
        {lastActual && (
          <span style={{ color: 'var(--muted)' }}>
            now: <span style={{ color: 'var(--text)' }}>{fmtMetric(data.metric, lastActual.actual!)}</span>
          </span>
        )}
        <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <span style={{ color: 'var(--text)', fontSize: 9 }}>━ actual</span>
          <span style={{ color: 'var(--forecast)', fontSize: 9 }}>━ forecast</span>
        </span>
      </div>
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        {/* Confidence band */}
        <polygon
          points={bandPts}
          fill="var(--forecast-band)"
          stroke="none"
        />

        {/* Y-axis labels */}
        {[vMin, (vMin + vMax) / 2, vMax].map((v, i) => (
          <text
            key={i}
            x={PAD.left - 4}
            y={yOf(v) + 3}
            textAnchor="end"
            fontSize={8}
            fill="var(--muted)"
          >
            {fmtMetric(data.metric, v)}
          </text>
        ))}

        {/* X-axis ticks */}
        {ticks.map((idx) => {
          const d = new Date(times[idx])
          const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
          return (
            <text
              key={idx}
              x={xOf(idx)}
              y={H - 4}
              textAnchor="middle"
              fontSize={8}
              fill="var(--muted)"
            >
              {label}
            </text>
          )
        })}

        {/* Actual line */}
        {actualPolyline && (
          <polyline
            points={actualPolyline}
            fill="none"
            stroke="var(--text)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            opacity={0.9}
          />
        )}

        {/* Predicted line */}
        {predictedPolyline && (
          <polyline
            points={predictedPolyline}
            fill="none"
            stroke="var(--forecast)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeDasharray="4 2"
            opacity={0.9}
          />
        )}
      </svg>
    </div>
  )
}
