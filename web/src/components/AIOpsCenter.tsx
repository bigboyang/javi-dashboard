import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Cpu, AlertTriangle, ChevronRight, ChevronDown, WifiOff, X } from 'lucide-react'
import { fetchAnomalies, fetchRCA } from '../api/aiops'
import { fetchServices } from '../api/apm'
import type { AnomalyRecord, RCAReport, AnomalyType } from '../types/aiops'

const WINDOWS = ['1h', '6h', '24h'] as const
type Window = (typeof WINDOWS)[number]

const ANOMALY_LABELS: Record<AnomalyType, string> = {
  latency_p95_spike: 'Latency Spike',
  error_rate_spike: 'Error Spike',
  traffic_drop: 'Traffic Drop',
  multivariate_anomaly: 'Multivariate',
}

function severityColor(s: string) {
  return s === 'critical' ? 'var(--health-critical)' : 'var(--health-warn)'
}

function severityBg(s: string) {
  return s === 'critical' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)'
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// -----------------------------------------------------------------------
// RCA Drawer
// -----------------------------------------------------------------------

function RCADrawer({
  anomaly,
  report,
  onClose,
}: {
  anomaly: AnomalyRecord
  report: RCAReport | undefined
  onClose: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 480,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
            RCA — {anomaly.service_name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>
            {ANOMALY_LABELS[anomaly.anomaly_type] ?? anomaly.anomaly_type} · {fmtDate(anomaly.detected_at)}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        {/* Anomaly summary */}
        <div
          style={{
            padding: '8px 10px',
            background: severityBg(anomaly.severity),
            border: `1px solid ${severityColor(anomaly.severity)}33`,
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 10, color: severityColor(anomaly.severity), fontWeight: 700, marginBottom: 4 }}>
            {anomaly.severity.toUpperCase()} · Z-score {anomaly.z_score.toFixed(2)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text)' }}>
            Current: <strong>{anomaly.current_value.toFixed(3)}</strong> · Baseline: {anomaly.baseline_value.toFixed(3)}
          </div>
          {anomaly.span_name && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
              Operation: {anomaly.span_name}
            </div>
          )}
        </div>

        {report ? (
          <>
            {/* Hypothesis */}
            {report.hypothesis && (
              <Section title="Hypothesis">
                <p style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
                  {report.hypothesis}
                </p>
              </Section>
            )}

            {/* LLM Analysis */}
            {report.llm_analysis && (
              <Section title="AI Analysis">
                <p style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {report.llm_analysis}
                </p>
              </Section>
            )}

            {/* Correlated Spans */}
            {report.correlated_spans.length > 0 && (
              <Section title={`Correlated Spans (${report.correlated_spans.length})`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {report.correlated_spans.map((span) => (
                    <div
                      key={span.span_id}
                      style={{
                        padding: '6px 8px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                      }}
                    >
                      <div style={{ fontSize: 10, color: 'var(--text)', marginBottom: 2 }}>{span.name}</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', display: 'flex', gap: 8 }}>
                        <span>{span.duration_ms.toFixed(1)}ms</span>
                        {span.exception_type && (
                          <span style={{ color: 'var(--error)' }}>{span.exception_type}</span>
                        )}
                        {span.status_message && (
                          <span style={{ color: 'var(--muted)' }}>{span.status_message.slice(0, 40)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Similar Incidents */}
            {report.similar_incidents.length > 0 && (
              <Section title={`Similar Past Incidents (${report.similar_incidents.length})`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {report.similar_incidents.map((inc) => (
                    <div
                      key={inc.trace_id}
                      style={{
                        padding: '6px 8px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                      }}
                    >
                      <div style={{ fontSize: 10, color: 'var(--text)', marginBottom: 2 }}>
                        {inc.service_name} · score {inc.score.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', lineHeight: 1.4 }}>
                        {inc.summary.slice(0, 120)}{inc.summary.length > 120 ? '…' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'center', paddingTop: 24 }}>
            No RCA report available for this anomaly.
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: 'var(--muted)',
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

// -----------------------------------------------------------------------
// Anomaly Row
// -----------------------------------------------------------------------

function AnomalyRow({
  anomaly,
  rca,
  isSelected,
  onClick,
}: {
  anomaly: AnomalyRecord
  rca: RCAReport | undefined
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'background 0.1s',
      }}
    >
      {/* Severity dot */}
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: severityColor(anomaly.severity),
          flexShrink: 0,
        }}
      />

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
            {anomaly.service_name}
          </span>
          <span
            style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
              background: severityBg(anomaly.severity),
              color: severityColor(anomaly.severity),
              fontWeight: 600,
            }}
          >
            {ANOMALY_LABELS[anomaly.anomaly_type] ?? anomaly.anomaly_type}
          </span>
          {rca && (
            <span
              style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 3,
                background: 'rgba(99,102,241,0.12)',
                color: 'var(--accent)',
              }}
            >
              RCA
            </span>
          )}
        </div>
        <div style={{ fontSize: 9, color: 'var(--muted)', display: 'flex', gap: 10 }}>
          <span>Z {anomaly.z_score.toFixed(2)}</span>
          <span>current {anomaly.current_value.toFixed(3)}</span>
          <span>{fmtTime(anomaly.detected_at)}</span>
        </div>
      </div>

      <ChevronRight size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
    </div>
  )
}

// -----------------------------------------------------------------------
// AIOps Center
// -----------------------------------------------------------------------

export function AIOpsCenter() {
  const [window, setWindow] = useState<Window>('1h')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState<'all' | 'warning' | 'critical'>('all')
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyRecord | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const queryOpts = { staleTime: 30_000, refetchInterval: 30_000, retry: 1 }

  const { data: anomaliesData, isLoading: anomLoading, error: anomError } = useQuery({
    queryKey: ['aiops-anomalies', window, serviceFilter, severityFilter],
    queryFn: () =>
      fetchAnomalies(
        window,
        serviceFilter !== 'all' ? serviceFilter : undefined,
        severityFilter !== 'all' ? severityFilter : undefined,
      ),
    ...queryOpts,
  })

  const { data: rcaData } = useQuery({
    queryKey: ['aiops-rca', window, serviceFilter],
    queryFn: () => fetchRCA(window, serviceFilter !== 'all' ? serviceFilter : undefined),
    ...queryOpts,
  })

  const { data: servicesData } = useQuery({
    queryKey: ['services', '5m'],
    queryFn: () => fetchServices('5m'),
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

  const anomalies = anomaliesData?.anomalies ?? []
  const rcaMap = new Map((rcaData?.reports ?? []).map((r) => [r.anomaly_id, r]))
  const services = servicesData?.services ?? []

  const criticalCount = anomalies.filter((a) => a.severity === 'critical').length
  const warnCount = anomalies.filter((a) => a.severity === 'warning').length
  const affectedServices = new Set(anomalies.map((a) => a.service_name)).size

  // Group by service for the timeline view
  const grouped = anomalies.reduce<Record<string, AnomalyRecord[]>>((acc, a) => {
    ;(acc[a.service_name] ??= []).push(a)
    return acc
  }, {})

  const selectedRCA = selectedAnomaly ? rcaMap.get(selectedAnomaly.id) : undefined

  function toggleGroup(svc: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(svc) ? next.delete(svc) : next.add(svc)
      return next
    })
  }

  return (
    <div style={{ padding: '16px 20px', maxWidth: 1200, margin: '0 auto' }}>
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
          <Cpu size={15} style={{ color: 'var(--accent)' }} />
          AIOps Center
          <span
            style={{
              fontSize: 9,
              background: 'rgba(99,102,241,0.15)',
              color: 'var(--accent)',
              borderRadius: 3,
              padding: '2px 6px',
              fontWeight: 400,
              letterSpacing: '0.04em',
            }}
          >
            ANOMALY DETECTION
          </span>
        </h1>
        <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>
          {anomaliesData
            ? `${anomalies.length} anomalies · generated ${fmtTime(anomaliesData.generated_at)}`
            : 'Loading anomaly data…'}
        </p>
      </div>

      {/* Summary badges */}
      {(criticalCount > 0 || warnCount > 0) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {criticalCount > 0 && (
            <Badge color="var(--health-critical)" bg="rgba(239,68,68,0.1)">
              <AlertTriangle size={10} /> {criticalCount} critical
            </Badge>
          )}
          {warnCount > 0 && (
            <Badge color="var(--health-warn)" bg="rgba(245,158,11,0.1)">
              <AlertTriangle size={10} /> {warnCount} warning
            </Badge>
          )}
          {affectedServices > 0 && (
            <Badge color="var(--muted)" bg="rgba(255,255,255,0.04)">
              {affectedServices} service{affectedServices > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Window */}
        <div style={{ display: 'flex', gap: 2 }}>
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              style={{
                fontSize: 10,
                padding: '4px 10px',
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

        {/* Severity filter */}
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
          style={selectStyle}
        >
          <option value="all">all severity</option>
          <option value="critical">critical</option>
          <option value="warning">warning</option>
        </select>

        {/* Service filter */}
        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="all">all services</option>
          {services.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Anomaly list */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {/* Table header */}
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Cpu size={12} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Anomaly Timeline
          </span>
          {anomalies.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
              {anomalies.length} events
            </span>
          )}
        </div>

        {anomLoading && (
          <div style={{ padding: '20px', color: 'var(--muted)', fontSize: 11, textAlign: 'center' }}>
            loading…
          </div>
        )}

        {anomError && (
          <div
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--muted)',
              fontSize: 11,
            }}
          >
            <WifiOff size={13} />
            Failed to load anomalies — ensure ClickHouse is reachable.
          </div>
        )}

        {!anomLoading && !anomError && anomalies.length === 0 && (
          <div style={{ padding: '24px', color: 'var(--muted)', fontSize: 11, textAlign: 'center' }}>
            No anomalies detected in the last {window}.
          </div>
        )}

        {/* Grouped by service */}
        {Object.entries(grouped).map(([svc, svcAnomalies]) => {
          const isExpanded = expandedGroups.has(svc)
          const hasCritical = svcAnomalies.some((a) => a.severity === 'critical')
          return (
            <div key={svc}>
              {/* Service group header */}
              <div
                onClick={() => toggleGroup(svc)}
                style={{
                  padding: '6px 12px',
                  background: 'rgba(255,255,255,0.02)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <span style={{ fontSize: 10, fontWeight: 700, color: hasCritical ? 'var(--health-critical)' : 'var(--health-warn)' }}>
                  {svc}
                </span>
                <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 'auto' }}>
                  {svcAnomalies.length} event{svcAnomalies.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Anomaly rows */}
              {isExpanded &&
                svcAnomalies.map((a) => (
                  <AnomalyRow
                    key={a.id}
                    anomaly={a}
                    rca={rcaMap.get(a.id)}
                    isSelected={selectedAnomaly?.id === a.id}
                    onClick={() =>
                      setSelectedAnomaly((prev) => (prev?.id === a.id ? null : a))
                    }
                  />
                ))}
            </div>
          )
        })}
      </div>

      {/* RCA Drawer */}
      {selectedAnomaly && (
        <RCADrawer
          anomaly={selectedAnomaly}
          report={selectedRCA}
          onClose={() => setSelectedAnomaly(null)}
        />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function Badge({
  children,
  color,
  bg,
}: {
  children: React.ReactNode
  color: string
  bg: string
}) {
  return (
    <div
      style={{
        fontSize: 10,
        color,
        background: bg,
        border: `1px solid ${color}33`,
        borderRadius: 4,
        padding: '4px 10px',
        display: 'flex',
        gap: 5,
        alignItems: 'center',
      }}
    >
      {children}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  fontSize: 10,
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
