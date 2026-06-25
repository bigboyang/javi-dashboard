import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScatterChart, WifiOff } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { fetchOutliers } from '../api/outliers'
import { fetchServices } from '../api/apm'
import type { OutlierType, OutlierItem } from '../api/outliers'

const WINDOWS = ['15m', '1h', '6h', '24h'] as const
type Window = (typeof WINDOWS)[number]

const TABS: { key: OutlierType; label: string; hint: string }[] = [
  { key: 'operations', label: 'Operations', hint: 'Endpoints slower than their service peers' },
  { key: 'instances', label: 'Instances', hint: 'Service instances slower than their peers' },
  { key: 'resources', label: 'Resources', hint: 'Pods using more CPU/memory than their peers' },
]

function fmtValue(type: OutlierType, v: number): string {
  if (type === 'resources') return `${v.toFixed(0)}m` // millicores
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(0)}ms`
}

function fmtBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)}GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)}MB`
  if (b >= 1024) return `${(b / 1024).toFixed(0)}KB`
  return `${b.toFixed(0)}B`
}

function zColor(z: number): string {
  if (z >= 3) return 'var(--health-critical, #ef4444)'
  if (z >= 2) return 'var(--warning, #f59e0b)'
  return 'var(--muted)'
}

function OutlierRow({ item, type }: { item: OutlierItem; type: OutlierType }) {
  // How many × above the peer baseline (informational).
  const ratio = item.baseline > 0 ? item.value / item.baseline : 0
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '8px 12px', fontSize: 12 }}>
        <span style={{ color: 'var(--text)', fontWeight: 600, fontFamily: 'monospace' }}>{item.label}</span>
      </td>
      <td style={{ padding: '8px 12px', fontSize: 12 }}>
        <Link to="/services/$name" params={{ name: item.service }} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
          {item.service}
        </Link>
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>
        {fmtValue(type, item.value)}
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
        {fmtValue(type, item.baseline)}
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12 }}>
        <span style={{ color: zColor(item.z_score), fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {item.z_score.toFixed(1)}σ
        </span>
        {ratio > 0 && (
          <span style={{ color: 'var(--muted)', fontSize: 10, marginLeft: 6 }}>({ratio.toFixed(1)}×)</span>
        )}
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
        {type === 'resources' ? fmtBytes(item.secondary) : `${(item.error_rate * 100).toFixed(1)}%`}
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
        {item.count.toLocaleString()}
      </td>
    </tr>
  )
}

export function OutliersPage() {
  const [type, setType] = useState<OutlierType>('operations')
  const [window, setWindow] = useState<Window>('1h')
  const [service, setService] = useState('')

  const { data: svcData } = useQuery({
    queryKey: ['services', '24h'],
    queryFn: () => fetchServices('24h'),
  })
  const services = svcData?.services?.map(s => s.name) ?? []

  const { data, isLoading, error } = useQuery({
    queryKey: ['outliers', type, window, service],
    queryFn: () => fetchOutliers(type, window, service || undefined),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const items = data?.items ?? []
  const activeTab = TABS.find(t => t.key === type)!
  const secondaryHeader = type === 'resources' ? 'Memory' : 'Error %'

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <ScatterChart size={18} style={{ color: 'var(--accent)' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Outliers</h1>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>
          {items.length}
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px' }}>
        {activeTab.hint} · scored by z-score (σ) against same-service peers.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            style={{
              padding: '8px 16px', border: 'none', cursor: 'pointer', background: 'transparent',
              fontSize: 13, fontWeight: type === t.key ? 700 : 400,
              color: type === t.key ? 'var(--accent)' : 'var(--muted)',
              borderBottom: `2px solid ${type === t.key ? 'var(--accent)' : 'transparent'}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
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

        <select
          value={service}
          onChange={e => setService(e.target.value)}
          style={{
            fontSize: 12, padding: '5px 10px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', cursor: 'pointer',
          }}
        >
          <option value="">All services</option>
          {services.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--health-critical)' }}>
          <WifiOff size={32} style={{ marginBottom: 8 }} />
          <div>Failed to load outliers</div>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>
          <ScatterChart size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
          <div>No outliers detected</div>
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
            {type === 'instances'
              ? 'Needs ≥3 instances per service reporting service.instance.id / host.name attributes.'
              : type === 'resources'
                ? 'Needs ≥3 pods per service in k8s_pod_metrics.'
                : 'Needs ≥3 operations per service with enough traffic.'}
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                  {type === 'operations' ? 'Operation' : type === 'instances' ? 'Instance' : 'Pod'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Service</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Value</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Peer Avg</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Deviation</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{secondaryHeader}</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Samples</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <OutlierRow key={`${it.service}-${it.label}`} item={it} type={type} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
