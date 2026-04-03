import type { CapacityMetric } from '../../types/forecast'

function resourceLabel(r: string): string {
  switch (r) {
    case 'cpu': return 'CPU'
    case 'memory': return 'Memory'
    case 'request_rate': return 'Request Rate'
    default: return r
  }
}

function headroomColor(pct: number): string {
  if (pct < 10) return 'var(--health-critical)'
  if (pct < 25) return 'var(--health-warn)'
  return 'var(--health-ok)'
}

function fmtSaturation(ts: string | null): string {
  if (!ts) return 'safe'
  const diff = new Date(ts).getTime() - Date.now()
  if (diff < 0) return 'overloaded'
  const hrs = Math.floor(diff / 3_600_000)
  const mins = Math.floor((diff % 3_600_000) / 60_000)
  if (hrs < 1) return `${mins}m`
  return `${hrs}h ${mins}m`
}

function CapacityBar({ metric }: { metric: CapacityMetric }) {
  const currentPct = (metric.current / metric.capacity) * 100
  const predictedPct = (metric.predicted_max / metric.capacity) * 100
  const color = headroomColor(metric.headroom_pct)
  const isSaturating = metric.saturation_at !== null

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
          fontSize: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{metric.service}</span>
          <span style={{ color: 'var(--muted)' }}>{resourceLabel(metric.resource)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--muted)' }}>
            headroom:{' '}
            <span style={{ color }}>{metric.headroom_pct.toFixed(0)}%</span>
          </span>
          {isSaturating && (
            <span
              style={{
                fontSize: 9,
                color: color,
                background: isSaturating && metric.headroom_pct < 10
                  ? 'rgba(239,68,68,0.12)'
                  : 'rgba(245,158,11,0.12)',
                borderRadius: 3,
                padding: '1px 5px',
              }}
            >
              saturates {fmtSaturation(metric.saturation_at)}
            </span>
          )}
        </div>
      </div>

      {/* Bar track */}
      <div
        style={{
          height: 8,
          background: 'var(--border)',
          borderRadius: 4,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Current utilization */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${Math.min(currentPct, 100)}%`,
            background: 'var(--accent)',
            borderRadius: 4,
            opacity: 0.9,
          }}
        />
        {/* Predicted peak marker */}
        <div
          style={{
            position: 'absolute',
            left: `${Math.min(predictedPct, 100)}%`,
            top: 0,
            height: '100%',
            width: 2,
            background: color,
            transform: 'translateX(-1px)',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 3,
          fontSize: 9,
          color: 'var(--muted)',
        }}
      >
        <span>current: {currentPct.toFixed(0)}%</span>
        <span style={{ color }}>predicted peak: {predictedPct.toFixed(0)}%</span>
      </div>
    </div>
  )
}

export function CapacitySaturation({ metrics }: { metrics: CapacityMetric[] }) {
  if (metrics.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 11 }}>
        no capacity data
      </div>
    )
  }

  // Sort: worst headroom first
  const sorted = [...metrics].sort((a, b) => a.headroom_pct - b.headroom_pct)

  return (
    <div>
      {sorted.map((m) => (
        <CapacityBar key={`${m.service}-${m.resource}`} metric={m} />
      ))}
      <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 10 }}>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 4, background: 'var(--accent)', borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />
          current
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 2, height: 8, background: 'var(--health-warn)', borderRadius: 1, marginRight: 3, verticalAlign: 'middle' }} />
          predicted peak
        </span>
      </div>
    </div>
  )
}
