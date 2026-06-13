import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Target, Plus, Trash2, WifiOff, CheckCircle, AlertTriangle } from 'lucide-react'
import { fetchSLOStatus, createSLO, deleteSLO } from '../api/slo'
import { fetchServices } from '../api/apm'
import type { SLOStatusItem, CreateSLORequest } from '../api/slo'

function ComplianceBadge({ compliant, errorRate, targetPct }: { compliant: boolean; errorRate: number; targetPct: number }) {
  const errorBudget = 1 - targetPct / 100
  const errorRatePct = (errorRate * 100).toFixed(2)
  const budgetPct = (errorBudget * 100).toFixed(2)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {compliant
        ? <CheckCircle size={14} style={{ color: 'var(--health-ok)' }} />
        : <AlertTriangle size={14} style={{ color: 'var(--health-critical)' }} />}
      <span style={{
        fontSize: 11, fontWeight: 600,
        color: compliant ? 'var(--health-ok)' : 'var(--health-critical)',
      }}>
        {compliant ? 'Compliant' : 'Breached'}
      </span>
      <span style={{ fontSize: 10, color: 'var(--muted)' }}>
        {errorRatePct}% err / budget {budgetPct}%
      </span>
    </div>
  )
}

function BurnRateBadge({ severity, rate }: { severity: string; rate: number }) {
  const color = severity === 'critical' ? 'var(--health-critical)' : severity === 'high' ? 'var(--health-warn)' : '#f59e0b'
  return (
    <span style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 8,
      background: `${color}22`, color,
      fontWeight: 700,
    }}>
      {severity} {rate.toFixed(1)}×
    </span>
  )
}

function SLOCard({ item, onDelete }: { item: SLOStatusItem; onDelete: () => void }) {
  const windowLabel = item.window_hours >= 720 ? '30d' : item.window_hours >= 168 ? '7d' : `${item.window_hours}h`
  const activeBurns = item.burn_alerts.filter(a => {
    const age = Date.now() - new Date(a.alerted_at).getTime()
    return age < 4 * 3600_000
  })

  return (
    <div style={{
      border: `1px solid ${item.compliant ? 'var(--border)' : 'var(--health-critical)'}`,
      borderRadius: 8, background: 'var(--surface)', padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{item.slo_name}</span>
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 8,
              background: 'rgba(99,102,241,0.12)', color: 'var(--accent)',
            }}>
              {item.service_name}
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>
              {item.metric_type} · {item.target_pct}% · {windowLabel}
            </span>
          </div>
          <ComplianceBadge
            compliant={item.compliant}
            errorRate={item.current_error_rate}
            targetPct={item.target_pct}
          />
          {activeBurns.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {activeBurns.map((a, i) => (
                <BurnRateBadge key={i} severity={a.severity} rate={a.burn_rate} />
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onDelete}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', padding: 4, borderRadius: 4,
          }}
          title="Delete SLO"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function CreateSLOForm({ services, onClose }: { services: string[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<CreateSLORequest>({
    service_name: services[0] ?? '',
    slo_name: '',
    window_hours: 720,
    target_pct: 99.9,
    metric_type: 'error_rate',
    threshold_ms: 0,
  })
  const [err, setErr] = useState('')

  const mutation = useMutation({
    mutationFn: createSLO,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sloStatus'] })
      onClose()
    },
    onError: (e: Error) => setErr(e.message),
  })

  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }
  const inputStyle: React.CSSProperties = {
    fontSize: 12, padding: '6px 10px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', width: '100%',
  }

  return (
    <div style={{
      border: '1px solid var(--accent)', borderRadius: 8,
      background: 'var(--surface)', padding: '20px 24px',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>
        New SLO Definition
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Service</label>
          <select
            value={form.service_name}
            onChange={e => setForm(f => ({ ...f, service_name: e.target.value }))}
            style={inputStyle}
          >
            {services.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>SLO Name</label>
          <input
            type="text"
            placeholder="e.g. availability-99.9"
            value={form.slo_name}
            onChange={e => setForm(f => ({ ...f, slo_name: e.target.value }))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Metric Type</label>
          <select
            value={form.metric_type}
            onChange={e => setForm(f => ({ ...f, metric_type: e.target.value as CreateSLORequest['metric_type'] }))}
            style={inputStyle}
          >
            <option value="error_rate">Error Rate</option>
            <option value="latency_p95">Latency P95</option>
            <option value="latency_p99">Latency P99</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Target (%)</label>
          <input
            type="number"
            min={0} max={100} step={0.1}
            value={form.target_pct}
            onChange={e => setForm(f => ({ ...f, target_pct: parseFloat(e.target.value) }))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Window (hours)</label>
          <select
            value={form.window_hours}
            onChange={e => setForm(f => ({ ...f, window_hours: parseInt(e.target.value) }))}
            style={inputStyle}
          >
            <option value={24}>24h</option>
            <option value={168}>7d</option>
            <option value={720}>30d</option>
          </select>
        </div>
        {form.metric_type !== 'error_rate' && (
          <div>
            <label style={labelStyle}>Threshold (ms)</label>
            <input
              type="number"
              min={0}
              value={form.threshold_ms}
              onChange={e => setForm(f => ({ ...f, threshold_ms: parseFloat(e.target.value) }))}
              style={inputStyle}
            />
          </div>
        )}
      </div>
      {err && <div style={{ fontSize: 11, color: 'var(--health-critical)', marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{
            fontSize: 12, padding: '6px 14px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--muted)', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending || !form.slo_name || !form.service_name}
          style={{
            fontSize: 12, padding: '6px 14px', borderRadius: 6,
            border: 'none', background: 'var(--accent)',
            color: '#fff', cursor: 'pointer', fontWeight: 600,
          }}
        >
          {mutation.isPending ? 'Creating…' : 'Create SLO'}
        </button>
      </div>
    </div>
  )
}

export function SloDashboard() {
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data: svcData } = useQuery({
    queryKey: ['services', '24h'],
    queryFn: () => fetchServices('24h'),
  })
  const services = svcData?.services?.map(s => s.name) ?? []

  const { data, isLoading, error } = useQuery({
    queryKey: ['sloStatus'],
    queryFn: fetchSLOStatus,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: ({ service, name }: { service: string; name: string }) => deleteSLO(service, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sloStatus'] }),
  })

  const items = data?.items ?? []
  const breached = items.filter(i => !i.compliant).length
  const total = items.length

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Target size={18} style={{ color: 'var(--accent)' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>SLO Dashboard</h1>
        {total > 0 && (
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: breached > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
            color: breached > 0 ? 'var(--health-critical)' : 'var(--health-ok)',
          }}>
            {breached > 0 ? `${breached} breached` : `${total} compliant`}
          </span>
        )}
        <button
          onClick={() => setShowCreate(v => !v)}
          style={{
            marginLeft: 'auto', fontSize: 12, padding: '6px 12px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <Plus size={13} />
          New SLO
        </button>
      </div>

      {showCreate && (
        <div style={{ marginBottom: 20 }}>
          <CreateSLOForm services={services} onClose={() => setShowCreate(false)} />
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--health-critical)' }}>
          <WifiOff size={32} style={{ marginBottom: 8 }} />
          <div>Failed to load SLO status</div>
        </div>
      ) : items.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: 'var(--muted)',
          border: '1px dashed var(--border)', borderRadius: 8,
        }}>
          <Target size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
          <div>No SLOs defined yet</div>
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
            Click "New SLO" to define your first Service Level Objective
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
            <SLOCard
              key={`${item.service_name}-${item.slo_name}`}
              item={item}
              onDelete={() => deleteMutation.mutate({ service: item.service_name, name: item.slo_name })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
