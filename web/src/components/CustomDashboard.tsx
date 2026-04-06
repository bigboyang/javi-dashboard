import { useState, useId, useRef, createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Plus,
  Pencil,
  Check,
  X,
  GripVertical,
  Trash2,
  Activity,
  Bell,
  BarChart2,
  Server,
  Zap,
  TrendingUp,
  Search,
  Copy,
  Download,
  Upload,
} from 'lucide-react'
import {
  fetchServices,
  fetchServiceRed,
  fetchAlertStatus,
  fetchMetricNames,
  fetchMetricSeries,
} from '../api/apm'
import { fetchForecastAnomalies } from '../api/forecast'
import { fetchAnomalies } from '../api/aiops'
import { fetchRAGSearch } from '../api/search'
import type { DetailWindow, TimeWindow, AlertWindow } from '../types/apm'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

type WidgetType =
  | 'service-red'
  | 'top-services'
  | 'active-alerts'
  | 'metric-chart'
  | 'anomaly-alert'
  | 'forecast-anomaly'
  | 'rag-search'

interface ServiceRedConfig { service: string; window: DetailWindow }
interface TopServicesConfig { window: TimeWindow; limit: number }
interface ActiveAlertsConfig { window: AlertWindow }
interface MetricChartConfig { metric: string; service: string; window: DetailWindow }
interface AnomalyAlertConfig { window: string; service?: string; severity?: string }
interface ForecastAnomalyConfig { severity?: string }
interface RAGSearchConfig { query: string; service?: string }

type WidgetConfig =
  | ServiceRedConfig
  | TopServicesConfig
  | ActiveAlertsConfig
  | MetricChartConfig
  | AnomalyAlertConfig
  | ForecastAnomalyConfig
  | RAGSearchConfig

interface Widget {
  id: string
  type: WidgetType
  config: WidgetConfig
  span?: 1 | 2 | 3
}

interface Dashboard {
  id: string
  name: string
  widgets: Widget[]
}

interface StorageV2 {
  dashboards: Dashboard[]
  activeId: string
}

// -----------------------------------------------------------------------
// Widget type metadata (color, icon, label)
// -----------------------------------------------------------------------

const WIDGET_META: Record<WidgetType, { color: string; bg: string; label: string; desc: string }> = {
  'service-red':      { color: '#6366f1', bg: 'rgba(99,102,241,0.1)',    label: 'Service RED',        desc: 'Rate / Error / Latency sparklines for a service' },
  'top-services':     { color: '#10b981', bg: 'rgba(16,185,129,0.1)',    label: 'Top Services',       desc: 'Overview table of top N services' },
  'active-alerts':    { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',     label: 'Active Alerts',      desc: 'Currently firing alert rules' },
  'metric-chart':     { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',   label: 'Metric Chart',       desc: 'Custom metric time-series sparkline' },
  'anomaly-alert':    { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',    label: 'Anomaly Alerts',     desc: 'AIOps-detected anomalies (Phase 8)' },
  'forecast-anomaly': { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',   label: 'Forecast Anomaly',   desc: 'Predicted anomalies from javi-forecast' },
  'rag-search':       { color: '#06b6d4', bg: 'rgba(6,182,212,0.1)',     label: 'RAG Search',         desc: 'RAG error search with a pre-configured query' },
}

const WIDGET_ICONS: Record<WidgetType, (color: string) => React.ReactNode> = {
  'service-red':      (c) => <Activity size={12} style={{ color: c }} />,
  'top-services':     (c) => <Server size={12} style={{ color: c }} />,
  'active-alerts':    (c) => <Bell size={12} style={{ color: c }} />,
  'metric-chart':     (c) => <BarChart2 size={12} style={{ color: c }} />,
  'anomaly-alert':    (c) => <Zap size={12} style={{ color: c }} />,
  'forecast-anomaly': (c) => <TrendingUp size={12} style={{ color: c }} />,
  'rag-search':       (c) => <Search size={12} style={{ color: c }} />,
}

// -----------------------------------------------------------------------
// Storage — v1 → v2 migration
// -----------------------------------------------------------------------

const STORAGE_KEY_V1 = 'javi-custom-dashboard-v1'
const STORAGE_KEY_V2 = 'javi-dashboards-v2'

function loadStorage(): StorageV2 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2)
    if (raw) return JSON.parse(raw) as StorageV2
  } catch { /* ignore */ }

  try {
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1)
    if (rawV1) {
      const widgetsV1 = JSON.parse(rawV1) as Widget[]
      const migrated: StorageV2 = {
        dashboards: [{ id: 'default', name: 'Default', widgets: widgetsV1 }],
        activeId: 'default',
      }
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(migrated))
      localStorage.removeItem(STORAGE_KEY_V1)
      return migrated
    }
  } catch { /* ignore */ }

  return {
    dashboards: [{ id: 'default', name: 'Default', widgets: [] }],
    activeId: 'default',
  }
}

function saveStorage(state: StorageV2): void {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(state))
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// -----------------------------------------------------------------------
// Global time range context
// -----------------------------------------------------------------------

const GlobalWindowCtx = createContext<DetailWindow | null>(null)

// -----------------------------------------------------------------------
// Sparkline
// -----------------------------------------------------------------------

function Sparkline({
  data,
  color,
  width = 200,
  height = 44,
}: {
  data: number[]
  color: string
  width?: number
  height?: number
}) {
  const id = useId()
  const pL = 4, pR = 4, pT = 4, pB = 4
  const cW = width - pL - pR
  const cH = height - pT - pB

  if (data.length < 2) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 9 }}>
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

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${id}-g)`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// -----------------------------------------------------------------------
// Shared sub-components
// -----------------------------------------------------------------------

function MiniStat({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div style={{ flex: 1, padding: '5px 10px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
      <div style={{ fontSize: 8, color: 'var(--muted)', marginBottom: 3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {value}
        <span style={{ fontSize: 8, fontWeight: 400, color: 'var(--muted)', marginLeft: 2 }}>{unit}</span>
      </div>
    </div>
  )
}

function WidgetHeader({ type, subtitle }: { type: WidgetType; subtitle?: string }) {
  const meta = WIDGET_META[type]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px',
      borderBottom: '1px solid var(--border)',
      background: meta.bg,
    }}>
      {WIDGET_ICONS[type](meta.color)}
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{meta.label}</span>
      {subtitle && <span style={{ fontSize: 9, color: 'var(--muted)' }}>{subtitle}</span>}
    </div>
  )
}

// -----------------------------------------------------------------------
// Widget: ServiceRED
// -----------------------------------------------------------------------

const RED_STEP: Record<DetailWindow, string> = { '1h': '1m', '6h': '5m', '24h': '15m' }

function ServiceRedWidget({ config }: { config: ServiceRedConfig }) {
  const gw = useContext(GlobalWindowCtx)
  const win = gw ?? config.window

  const { data, isLoading } = useQuery({
    queryKey: ['w-service-red', config.service, win],
    queryFn: () => fetchServiceRed(config.service, win, RED_STEP[win]),
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

  const series = data?.series ?? []
  const latest = series[series.length - 1]

  return (
    <>
      <WidgetHeader type="service-red" subtitle={`${config.service} · ${win}`} />
      <div style={{ padding: '10px 12px' }}>
        {isLoading && <LoadingRow />}
        {!isLoading && latest && (
          <>
            <div style={{ display: 'flex', gap: 0, marginBottom: 10, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <MiniStat label="Rate" value={latest.rate.toFixed(1)} unit="r/m" color="var(--accent)" />
              <MiniStat label="Error" value={(latest.error_rate * 100).toFixed(2)} unit="%" color={latest.error_rate > 0.05 ? 'var(--error)' : 'var(--success)'} />
              <MiniStat label="P95" value={latest.p95_ms.toFixed(0)} unit="ms" color={latest.p95_ms > 500 ? 'var(--warning)' : 'var(--accent)'} />
            </div>
            <Sparkline data={series.map(p => p.rate)} color="var(--accent)" />
          </>
        )}
        {!isLoading && series.length === 0 && <NoData />}
      </div>
    </>
  )
}

// -----------------------------------------------------------------------
// Widget: TopServices
// -----------------------------------------------------------------------

function TopServicesWidget({ config }: { config: TopServicesConfig }) {
  const gw = useContext(GlobalWindowCtx)
  const win = gw ?? config.window

  const { data, isLoading } = useQuery({
    queryKey: ['w-top-services', win],
    queryFn: () => fetchServices(win),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const services = (data?.services ?? []).slice(0, config.limit)

  return (
    <>
      <WidgetHeader type="top-services" subtitle={win} />
      <div style={{ padding: '8px 12px' }}>
        {isLoading && <LoadingRow />}
        {!isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {services.map(svc => (
              <div key={svc.name} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                borderRadius: 5, background: 'var(--bg)',
                border: '1px solid transparent',
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: svc.error_rate > 0.05 ? 'var(--error)' : '#10b981',
                  flexShrink: 0,
                  boxShadow: svc.error_rate > 0.05 ? '0 0 4px rgba(239,68,68,0.5)' : '0 0 4px rgba(16,185,129,0.4)',
                }} />
                <span style={{ fontSize: 10, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svc.name}</span>
                <span style={{ fontSize: 9, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{svc.rate.toFixed(1)}<span style={{ fontSize: 8, marginLeft: 1 }}>r/m</span></span>
                <span style={{ fontSize: 9, color: svc.p95_ms > 500 ? 'var(--warning)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{svc.p95_ms.toFixed(0)}<span style={{ fontSize: 8, marginLeft: 1 }}>ms</span></span>
              </div>
            ))}
            {services.length === 0 && <NoData />}
          </div>
        )}
      </div>
    </>
  )
}

// -----------------------------------------------------------------------
// Widget: ActiveAlerts
// -----------------------------------------------------------------------

function ActiveAlertsWidget({ config }: { config: ActiveAlertsConfig }) {
  const { data, isLoading } = useQuery({
    queryKey: ['w-active-alerts', config.window],
    queryFn: () => fetchAlertStatus(config.window),
    staleTime: 10_000,
    refetchInterval: 10_000,
  })

  const firing = data?.firing ?? []

  return (
    <>
      <WidgetHeader
        type="active-alerts"
        subtitle={
          firing.length > 0
            ? `${firing.length} firing`
            : 'clear'
        }
      />
      <div style={{ padding: '8px 12px' }}>
        {isLoading && <LoadingRow />}
        {!isLoading && firing.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
            <span style={{ fontSize: 10, color: 'var(--success)' }}>All clear</span>
          </div>
        )}
        {!isLoading && firing.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
            {firing.map((f, i) => (
              <div key={i} style={{ padding: '5px 8px', borderRadius: 5, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--error)', marginBottom: 2 }}>{f.rule_name}</div>
                <div style={{ fontSize: 8, color: 'var(--muted)' }}>{f.service} · {f.metric} {f.condition === 'gt' ? '>' : '<'} {f.threshold}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// -----------------------------------------------------------------------
// Widget: MetricChart
// -----------------------------------------------------------------------

const METRIC_STEP: Record<DetailWindow, string> = { '1h': '1m', '6h': '5m', '24h': '15m' }

function MetricChartWidget({ config }: { config: MetricChartConfig }) {
  const gw = useContext(GlobalWindowCtx)
  const win = gw ?? config.window

  const { data, isLoading } = useQuery({
    queryKey: ['w-metric-series', config.metric, config.service, win],
    queryFn: () => fetchMetricSeries(config.metric, win, METRIC_STEP[win], config.service || undefined),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const series = data?.series ?? []
  const avgData = series.map(p => p.avg)
  const latest = series[series.length - 1]
  const shortMetric = config.metric.length > 30 ? config.metric.slice(0, 27) + '…' : config.metric

  return (
    <>
      <WidgetHeader type="metric-chart" subtitle={win} />
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={config.metric}>
          {shortMetric}
          {config.service && <span style={{ marginLeft: 6, color: '#a78bfa' }}>{config.service}</span>}
        </div>
        {isLoading && <LoadingRow />}
        {!isLoading && latest && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#a78bfa', fontVariantNumeric: 'tabular-nums', marginBottom: 8, lineHeight: 1 }}>
              {latest.avg.toFixed(2)}
              <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>avg</span>
            </div>
            <Sparkline data={avgData} color="#a78bfa" />
          </>
        )}
        {!isLoading && series.length === 0 && <NoData />}
      </div>
    </>
  )
}

// -----------------------------------------------------------------------
// Widget: AnomalyAlert
// -----------------------------------------------------------------------

function AnomalyAlertWidget({ config }: { config: AnomalyAlertConfig }) {
  const gw = useContext(GlobalWindowCtx)
  const win = gw ?? config.window

  const { data, isLoading } = useQuery({
    queryKey: ['w-anomaly-alert', win, config.service, config.severity],
    queryFn: () => fetchAnomalies(win, config.service, config.severity),
    staleTime: 20_000,
    refetchInterval: 20_000,
  })

  const anomalies = data?.anomalies ?? []
  const critCount = anomalies.filter(a => a.severity === 'critical').length

  return (
    <>
      <WidgetHeader type="anomaly-alert" subtitle={anomalies.length > 0 ? `${critCount} crit · ${anomalies.length - critCount} warn` : 'clear'} />
      <div style={{ padding: '8px 12px' }}>
        {isLoading && <LoadingRow />}
        {!isLoading && anomalies.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
            <span style={{ fontSize: 10, color: 'var(--success)' }}>No anomalies</span>
          </div>
        )}
        {!isLoading && anomalies.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
            {anomalies.slice(0, 8).map(a => (
              <div key={a.id} style={{
                padding: '5px 8px', borderRadius: 5,
                background: a.severity === 'critical' ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)',
                border: `1px solid ${a.severity === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: a.severity === 'critical' ? 'var(--error)' : '#f59e0b', marginBottom: 2 }}>
                  {a.service_name} · {a.anomaly_type.replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: 8, color: 'var(--muted)' }}>
                  z={a.z_score.toFixed(1)} · {a.current_value.toFixed(1)} / {a.baseline_value.toFixed(1)} baseline
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// -----------------------------------------------------------------------
// Widget: ForecastAnomaly
// -----------------------------------------------------------------------

function ForecastAnomalyWidget({ config }: { config: ForecastAnomalyConfig }) {
  const { data, isLoading } = useQuery({
    queryKey: ['w-forecast-anomaly', config.severity],
    queryFn: () => fetchForecastAnomalies(config.severity as 'warn' | 'critical' | undefined),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const anomalies = data?.anomalies ?? []

  return (
    <>
      <WidgetHeader type="forecast-anomaly" subtitle={anomalies.length > 0 ? `${anomalies.length} predicted` : 'clear'} />
      <div style={{ padding: '8px 12px' }}>
        {isLoading && <LoadingRow />}
        {!isLoading && anomalies.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
            <span style={{ fontSize: 10, color: 'var(--success)' }}>No predicted anomalies</span>
          </div>
        )}
        {!isLoading && anomalies.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
            {anomalies.slice(0, 8).map(a => (
              <div key={a.id} style={{
                padding: '5px 8px', borderRadius: 5,
                background: a.severity === 'critical' ? 'rgba(239,68,68,0.07)' : 'rgba(167,139,250,0.07)',
                border: `1px solid ${a.severity === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(167,139,250,0.2)'}`,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: a.severity === 'critical' ? 'var(--error)' : '#a78bfa', marginBottom: 2 }}>
                  {a.service} · {a.metric}
                </div>
                <div style={{ fontSize: 8, color: 'var(--muted)' }}>
                  {Math.round(a.confidence * 100)}% conf · {a.description.slice(0, 42)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// -----------------------------------------------------------------------
// Widget: RAGSearch
// -----------------------------------------------------------------------

function RAGSearchWidget({ config }: { config: RAGSearchConfig }) {
  const { data, isLoading } = useQuery({
    queryKey: ['w-rag-search', config.query, config.service],
    queryFn: () => fetchRAGSearch(config.query, config.service, 0, 5),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  const results = data?.results ?? []

  return (
    <>
      <WidgetHeader type="rag-search" subtitle={data ? `${data.total ?? 0} hits` : undefined} />
      <div style={{ padding: '8px 12px' }}>
        <div style={{ fontSize: 9, color: '#06b6d4', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          "{config.query}"
          {config.service && <span style={{ color: 'var(--muted)', marginLeft: 5 }}>in {config.service}</span>}
        </div>
        {isLoading && <LoadingRow />}
        {!isLoading && results.length === 0 && <NoData label="No results" />}
        {!isLoading && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
            {results.map((r, i) => (
              <div key={i} style={{ padding: '5px 8px', borderRadius: 5, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#06b6d4', marginBottom: 2 }}>
                  {r.service_name}
                  <span style={{ fontSize: 8, fontWeight: 400, color: 'var(--muted)', marginLeft: 5 }}>{Math.round(r.score * 100)}% match</span>
                </div>
                <div style={{ fontSize: 8, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// -----------------------------------------------------------------------
// Utility micro-components
// -----------------------------------------------------------------------

function LoadingRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0', color: 'var(--muted)', fontSize: 10 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', opacity: 0.5 }} />
      loading…
    </div>
  )
}

function NoData({ label = 'no data' }: { label?: string }) {
  return <div style={{ padding: '10px 0', fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>{label}</div>
}

// -----------------------------------------------------------------------
// Widget renderer
// -----------------------------------------------------------------------

function WidgetContent({ widget }: { widget: Widget }) {
  switch (widget.type) {
    case 'service-red':      return <ServiceRedWidget config={widget.config as ServiceRedConfig} />
    case 'top-services':     return <TopServicesWidget config={widget.config as TopServicesConfig} />
    case 'active-alerts':    return <ActiveAlertsWidget config={widget.config as ActiveAlertsConfig} />
    case 'metric-chart':     return <MetricChartWidget config={widget.config as MetricChartConfig} />
    case 'anomaly-alert':    return <AnomalyAlertWidget config={widget.config as AnomalyAlertConfig} />
    case 'forecast-anomaly': return <ForecastAnomalyWidget config={widget.config as ForecastAnomalyConfig} />
    case 'rag-search':       return <RAGSearchWidget config={widget.config as RAGSearchConfig} />
  }
}

// -----------------------------------------------------------------------
// Shared form helpers
// -----------------------------------------------------------------------

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 11,
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5,
  color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer',
  outline: 'none',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 11,
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5,
  color: 'var(--text)', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
}

const btnPrimary: React.CSSProperties = {
  padding: '6px 16px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 5,
  cursor: 'pointer', fontFamily: 'inherit',
  background: 'rgba(99,102,241,0.22)', color: 'var(--accent)',
}

const btnSecondary: React.CSSProperties = {
  padding: '6px 14px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 5,
  cursor: 'pointer', fontFamily: 'inherit',
  background: 'transparent', color: 'var(--muted)',
}

// -----------------------------------------------------------------------
// Add Widget Panel
// -----------------------------------------------------------------------

function AddWidgetPanel({
  onAdd,
  onClose,
}: {
  onAdd: (widget: Widget) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<'pick' | 'config'>('pick')
  const [type, setType] = useState<WidgetType>('service-red')
  const [span, setSpan] = useState<1 | 2 | 3>(1)

  const [redService, setRedService] = useState('')
  const [redWindow, setRedWindow] = useState<DetailWindow>('1h')
  const [tsWindow, setTsWindow] = useState<TimeWindow>('5m')
  const [tsLimit, setTsLimit] = useState(5)
  const [aaWindow, setAaWindow] = useState<AlertWindow>('5m')
  const [mcMetric, setMcMetric] = useState('')
  const [mcService, setMcService] = useState('')
  const [mcWindow, setMcWindow] = useState<DetailWindow>('1h')
  const [anomService, setAnomService] = useState('')
  const [anomWindow, setAnomWindow] = useState('1h')
  const [anomSeverity, setAnomSeverity] = useState('')
  const [fcSeverity, setFcSeverity] = useState('')
  const [ragQuery, setRagQuery] = useState('')
  const [ragService, setRagService] = useState('')

  const { data: servicesData } = useQuery({
    queryKey: ['services', '5m'],
    queryFn: () => fetchServices('5m'),
    staleTime: 30_000,
  })
  const { data: metricNamesData } = useQuery({
    queryKey: ['metric-names', '1h', mcService],
    queryFn: () => fetchMetricNames('1h', mcService || undefined),
    staleTime: 30_000,
  })

  const services = servicesData?.services ?? []
  const metrics = metricNamesData?.metrics ?? []

  function handleAdd() {
    let config: WidgetConfig
    switch (type) {
      case 'service-red':
        if (!redService) return
        config = { service: redService, window: redWindow }
        break
      case 'top-services':
        config = { window: tsWindow, limit: tsLimit }
        break
      case 'active-alerts':
        config = { window: aaWindow }
        break
      case 'metric-chart':
        if (!mcMetric) return
        config = { metric: mcMetric, service: mcService, window: mcWindow }
        break
      case 'anomaly-alert':
        config = { window: anomWindow, service: anomService || undefined, severity: anomSeverity || undefined }
        break
      case 'forecast-anomaly':
        config = { severity: fcSeverity || undefined }
        break
      case 'rag-search':
        if (!ragQuery.trim()) return
        config = { query: ragQuery.trim(), service: ragService || undefined }
        break
    }
    onAdd({ id: genId(), type, config, span })
    onClose()
  }

  const WIDGET_TYPES: WidgetType[] = ['service-red', 'top-services', 'active-alerts', 'metric-chart', 'anomaly-alert', 'forecast-anomaly', 'rag-search']

  function SpanSelector() {
    const opts: { v: 1 | 2 | 3; label: string }[] = [
      { v: 1, label: '1 col' },
      { v: 2, label: '2 cols' },
      { v: 3, label: '3 cols' },
    ]
    return (
      <FormField label="Widget size">
        <div style={{ display: 'flex', gap: 6 }}>
          {opts.map(o => (
            <button
              key={o.v}
              type="button"
              onClick={() => setSpan(o.v)}
              style={{
                flex: 1, padding: '5px 0', fontSize: 10, border: 'none', borderRadius: 5, cursor: 'pointer',
                background: span === o.v ? 'rgba(99,102,241,0.22)' : 'var(--border)',
                color: span === o.v ? 'var(--accent)' : 'var(--muted)',
                fontFamily: 'inherit', fontWeight: span === o.v ? 700 : 400,
              }}
            >{o.label}</button>
          ))}
        </div>
      </FormField>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, width: 400, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 72px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <LayoutDashboard size={13} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
            {step === 'pick' ? 'Add Widget' : WIDGET_META[type].label}
          </span>
          {/* Step breadcrumb */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <StepDot active={step === 'pick'} done={step === 'config'} n={1} />
            <div style={{ width: 12, height: 1, background: 'var(--border)' }} />
            <StepDot active={step === 'config'} done={false} n={2} />
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, marginLeft: 4 }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '14px 16px' }}>
          {step === 'pick' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 10, color: 'var(--muted)', margin: '0 0 6px 0' }}>Choose a widget type to add to your dashboard.</p>
              {WIDGET_TYPES.map(wt => {
                const meta = WIDGET_META[wt]
                return (
                  <button
                    key={wt}
                    onClick={() => { setType(wt); setStep('config') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7,
                      cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit', color: 'var(--text)',
                      borderLeft: `3px solid ${meta.color}`,
                      transition: 'background 0.1s',
                    }}
                  >
                    <div style={{ flexShrink: 0 }}>{WIDGET_ICONS[wt](meta.color)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{meta.label}</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>{meta.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {step === 'config' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {type === 'service-red' && <>
                <FormField label="Service">
                  <select value={redService} onChange={e => setRedService(e.target.value)} style={selectStyle}>
                    <option value="">— select —</option>
                    {services.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Default window (overridden by global)">
                  <select value={redWindow} onChange={e => setRedWindow(e.target.value as DetailWindow)} style={selectStyle}>
                    {(['1h', '6h', '24h'] as DetailWindow[]).map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </FormField>
              </>}

              {type === 'top-services' && <>
                <FormField label="Default window (overridden by global)">
                  <select value={tsWindow} onChange={e => setTsWindow(e.target.value as TimeWindow)} style={selectStyle}>
                    {(['5m', '15m', '1h', '6h', '24h'] as TimeWindow[]).map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </FormField>
                <FormField label="Max rows">
                  <select value={tsLimit} onChange={e => setTsLimit(Number(e.target.value))} style={selectStyle}>
                    {[3, 5, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </FormField>
              </>}

              {type === 'active-alerts' && (
                <FormField label="Window">
                  <select value={aaWindow} onChange={e => setAaWindow(e.target.value as AlertWindow)} style={selectStyle}>
                    {(['5m', '15m', '1h', '6h', '24h'] as AlertWindow[]).map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </FormField>
              )}

              {type === 'metric-chart' && <>
                <FormField label="Service (optional)">
                  <select value={mcService} onChange={e => setMcService(e.target.value)} style={selectStyle}>
                    <option value="">All services</option>
                    {services.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Metric">
                  <select value={mcMetric} onChange={e => setMcMetric(e.target.value)} style={selectStyle}>
                    <option value="">— select —</option>
                    {metrics.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Default window (overridden by global)">
                  <select value={mcWindow} onChange={e => setMcWindow(e.target.value as DetailWindow)} style={selectStyle}>
                    {(['1h', '6h', '24h'] as DetailWindow[]).map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </FormField>
              </>}

              {type === 'anomaly-alert' && <>
                <FormField label="Window (overridden by global)">
                  <select value={anomWindow} onChange={e => setAnomWindow(e.target.value)} style={selectStyle}>
                    {['1h', '6h', '24h'].map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </FormField>
                <FormField label="Service (optional)">
                  <select value={anomService} onChange={e => setAnomService(e.target.value)} style={selectStyle}>
                    <option value="">All services</option>
                    {services.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Severity (optional)">
                  <select value={anomSeverity} onChange={e => setAnomSeverity(e.target.value)} style={selectStyle}>
                    <option value="">All</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </FormField>
              </>}

              {type === 'forecast-anomaly' && (
                <FormField label="Severity (optional)">
                  <select value={fcSeverity} onChange={e => setFcSeverity(e.target.value)} style={selectStyle}>
                    <option value="">All</option>
                    <option value="warn">Warn</option>
                    <option value="critical">Critical</option>
                  </select>
                </FormField>
              )}

              {type === 'rag-search' && <>
                <FormField label="Search query">
                  <input
                    type="text"
                    value={ragQuery}
                    onChange={e => setRagQuery(e.target.value)}
                    placeholder="e.g. OutOfMemoryError"
                    style={inputStyle}
                  />
                </FormField>
                <FormField label="Service (optional)">
                  <select value={ragService} onChange={e => setRagService(e.target.value)} style={selectStyle}>
                    <option value="">All services</option>
                    {services.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </FormField>
              </>}

              <SpanSelector />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {step === 'config' && (
            <button onClick={() => setStep('pick')} style={btnSecondary}>Back</button>
          )}
          {step === 'config' && (
            <button onClick={handleAdd} style={btnPrimary}>Add Widget</button>
          )}
        </div>
      </div>
    </div>
  )
}

function StepDot({ active, done, n }: { active: boolean; done: boolean; n: number }) {
  return (
    <div style={{
      width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700,
      background: active ? 'var(--accent)' : done ? 'rgba(99,102,241,0.3)' : 'var(--border)',
      color: active ? '#fff' : done ? 'var(--accent)' : 'var(--muted)',
    }}>{n}</div>
  )
}

// -----------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------

export function CustomDashboard() {
  const [{ dashboards, activeId }, setStorage] = useState<StorageV2>(loadStorage)
  const [editMode, setEditMode] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [globalWindow, setGlobalWindow] = useState<DetailWindow | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dragOver, setDragOver] = useState<number | null>(null)

  const dragSrcIdx = useRef<number | null>(null)

  const activeDashboard = dashboards.find(d => d.id === activeId) ?? dashboards[0]
  const widgets = activeDashboard?.widgets ?? []

  function persistAll(nextDashboards: Dashboard[], nextActiveId: string) {
    setStorage({ dashboards: nextDashboards, activeId: nextActiveId })
    saveStorage({ dashboards: nextDashboards, activeId: nextActiveId })
  }

  function persist(nextWidgets: Widget[]) {
    const nextDashboards = dashboards.map(d =>
      d.id === activeId ? { ...d, widgets: nextWidgets } : d
    )
    persistAll(nextDashboards, activeId)
  }

  function handleAdd(widget: Widget) { persist([...widgets, widget]) }
  function handleRemove(id: string) { persist(widgets.filter(w => w.id !== id)) }
  function handleSpan(id: string, s: 1 | 2 | 3) { persist(widgets.map(w => w.id === id ? { ...w, span: s } : w)) }

  function handleDragStart(idx: number) { dragSrcIdx.current = idx }
  function handleDragEnd() { dragSrcIdx.current = null; setDragOver(null) }

  function handleDrop(idx: number) {
    const src = dragSrcIdx.current
    if (src === null || src === idx) return
    const next = [...widgets]
    const [moved] = next.splice(src, 1)
    next.splice(idx, 0, moved)
    persist(next)
    dragSrcIdx.current = null
    setDragOver(null)
  }

  function handleCreateDashboard() {
    const id = genId()
    persistAll([...dashboards, { id, name: `Dashboard ${dashboards.length + 1}`, widgets: [] }], id)
  }

  function handleDeleteDashboard(id: string) {
    if (dashboards.length <= 1) return
    const next = dashboards.filter(d => d.id !== id)
    persistAll(next, id === activeId ? next[0].id : activeId)
  }

  function handleRenameStart(d: Dashboard) { setRenamingId(d.id); setRenameValue(d.name) }

  function handleRenameCommit() {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return }
    persistAll(dashboards.map(d => d.id === renamingId ? { ...d, name: renameValue.trim() } : d), activeId)
    setRenamingId(null)
  }

  function handleExport() {
    const json = JSON.stringify({ dashboards, activeId }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `javi-dashboards-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target?.result as string) as StorageV2
          if (parsed.dashboards && parsed.activeId) {
            persistAll(parsed.dashboards, parsed.activeId)
          }
        } catch { /* invalid json */ }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  function handleDuplicate() {
    if (!activeDashboard) return
    const id = genId()
    persistAll([...dashboards, { id, name: `${activeDashboard.name} (copy)`, widgets: [...activeDashboard.widgets.map(w => ({ ...w, id: genId() }))] }], id)
  }

  const GLOBAL_OPTIONS: Array<{ label: string; value: DetailWindow | null }> = [
    { label: 'Widget', value: null },
    { label: '1h', value: '1h' },
    { label: '6h', value: '6h' },
    { label: '24h', value: '24h' },
  ]

  return (
    <GlobalWindowCtx.Provider value={globalWindow}>
      <div style={{ padding: '18px 22px', maxWidth: 1440, margin: '0 auto' }}>

        {/* ── Page header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LayoutDashboard size={14} style={{ color: 'var(--accent)' }} />
            <h1 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Custom Dashboard</h1>
            <span style={{ fontSize: 9, background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', borderRadius: 4, padding: '2px 7px', letterSpacing: '0.04em' }}>
              PHASE 10
            </span>
          </div>

          {/* Separator */}
          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

          {/* Global time range */}
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--muted)', marginRight: 3 }}>Global:</span>
            {GLOBAL_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => setGlobalWindow(opt.value)}
                style={{
                  padding: '3px 8px', fontSize: 9, border: 'none', borderRadius: 4, cursor: 'pointer',
                  background: globalWindow === opt.value ? 'rgba(99,102,241,0.2)' : 'transparent',
                  color: globalWindow === opt.value ? 'var(--accent)' : 'var(--muted)',
                  fontFamily: 'inherit', fontWeight: globalWindow === opt.value ? 700 : 400,
                  outline: 'none',
                }}
              >{opt.label}</button>
            ))}
          </div>

          {/* Right controls */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* Import / Export / Duplicate */}
            <div style={{ display: 'flex', gap: 4 }}>
              <IconBtn icon={<Download size={12} />} title="Export dashboards" onClick={handleExport} />
              <IconBtn icon={<Upload size={12} />} title="Import dashboards" onClick={handleImport} />
              <IconBtn icon={<Copy size={12} />} title="Duplicate current dashboard" onClick={handleDuplicate} />
            </div>

            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

            {editMode && (
              <button
                onClick={() => setShowAdd(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 13px', fontSize: 11, fontWeight: 600, background: 'rgba(99,102,241,0.2)', color: 'var(--accent)', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <Plus size={12} /> Add Widget
              </button>
            )}
            <button
              onClick={() => setEditMode(e => !e)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 13px', fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                background: editMode ? 'rgba(16,185,129,0.12)' : 'transparent',
                color: editMode ? 'var(--success)' : 'var(--muted)',
              }}
            >
              {editMode ? <><Check size={12} /> Done</> : <><Pencil size={12} /> Edit</>}
            </button>
          </div>
        </div>

        {/* ── Dashboard tabs ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {dashboards.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, position: 'relative' }}>
              {renamingId === d.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={handleRenameCommit}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRenameCommit()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  style={{ ...inputStyle, width: 100, padding: '3px 8px', fontSize: 10 }}
                />
              ) : (
                <>
                  <button
                    onClick={() => persistAll(dashboards, d.id)}
                    onDoubleClick={() => editMode && handleRenameStart(d)}
                    title={editMode ? 'Double-click to rename' : undefined}
                    style={{
                      padding: '8px 14px', fontSize: 10, fontWeight: d.id === activeId ? 700 : 400,
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: 'transparent',
                      color: d.id === activeId ? 'var(--accent)' : 'var(--muted)',
                      outline: 'none',
                      borderBottom: d.id === activeId ? '2px solid var(--accent)' : '2px solid transparent',
                      marginBottom: -1,
                    }}
                  >{d.name}</button>
                  {editMode && dashboards.length > 1 && (
                    <button
                      onClick={() => handleDeleteDashboard(d.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', padding: '0 2px', display: 'flex', opacity: 0.6 }}
                    >
                      <X size={9} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <button
            onClick={handleCreateDashboard}
            style={{ padding: '8px 10px', fontSize: 10, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--muted)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, borderBottom: '2px solid transparent', marginBottom: -1 }}
          >
            <Plus size={10} />
          </button>
        </div>

        {/* ── Empty state ── */}
        {widgets.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 10, gap: 10, color: 'var(--muted)' }}>
            <LayoutDashboard size={36} style={{ opacity: 0.2 }} />
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--text)', opacity: 0.5 }}>This dashboard is empty</p>
            <p style={{ fontSize: 10, margin: 0 }}>Click <strong>Edit</strong> then <strong>Add Widget</strong> to get started</p>
            <button
              onClick={() => { setEditMode(true); setShowAdd(true) }}
              style={{ marginTop: 6, padding: '7px 20px', fontSize: 11, fontWeight: 600, background: 'rgba(99,102,241,0.2)', color: 'var(--accent)', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Add your first widget
            </button>
          </div>
        )}

        {/* ── Widget grid ── */}
        {widgets.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {widgets.map((widget, idx) => {
              const meta = WIDGET_META[widget.type]
              const isDragTarget = dragOver === idx && dragSrcIdx.current !== null && dragSrcIdx.current !== idx
              return (
                <div
                  key={widget.id}
                  draggable={editMode}
                  onDragStart={() => handleDragStart(idx)}
                  onDragEnd={handleDragEnd}
                  onDragOver={e => { e.preventDefault(); setDragOver(idx) }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => handleDrop(idx)}
                  style={{
                    gridColumn: `span ${widget.span ?? 1}`,
                    background: 'var(--surface)',
                    border: isDragTarget ? `1px solid ${meta.color}` : '1px solid var(--border)',
                    borderTop: `2px solid ${meta.color}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                    cursor: editMode ? 'grab' : 'default',
                    boxShadow: isDragTarget ? `0 0 0 2px ${meta.color}30` : 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                >
                  {/* Edit bar */}
                  {editMode && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                      background: `${meta.color}0d`,
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <GripVertical size={11} style={{ color: meta.color, opacity: 0.7 }} />
                      <span style={{ fontSize: 9, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, alignItems: 'center' }}>
                        {([1, 2, 3] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => handleSpan(widget.id, s)}
                            style={{
                              fontSize: 8, padding: '2px 6px', border: 'none', borderRadius: 3, cursor: 'pointer',
                              background: (widget.span ?? 1) === s ? `${meta.color}30` : 'var(--border)',
                              color: (widget.span ?? 1) === s ? meta.color : 'var(--muted)',
                              fontFamily: 'inherit', fontWeight: (widget.span ?? 1) === s ? 700 : 400,
                            }}
                          >{s}×</button>
                        ))}
                        <button
                          onClick={() => handleRemove(widget.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', padding: '2px 3px', display: 'flex', marginLeft: 2, opacity: 0.8 }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  )}
                  <WidgetContent widget={widget} />
                </div>
              )
            })}
          </div>
        )}

        {showAdd && <AddWidgetPanel onAdd={handleAdd} onClose={() => setShowAdd(false)} />}
      </div>
    </GlobalWindowCtx.Provider>
  )
}

// -----------------------------------------------------------------------
// Icon button helper
// -----------------------------------------------------------------------

function IconBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 5,
        background: 'transparent', cursor: 'pointer', color: 'var(--muted)',
        outline: 'none',
      }}
    >
      {icon}
    </button>
  )
}
