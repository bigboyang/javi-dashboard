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
  Pause,
  Play,
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
// Storage — v1 → v2 migration
// -----------------------------------------------------------------------

const STORAGE_KEY_V1 = 'javi-custom-dashboard-v1'
const STORAGE_KEY_V2 = 'javi-dashboards-v2'

function loadStorage(): StorageV2 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2)
    if (raw) return JSON.parse(raw) as StorageV2
  } catch { /* ignore */ }

  // Migrate from v1
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
// Shared sub-components
// -----------------------------------------------------------------------

function MiniStat({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div style={{ flex: 1, padding: '4px 8px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
      <div style={{ fontSize: 8, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}<span style={{ fontSize: 8, fontWeight: 400, color: 'var(--muted)', marginLeft: 1 }}>{unit}</span>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------
// Widget: ServiceRED — staggered interval 15s
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
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Activity size={11} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>{config.service}</span>
        <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 'auto' }}>{win}</span>
      </div>
      {isLoading && <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>loading…</div>}
      {!isLoading && latest && (
        <>
          <div style={{ display: 'flex', gap: 0, marginBottom: 8, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <MiniStat label="Rate" value={`${latest.rate.toFixed(1)}`} unit="r/m" color="var(--accent)" />
            <MiniStat label="Err%" value={`${(latest.error_rate * 100).toFixed(2)}`} unit="%" color={latest.error_rate > 0.05 ? 'var(--error)' : 'var(--success)'} />
            <MiniStat label="P95" value={`${latest.p95_ms.toFixed(0)}`} unit="ms" color={latest.p95_ms > 500 ? 'var(--warning)' : 'var(--accent)'} />
          </div>
          <Sparkline data={series.map(p => p.rate)} color="var(--accent)" />
        </>
      )}
      {!isLoading && series.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>no data</div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// Widget: TopServices — staggered interval 60s
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
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Server size={11} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>Top Services</span>
        <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 'auto' }}>{win}</span>
      </div>
      {isLoading && <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>loading…</div>}
      {!isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {services.map(svc => (
            <div key={svc.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4, background: 'var(--bg)' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: svc.error_rate > 0.05 ? 'var(--error)' : 'var(--success)', flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svc.name}</span>
              <span style={{ fontSize: 9, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{svc.rate.toFixed(1)} r/m</span>
              <span style={{ fontSize: 9, color: svc.p95_ms > 500 ? 'var(--warning)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{svc.p95_ms.toFixed(0)}ms</span>
            </div>
          ))}
          {services.length === 0 && <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>no data</div>}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// Widget: ActiveAlerts — staggered interval 10s (highest priority)
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
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Bell size={11} style={{ color: firing.length > 0 ? 'var(--error)' : 'var(--accent)' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>Active Alerts</span>
        <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 'auto' }}>{config.window}</span>
        <span style={{
          fontSize: 9, fontWeight: 700,
          background: firing.length > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
          color: firing.length > 0 ? 'var(--error)' : 'var(--success)',
          borderRadius: 3, padding: '1px 5px',
        }}>{firing.length}</span>
      </div>
      {isLoading && <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>loading…</div>}
      {!isLoading && firing.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--success)', textAlign: 'center', padding: '8px 0' }}>All clear</div>
      )}
      {!isLoading && firing.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
          {firing.map((f, i) => (
            <div key={i} style={{ padding: '4px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--error)', marginBottom: 1 }}>{f.rule_name}</div>
              <div style={{ fontSize: 8, color: 'var(--muted)' }}>{f.service} · {f.metric} {f.condition === 'gt' ? '>' : '<'} {f.threshold}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// Widget: MetricChart — staggered interval 30s
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
  const shortMetric = config.metric.length > 28 ? config.metric.slice(0, 25) + '…' : config.metric

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <BarChart2 size={11} style={{ color: '#a78bfa' }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={config.metric}>{shortMetric}</span>
        <span style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>{win}</span>
      </div>
      {config.service && <div style={{ fontSize: 8, color: 'var(--muted)', marginBottom: 6 }}>{config.service}</div>}
      {isLoading && <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>loading…</div>}
      {!isLoading && latest && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', fontVariantNumeric: 'tabular-nums', marginBottom: 6 }}>
            {latest.avg.toFixed(2)}
            <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--muted)', marginLeft: 3 }}>avg</span>
          </div>
          <Sparkline data={avgData} color="#a78bfa" />
        </>
      )}
      {!isLoading && series.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>no data</div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// Widget: AnomalyAlert — AIOps detected anomalies, interval 20s
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
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Zap size={11} style={{ color: critCount > 0 ? 'var(--error)' : '#f59e0b' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>Anomalies</span>
        <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 'auto' }}>{win}</span>
        {anomalies.length > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 700,
            background: critCount > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
            color: critCount > 0 ? 'var(--error)' : '#f59e0b',
            borderRadius: 3, padding: '1px 5px',
          }}>{anomalies.length}</span>
        )}
      </div>
      {isLoading && <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>loading…</div>}
      {!isLoading && anomalies.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--success)', textAlign: 'center', padding: '8px 0' }}>No anomalies</div>
      )}
      {!isLoading && anomalies.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
          {anomalies.slice(0, 8).map(a => (
            <div key={a.id} style={{
              padding: '4px 6px', borderRadius: 4,
              background: a.severity === 'critical' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
              border: `1px solid ${a.severity === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: a.severity === 'critical' ? 'var(--error)' : '#f59e0b', marginBottom: 1 }}>
                {a.service_name} · {a.anomaly_type.replace(/_/g, ' ')}
              </div>
              <div style={{ fontSize: 8, color: 'var(--muted)' }}>
                z={a.z_score.toFixed(1)} · cur={a.current_value.toFixed(1)} / base={a.baseline_value.toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// Widget: ForecastAnomaly — predicted anomalies, interval 60s
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
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <TrendingUp size={11} style={{ color: '#a78bfa' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>Forecast Anomalies</span>
        {anomalies.length > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 700, marginLeft: 'auto',
            background: 'rgba(167,139,250,0.15)', color: '#a78bfa',
            borderRadius: 3, padding: '1px 5px',
          }}>{anomalies.length}</span>
        )}
      </div>
      {isLoading && <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>loading…</div>}
      {!isLoading && anomalies.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--success)', textAlign: 'center', padding: '8px 0' }}>No predicted anomalies</div>
      )}
      {!isLoading && anomalies.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
          {anomalies.slice(0, 8).map(a => (
            <div key={a.id} style={{
              padding: '4px 6px', borderRadius: 4,
              background: a.severity === 'critical' ? 'rgba(239,68,68,0.08)' : 'rgba(167,139,250,0.08)',
              border: `1px solid ${a.severity === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(167,139,250,0.2)'}`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: a.severity === 'critical' ? 'var(--error)' : '#a78bfa', marginBottom: 1 }}>
                {a.service} · {a.metric}
              </div>
              <div style={{ fontSize: 8, color: 'var(--muted)' }}>
                conf={Math.round(a.confidence * 100)}% · {a.description.slice(0, 40)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// Widget: RAGSearch — pre-configured query, interval 120s (cache 60s)
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
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Search size={11} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={config.query}>
          "{config.query}"
        </span>
        <span style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>{data?.total ?? 0} hits</span>
      </div>
      {isLoading && <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>loading…</div>}
      {!isLoading && results.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>No results</div>
      )}
      {!isLoading && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
          {results.map((r, i) => (
            <div key={i} style={{ padding: '4px 6px', borderRadius: 4, background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--accent)', marginBottom: 1 }}>
                {r.service_name}
                <span style={{ fontSize: 8, fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>
                  {Math.round(r.score * 100)}% match
                </span>
              </div>
              <div style={{ fontSize: 8, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
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

const WIDGET_LABELS: Record<WidgetType, string> = {
  'service-red':      'Service RED',
  'top-services':     'Top Services',
  'active-alerts':    'Active Alerts',
  'metric-chart':     'Metric Chart',
  'anomaly-alert':    'Anomaly Alerts',
  'forecast-anomaly': 'Forecast Anomaly',
  'rag-search':       'RAG Search',
}

// -----------------------------------------------------------------------
// Shared form helpers
// -----------------------------------------------------------------------

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '5px 8px', fontSize: 11,
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
  color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '5px 8px', fontSize: 11,
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
  color: 'var(--text)', fontFamily: 'inherit',
}

const btnStyle: React.CSSProperties = {
  padding: '5px 14px', fontSize: 11, border: 'none', borderRadius: 4,
  cursor: 'pointer', fontFamily: 'inherit',
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

  // service-red
  const [redService, setRedService] = useState('')
  const [redWindow, setRedWindow] = useState<DetailWindow>('1h')

  // top-services
  const [tsWindow, setTsWindow] = useState<TimeWindow>('5m')
  const [tsLimit, setTsLimit] = useState(5)

  // active-alerts
  const [aaWindow, setAaWindow] = useState<AlertWindow>('5m')

  // metric-chart
  const [mcMetric, setMcMetric] = useState('')
  const [mcService, setMcService] = useState('')
  const [mcWindow, setMcWindow] = useState<DetailWindow>('1h')

  // anomaly-alert
  const [anomService, setAnomService] = useState('')
  const [anomWindow, setAnomWindow] = useState('1h')
  const [anomSeverity, setAnomSeverity] = useState('')

  // forecast-anomaly
  const [fcSeverity, setFcSeverity] = useState('')

  // rag-search
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

  const WIDGET_TYPES: { type: WidgetType; icon: React.ReactNode; desc: string }[] = [
    { type: 'service-red',      icon: <Activity size={16} style={{ color: 'var(--accent)' }} />,  desc: 'Rate / Error / Latency sparklines for a service' },
    { type: 'top-services',     icon: <Server size={16} style={{ color: 'var(--accent)' }} />,    desc: 'Overview table of top N services' },
    { type: 'active-alerts',    icon: <Bell size={16} style={{ color: 'var(--accent)' }} />,      desc: 'Currently firing alert rules' },
    { type: 'metric-chart',     icon: <BarChart2 size={16} style={{ color: '#a78bfa' }} />,       desc: 'Custom metric time-series sparkline' },
    { type: 'anomaly-alert',    icon: <Zap size={16} style={{ color: '#f59e0b' }} />,             desc: 'AIOps-detected anomalies (Phase 8)' },
    { type: 'forecast-anomaly', icon: <TrendingUp size={16} style={{ color: '#a78bfa' }} />,      desc: 'Predicted anomalies from javi-forecast' },
    { type: 'rag-search',       icon: <Search size={16} style={{ color: 'var(--accent)' }} />,    desc: 'RAG error search with a pre-configured query' },
  ]

  function SpanSelector() {
    return (
      <FormField label="Widget size">
        <div style={{ display: 'flex', gap: 6 }}>
          {([1, 2, 3] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSpan(s)}
              style={{
                flex: 1, padding: '5px 0', fontSize: 10, border: 'none', borderRadius: 4, cursor: 'pointer',
                background: span === s ? 'rgba(99,102,241,0.2)' : 'var(--border)',
                color: span === s ? 'var(--accent)' : 'var(--muted)',
                fontFamily: 'inherit', fontWeight: span === s ? 700 : 400,
              }}
            >
              {s === 1 ? '1 col' : s === 2 ? '2 cols' : '3 cols'}
            </button>
          ))}
        </div>
      </FormField>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, width: 380, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
            {step === 'pick' ? 'Add Widget' : `Configure: ${WIDGET_LABELS[type]}`}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '12px 16px' }}>
          {step === 'pick' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {WIDGET_TYPES.map(wt => (
                <button
                  key={wt.type}
                  onClick={() => { setType(wt.type); setStep('config') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
                    cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit', color: 'var(--text)',
                  }}
                >
                  {wt.icon}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{WIDGET_LABELS[wt.type]}</div>
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{wt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 'config' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {step === 'config' && (
            <button onClick={() => setStep('pick')} style={{ ...btnStyle, background: 'var(--bg)', color: 'var(--muted)' }}>
              Back
            </button>
          )}
          {step === 'config' && (
            <button onClick={handleAdd} style={{ ...btnStyle, background: 'rgba(99,102,241,0.2)', color: 'var(--accent)', fontWeight: 700 }}>
              Add Widget
            </button>
          )}
        </div>
      </div>
    </div>
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

  function handleAdd(widget: Widget) {
    persist([...widgets, widget])
  }

  function handleRemove(id: string) {
    persist(widgets.filter(w => w.id !== id))
  }

  function handleSpan(id: string, s: 1 | 2 | 3) {
    persist(widgets.map(w => w.id === id ? { ...w, span: s } : w))
  }

  function handleDragStart(idx: number) {
    dragSrcIdx.current = idx
  }

  function handleDragEnd() {
    dragSrcIdx.current = null
  }

  function handleDrop(idx: number) {
    const src = dragSrcIdx.current
    if (src === null || src === idx) return
    const next = [...widgets]
    const [moved] = next.splice(src, 1)
    next.splice(idx, 0, moved)
    persist(next)
    dragSrcIdx.current = null
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

  function handleRenameStart(d: Dashboard) {
    setRenamingId(d.id)
    setRenameValue(d.name)
  }

  function handleRenameCommit() {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return }
    persistAll(dashboards.map(d => d.id === renamingId ? { ...d, name: renameValue.trim() } : d), activeId)
    setRenamingId(null)
  }

  const GLOBAL_OPTIONS: Array<{ label: string; value: DetailWindow | null }> = [
    { label: 'Widget', value: null },
    { label: '1h', value: '1h' },
    { label: '6h', value: '6h' },
    { label: '24h', value: '24h' },
  ]

  return (
    <GlobalWindowCtx.Provider value={globalWindow}>
      <div style={{ padding: '16px 20px', maxWidth: 1400, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <LayoutDashboard size={14} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Custom Dashboard</h1>
          <span style={{ fontSize: 9, background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', borderRadius: 3, padding: '2px 6px' }}>
            PHASE 10
          </span>

          {/* Global time range */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginLeft: 8 }}>
            <span style={{ fontSize: 9, color: 'var(--muted)' }}>Global:</span>
            {GLOBAL_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => setGlobalWindow(opt.value)}
                style={{
                  padding: '3px 7px', fontSize: 9, border: 'none', borderRadius: 3, cursor: 'pointer',
                  background: globalWindow === opt.value ? 'rgba(99,102,241,0.2)' : 'var(--border)',
                  color: globalWindow === opt.value ? 'var(--accent)' : 'var(--muted)',
                  fontFamily: 'inherit', fontWeight: globalWindow === opt.value ? 700 : 400,
                }}
              >{opt.label}</button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {editMode && (
              <button
                onClick={() => setShowAdd(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 11, fontWeight: 600, background: 'rgba(99,102,241,0.2)', color: 'var(--accent)', border: 'none', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <Plus size={12} /> Add Widget
              </button>
            )}
            <button
              onClick={() => setEditMode(e => !e)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 11, fontWeight: 600, background: editMode ? 'rgba(16,185,129,0.15)' : 'var(--surface)', color: editMode ? 'var(--success)' : 'var(--muted)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {editMode ? <><Check size={12} /> Done</> : <><Pencil size={12} /> Edit</>}
            </button>
          </div>
        </div>

        {/* Dashboard tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8, overflowX: 'auto' }}>
          {dashboards.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
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
                  style={{ ...inputStyle, width: 100, padding: '2px 6px', fontSize: 10 }}
                />
              ) : (
                <button
                  onClick={() => persistAll(dashboards, d.id)}
                  onDoubleClick={() => editMode && handleRenameStart(d)}
                  title={editMode ? 'Double-click to rename' : undefined}
                  style={{
                    padding: '4px 10px', fontSize: 10, fontWeight: d.id === activeId ? 700 : 400,
                    border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
                    background: d.id === activeId ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: d.id === activeId ? 'var(--accent)' : 'var(--muted)',
                  }}
                >{d.name}</button>
              )}
              {editMode && dashboards.length > 1 && renamingId !== d.id && (
                <button
                  onClick={() => handleDeleteDashboard(d.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', padding: 1, display: 'flex', opacity: 0.7 }}
                >
                  <X size={9} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={handleCreateDashboard}
            style={{ padding: '3px 8px', fontSize: 10, border: '1px dashed var(--border)', borderRadius: 4, cursor: 'pointer', background: 'transparent', color: 'var(--muted)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
          >
            <Plus size={10} />
          </button>
        </div>

        {/* Empty state */}
        {widgets.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, gap: 10, color: 'var(--muted)' }}>
            <LayoutDashboard size={32} style={{ opacity: 0.3 }} />
            <p style={{ fontSize: 12, margin: 0 }}>This dashboard is empty</p>
            <p style={{ fontSize: 10, margin: 0, opacity: 0.6 }}>Click <strong>Edit</strong> → <strong>Add Widget</strong> to get started</p>
            <button
              onClick={() => { setEditMode(true); setShowAdd(true) }}
              style={{ marginTop: 4, padding: '6px 16px', fontSize: 11, fontWeight: 600, background: 'rgba(99,102,241,0.2)', color: 'var(--accent)', border: 'none', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Add your first widget
            </button>
          </div>
        )}

        {/* Widget grid — fixed 3-col to support span */}
        {widgets.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {widgets.map((widget, idx) => (
              <div
                key={widget.id}
                draggable={editMode}
                onDragStart={() => handleDragStart(idx)}
                onDragEnd={handleDragEnd}
                onDragOver={e => { e.preventDefault() }}
                onDrop={() => handleDrop(idx)}
                style={{
                  gridColumn: `span ${widget.span ?? 1}`,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  position: 'relative',
                  cursor: editMode ? 'grab' : 'default',
                  transition: 'box-shadow 0.15s',
                }}
              >
                {/* Edit overlay */}
                {editMode && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                    borderBottom: '1px solid var(--border)',
                    background: 'rgba(99,102,241,0.06)',
                  }}>
                    <GripVertical size={12} style={{ color: 'var(--muted)' }} />
                    <span style={{ fontSize: 9, color: 'var(--muted)' }}>{WIDGET_LABELS[widget.type]}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, alignItems: 'center' }}>
                      {/* Span resize */}
                      {([1, 2, 3] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => handleSpan(widget.id, s)}
                          style={{
                            fontSize: 8, padding: '1px 5px', border: 'none', borderRadius: 2, cursor: 'pointer',
                            background: (widget.span ?? 1) === s ? 'rgba(99,102,241,0.3)' : 'var(--border)',
                            color: (widget.span ?? 1) === s ? 'var(--accent)' : 'var(--muted)',
                            fontFamily: 'inherit',
                          }}
                        >{s}x</button>
                      ))}
                      <button
                        onClick={() => handleRemove(widget.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', padding: 2, display: 'flex', marginLeft: 2 }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                )}
                <WidgetContent widget={widget} />
              </div>
            ))}
          </div>
        )}

        {showAdd && <AddWidgetPanel onAdd={handleAdd} onClose={() => setShowAdd(false)} />}
      </div>
    </GlobalWindowCtx.Provider>
  )
}
