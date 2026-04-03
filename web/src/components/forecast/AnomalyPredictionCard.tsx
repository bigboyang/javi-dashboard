import { AlertTriangle, AlertCircle, Clock } from 'lucide-react'
import type { AnomalyPrediction } from '../../types/forecast'

function fmtRelTime(isoTs: string): string {
  const diff = new Date(isoTs).getTime() - Date.now()
  if (diff < 0) return 'now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `in ${mins}m`
  const hrs = Math.floor(mins / 60)
  return `in ${hrs}h ${mins % 60}m`
}

function metricLabel(metric: string): string {
  switch (metric) {
    case 'rate': return 'Request Rate'
    case 'error_rate': return 'Error Rate'
    case 'p95_ms': return 'P95 Latency'
    default: return metric
  }
}

function fmtValue(metric: string, v: number): string {
  if (metric === 'error_rate') return `${(v * 100).toFixed(2)}%`
  if (metric === 'p95_ms') return `${v.toFixed(0)}ms`
  return `${v.toFixed(1)}`
}

interface Props {
  anomaly: AnomalyPrediction
}

export function AnomalyPredictionCard({ anomaly }: Props) {
  const isCritical = anomaly.severity === 'critical'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${isCritical ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
        borderRadius: 6,
        padding: '10px 12px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {isCritical ? (
          <AlertCircle size={13} style={{ color: 'var(--error)', flexShrink: 0 }} />
        ) : (
          <AlertTriangle size={13} style={{ color: 'var(--warning)', flexShrink: 0 }} />
        )}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: isCritical ? 'var(--error)' : 'var(--warning)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {anomaly.severity}
        </span>
        <span
          style={{
            fontSize: 10,
            background: isCritical ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
            color: isCritical ? 'var(--error)' : 'var(--warning)',
            borderRadius: 3,
            padding: '1px 6px',
          }}
        >
          {anomaly.service}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, color: 'var(--muted)', fontSize: 10 }}>
          <Clock size={10} />
          {fmtRelTime(anomaly.predicted_at)}
        </span>
      </div>

      {/* Description */}
      <p style={{ fontSize: 11, color: 'var(--text)', margin: '0 0 8px', lineHeight: 1.4 }}>
        {anomaly.description}
      </p>

      {/* Metric row */}
      <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--muted)' }}>
        <span>
          {metricLabel(anomaly.metric)}:{' '}
          <span style={{ color: 'var(--text)' }}>{fmtValue(anomaly.metric, anomaly.current_value)}</span>
          {' → '}
          <span style={{ color: isCritical ? 'var(--error)' : 'var(--warning)' }}>
            {fmtValue(anomaly.metric, anomaly.threshold_value)}
          </span>
        </span>
        <span style={{ marginLeft: 'auto' }}>
          confidence:{' '}
          <span style={{ color: 'var(--text)' }}>{(anomaly.confidence * 100).toFixed(0)}%</span>
        </span>
      </div>

      {/* Confidence bar */}
      <div
        style={{
          marginTop: 6,
          height: 2,
          background: 'var(--border)',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${anomaly.confidence * 100}%`,
            background: isCritical ? 'var(--error)' : 'var(--warning)',
            borderRadius: 1,
            transition: 'width 0.3s',
          }}
        />
      </div>
    </div>
  )
}

export function AnomalyPredictionList({ anomalies }: { anomalies: AnomalyPrediction[] }) {
  if (anomalies.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '24px 0',
          color: 'var(--muted)',
          fontSize: 11,
        }}
      >
        no predicted anomalies
      </div>
    )
  }

  const sorted = [...anomalies].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1
    return b.confidence - a.confidence
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sorted.map((a) => (
        <AnomalyPredictionCard key={a.id} anomaly={a} />
      ))}
    </div>
  )
}
