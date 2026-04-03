import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, AlertTriangle, Server, Activity, WifiOff } from 'lucide-react'
import { fetchForecastRed, fetchForecastCapacity, fetchForecastAnomalies } from '../api/forecast'
import { fetchServices } from '../api/apm'
import { ForecastRedChart } from './forecast/ForecastRedChart'
import { AnomalyPredictionList } from './forecast/AnomalyPredictionCard'
import { CapacitySaturation } from './forecast/CapacitySaturation'
import { SLOBurnRate } from './forecast/SLOBurnRate'
import type { ForecastMetric } from '../types/forecast'

const METRICS: ForecastMetric[] = ['rate', 'error_rate', 'p95_ms']

const METRIC_LABELS: Record<ForecastMetric, string> = {
  rate: 'Rate',
  error_rate: 'Error %',
  p95_ms: 'P95 ms',
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '14px 16px',
      }}
    >
      <h2
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text)',
          margin: '0 0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

function UnavailableBanner({ message }: { message: string }) {
  return (
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
      }}
    >
      <WifiOff size={13} />
      <span>{message}</span>
    </div>
  )
}

export function ForecastDashboard() {
  const [selectedMetric, setSelectedMetric] = useState<ForecastMetric>('error_rate')
  const [selectedService, setSelectedService] = useState<string>('all')

  const { data: redData, isLoading: redLoading, error: redError } = useQuery({
    queryKey: ['forecast-red'],
    queryFn: fetchForecastRed,
    retry: 1,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const { data: capacityData, isLoading: capacityLoading, error: capacityError } = useQuery({
    queryKey: ['forecast-capacity'],
    queryFn: fetchForecastCapacity,
    retry: 1,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const { data: anomaliesData, isLoading: anomaliesLoading, error: anomaliesError } = useQuery({
    queryKey: ['forecast-anomalies'],
    queryFn: () => fetchForecastAnomalies(),
    retry: 1,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const { data: servicesData } = useQuery({
    queryKey: ['services', '5m'],
    queryFn: () => fetchServices('5m'),
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

  const services = servicesData?.services ?? []
  const anomalies = anomaliesData?.anomalies ?? []

  // Filter RED series
  const redSeries = (redData?.services ?? []).filter((s) => {
    if (s.metric !== selectedMetric) return false
    if (selectedService !== 'all' && s.service !== selectedService) return false
    return true
  })

  const criticalCount = anomalies.filter((a) => a.severity === 'critical').length
  const warnCount = anomalies.filter((a) => a.severity === 'warn').length
  const saturatingCount = (capacityData?.metrics ?? []).filter((m) => m.saturation_at !== null).length

  return (
    <div style={{ padding: '16px 20px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
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
          <TrendingUp size={15} style={{ color: 'var(--forecast)' }} />
          Forecast Dashboard
          <span
            style={{
              fontSize: 9,
              background: 'rgba(167,139,250,0.15)',
              color: 'var(--forecast)',
              borderRadius: 3,
              padding: '2px 6px',
              fontWeight: 400,
              letterSpacing: '0.04em',
            }}
          >
            AI-PREDICTED
          </span>
        </h1>
        <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>
          {redData
            ? `Generated ${new Date(redData.generated_at).toLocaleTimeString()} · ${redData.horizon_hours}h horizon`
            : 'Connecting to javi-forecast…'}
        </p>
      </div>

      {/* Summary badges */}
      {(criticalCount > 0 || warnCount > 0 || saturatingCount > 0) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {criticalCount > 0 && (
            <div
              style={{
                fontSize: 10,
                color: 'var(--error)',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 4,
                padding: '4px 10px',
                display: 'flex',
                gap: 5,
                alignItems: 'center',
              }}
            >
              <AlertTriangle size={11} />
              {criticalCount} critical anomaly{criticalCount > 1 ? 'ies' : ''}
            </div>
          )}
          {warnCount > 0 && (
            <div
              style={{
                fontSize: 10,
                color: 'var(--warning)',
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 4,
                padding: '4px 10px',
                display: 'flex',
                gap: 5,
                alignItems: 'center',
              }}
            >
              <AlertTriangle size={11} />
              {warnCount} warning{warnCount > 1 ? 's' : ''}
            </div>
          )}
          {saturatingCount > 0 && (
            <div
              style={{
                fontSize: 10,
                color: 'var(--health-warn)',
                background: 'rgba(245,158,11,0.07)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 4,
                padding: '4px 10px',
                display: 'flex',
                gap: 5,
                alignItems: 'center',
              }}
            >
              <Server size={11} />
              {saturatingCount} resource saturating
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {/* Metric selector */}
        <div style={{ display: 'flex', gap: 2 }}>
          {METRICS.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMetric(m)}
              style={{
                fontSize: 10,
                padding: '4px 10px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                background: selectedMetric === m ? 'rgba(167,139,250,0.2)' : 'var(--border)',
                color: selectedMetric === m ? 'var(--forecast)' : 'var(--muted)',
                fontFamily: 'inherit',
                fontWeight: selectedMetric === m ? 700 : 400,
              }}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Service filter */}
        <select
          value={selectedService}
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
          <option value="all">all services</option>
          {services.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Grid layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 12 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* RED Forecast Charts */}
          <Section title="RED Forecast" icon={<Activity size={12} style={{ color: 'var(--forecast)' }} />}>
            {redLoading && (
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>loading…</div>
            )}
            {redError && (
              <UnavailableBanner message="javi-forecast unavailable — start the forecast service on :8001" />
            )}
            {!redLoading && !redError && redSeries.length === 0 && (
              <UnavailableBanner message="No forecast data for the selected filters" />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {redSeries.map((s) => (
                <ForecastRedChart key={`${s.service}-${s.metric}`} data={s} />
              ))}
            </div>
          </Section>

          {/* SLO Burn Rate */}
          <Section title="SLO Burn Rate" icon={<Activity size={12} style={{ color: 'var(--warning)' }} />}>
            {services.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>loading services…</div>
            ) : (
              <SLOBurnRate
                services={services.map((s) => ({
                  name: s.name,
                  error_rate: s.error_rate,
                }))}
                anomalies={anomalies}
              />
            )}
          </Section>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Capacity Saturation */}
          <Section title="Capacity Saturation" icon={<Server size={12} style={{ color: 'var(--health-warn)' }} />}>
            {capacityLoading && (
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>loading…</div>
            )}
            {capacityError && (
              <UnavailableBanner message="forecast service unavailable" />
            )}
            {!capacityLoading && !capacityError && (
              <CapacitySaturation metrics={capacityData?.metrics ?? []} />
            )}
          </Section>

          {/* Anomaly Predictions */}
          <Section
            title={`Anomaly Predictions${anomalies.length > 0 ? ` (${anomalies.length})` : ''}`}
            icon={<AlertTriangle size={12} style={{ color: 'var(--warning)' }} />}
          >
            {anomaliesLoading && (
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>loading…</div>
            )}
            {anomaliesError && (
              <UnavailableBanner message="forecast service unavailable" />
            )}
            {!anomaliesLoading && !anomaliesError && (
              <AnomalyPredictionList anomalies={anomalies} />
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}
