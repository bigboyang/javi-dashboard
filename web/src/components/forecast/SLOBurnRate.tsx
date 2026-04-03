// SLO Burn Rate — linear progress bars for each service's error budget consumption.
// Rendered entirely without Recharts: simple SVG-free bar layout.
// Data is derived from the forecast anomalies endpoint (error_rate metric).

import type { AnomalyPrediction } from '../../types/forecast'

// Error budget: 99.9% SLO → 0.1% allowed errors per month.
// Burn rate = current_error_rate / (1 - 0.999) = current_error_rate / 0.001
// A burn rate > 1 means budget is being consumed faster than replenished.
// A burn rate > 14.4 means the budget will be exhausted in 2 hours.

const SLO_TARGET = 0.999 // 99.9%
const ERROR_BUDGET = 1 - SLO_TARGET // 0.001

function calcBurnRate(errorRate: number): number {
  if (ERROR_BUDGET === 0) return 0
  return errorRate / ERROR_BUDGET
}

function burnRateColor(rate: number): string {
  if (rate >= 14.4) return 'var(--health-critical)' // budget exhausted in 2h
  if (rate >= 6) return 'var(--health-warn)'          // budget exhausted in 4.8h
  if (rate >= 1) return 'var(--forecast)'             // consuming budget > 1x
  return 'var(--health-ok)'
}

function burnRateLabel(rate: number): string {
  if (rate >= 14.4) return 'critical (2h exhaustion)'
  if (rate >= 6) return 'high (5h exhaustion)'
  if (rate >= 1) return 'elevated'
  return 'ok'
}

interface BurnEntry {
  service: string
  errorRate: number
  burnRate: number
  isPredicted: boolean
}

interface Props {
  // Anomalies with metric=error_rate give us the burn rate data.
  // Current actual error rates come from services props.
  services: Array<{ name: string; error_rate: number }>
  anomalies: AnomalyPrediction[]
}

export function SLOBurnRate({ services, anomalies }: Props) {
  // Build entries from actual service error rates
  const serviceEntries: BurnEntry[] = services.map((s) => ({
    service: s.name,
    errorRate: s.error_rate,
    burnRate: calcBurnRate(s.error_rate),
    isPredicted: false,
  }))

  // Overlay predicted anomalies where error_rate metric is predicted to breach
  const predictedServices = new Set(
    anomalies.filter((a) => a.metric === 'error_rate').map((a) => a.service),
  )

  const entries = serviceEntries.sort((a, b) => b.burnRate - a.burnRate)

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 11 }}>
        no service data
      </div>
    )
  }

  const maxBurnRate = Math.max(...entries.map((e) => e.burnRate), 14.4)

  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: 'var(--muted)',
          marginBottom: 8,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <span>SLO: {(SLO_TARGET * 100).toFixed(1)}%</span>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span>burn rate = error_rate / {(ERROR_BUDGET * 100).toFixed(1)}% budget</span>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span style={{ color: 'var(--health-critical)' }}>≥14.4 = 2h exhaustion</span>
      </div>

      {entries.map((e) => {
        const barPct = Math.min((e.burnRate / maxBurnRate) * 100, 100)
        const color = burnRateColor(e.burnRate)
        const hasPredictedBreach = predictedServices.has(e.service)

        return (
          <div key={e.service} style={{ marginBottom: 10 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 3,
                fontSize: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{e.service}</span>
                {hasPredictedBreach && (
                  <span
                    style={{
                      fontSize: 9,
                      color: 'var(--forecast)',
                      background: 'rgba(167,139,250,0.12)',
                      borderRadius: 3,
                      padding: '1px 5px',
                    }}
                  >
                    breach predicted
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 9, color: 'var(--muted)' }}>
                <span>
                  error: {(e.errorRate * 100).toFixed(3)}%
                </span>
                <span style={{ color }}>
                  {e.burnRate.toFixed(2)}x — {burnRateLabel(e.burnRate)}
                </span>
              </div>
            </div>

            {/* Linear burn rate bar */}
            <div
              style={{
                height: 6,
                background: 'var(--border)',
                borderRadius: 3,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${barPct}%`,
                  background: color,
                  borderRadius: 3,
                  transition: 'width 0.3s',
                }}
              />
              {/* 1x burn rate marker */}
              <div
                style={{
                  position: 'absolute',
                  left: `${(1 / maxBurnRate) * 100}%`,
                  top: 0,
                  height: '100%',
                  width: 1,
                  background: 'rgba(255,255,255,0.3)',
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
