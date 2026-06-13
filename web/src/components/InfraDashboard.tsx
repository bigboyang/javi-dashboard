import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Server, WifiOff, ChevronRight } from 'lucide-react'
import { fetchInfraPods, fetchInfraTimeseries } from '../api/infra'
import { fetchServices } from '../api/apm'
import type { PodSummary, PodPoint } from '../types/infra'

const WINDOWS = ['1h', '6h', '24h'] as const
type Window = (typeof WINDOWS)[number]

function fmtMem(bytes: number) {
  if (bytes === 0) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function pct(used: number, limit: number) {
  if (limit <= 0) return 0
  return Math.min(100, (used / limit) * 100)
}

// -----------------------------------------------------------------------
// Resource bar
// -----------------------------------------------------------------------

function ResourceBar({ value, limit, label }: { value: number; limit: number; label: string }) {
  const p = pct(value, limit)
  const color = p > 80 ? 'var(--health-critical)' : p > 50 ? 'var(--health-warn)' : 'var(--accent)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', width: 28 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text)', minWidth: 36, textAlign: 'right' }}>
        {p > 0 ? `${p.toFixed(0)}%` : '—'}
      </span>
    </div>
  )
}

// -----------------------------------------------------------------------
// Mini sparkline (SVG, no library)
// -----------------------------------------------------------------------

function Sparkline({ points, field }: { points: PodPoint[]; field: 'cpu_m' | 'mem_bytes' }) {
  if (points.length < 2) return <span style={{ color: 'var(--muted)', fontSize: 11 }}>no data</span>

  const vals = points.map(p => field === 'cpu_m' ? p.cpu_m : p.mem_bytes)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1

  const W = 120
  const H = 32
  const xs = points.map((_, i) => (i / (points.length - 1)) * W)
  const ys = vals.map(v => H - ((v - min) / range) * H)

  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
    </svg>
  )
}

// -----------------------------------------------------------------------
// Pod card
// -----------------------------------------------------------------------

function PodCard({
  pod,
  service,
  window,
}: {
  pod: PodSummary
  service: string
  window: Window
}) {
  const [expanded, setExpanded] = useState(false)

  const { data: ts } = useQuery({
    queryKey: ['infraTs', service, pod.pod_name, window],
    queryFn: () => fetchInfraTimeseries(service, pod.pod_name, window),
    enabled: expanded,
  })

  const cpuPct = pct(pod.avg_cpu_m, pod.cpu_limit_m)
  const memPct = pct(pod.avg_mem_bytes, pod.mem_limit_bytes)

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 8,
      background: 'var(--surface)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
          cursor: 'pointer',
        }}
      >
        <ChevronRight
          size={14}
          style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s', flexShrink: 0,
          }}
        />
        <Server size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace' }}>
            {pod.pod_name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {pod.node_name} · {pod.namespace}
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>CPU avg</div>
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: cpuPct > 80 ? 'var(--health-critical)' : cpuPct > 50 ? 'var(--health-warn)' : 'var(--text)',
            }}>
              {pod.avg_cpu_m.toFixed(0)}m
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Mem avg</div>
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: memPct > 80 ? 'var(--health-critical)' : memPct > 50 ? 'var(--health-warn)' : 'var(--text)',
            }}>
              {fmtMem(pod.avg_mem_bytes)}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
            {/* CPU */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>CPU</div>
              <ResourceBar value={pod.avg_cpu_m} limit={pod.cpu_limit_m} label="avg" />
              <ResourceBar value={pod.max_cpu_m} limit={pod.cpu_limit_m} label="max" />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                limit: {pod.cpu_limit_m > 0 ? `${pod.cpu_limit_m}m` : 'unlimited'}
              </div>
            </div>

            {/* Memory */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>Memory</div>
              <ResourceBar value={pod.avg_mem_bytes} limit={pod.mem_limit_bytes} label="avg" />
              <ResourceBar value={pod.max_mem_bytes} limit={pod.mem_limit_bytes} label="max" />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                limit: {pod.mem_limit_bytes > 0 ? fmtMem(pod.mem_limit_bytes) : 'unlimited'}
              </div>
            </div>
          </div>

          {/* Timeseries sparklines */}
          {ts && ts.points.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>CPU trend</div>
                <Sparkline points={ts.points} field="cpu_m" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Memory trend</div>
                <Sparkline points={ts.points} field="mem_bytes" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------

export function InfraDashboard() {
  const [window, setWindow] = useState<Window>('1h')
  const [service, setService] = useState('')

  const { data: svcData } = useQuery({
    queryKey: ['services', '24h'],
    queryFn: () => fetchServices('24h'),
  })

  const services = svcData?.services?.map(s => s.name) ?? []

  const selectedService = service || services[0] || ''

  const { data, isLoading, error } = useQuery({
    queryKey: ['infraPods', selectedService, window],
    queryFn: () => fetchInfraPods(selectedService, window),
    enabled: !!selectedService,
  })

  const pods = data?.pods ?? []

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Server size={18} style={{ color: 'var(--accent)' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Infrastructure</h1>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 10,
          background: 'rgba(99,102,241,0.12)', color: 'var(--accent)',
        }}>
          {pods.length} pod{pods.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Window */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
          {WINDOWS.map(w => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: window === w ? 700 : 400,
                background: window === w ? 'var(--accent)' : 'transparent',
                color: window === w ? '#fff' : 'var(--muted)',
              }}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Service */}
        <select
          value={service}
          onChange={e => setService(e.target.value)}
          style={{
            fontSize: 12, padding: '5px 10px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', cursor: 'pointer',
          }}
        >
          {services.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Content */}
      {!selectedService ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          Select a service to view pod metrics
        </div>
      ) : isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--health-critical)' }}>
          <WifiOff size={32} style={{ marginBottom: 8 }} />
          <div>Failed to load pod metrics</div>
        </div>
      ) : pods.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: 'var(--muted)',
          border: '1px dashed var(--border)', borderRadius: 8,
        }}>
          <Server size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
          <div>No K8s pod metrics for this service</div>
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
            Requires javi-agent running inside a K8s pod (cgroup metrics)
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pods.map(p => (
            <PodCard key={p.pod_name} pod={p} service={selectedService} window={window} />
          ))}
        </div>
      )}
    </div>
  )
}
