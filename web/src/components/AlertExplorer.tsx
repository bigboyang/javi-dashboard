import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Trash2, Plus, AlertTriangle } from 'lucide-react'
import {
  fetchAlertRules,
  fetchAlertStatus,
  createAlertRule,
  deleteAlertRule,
} from '../api/apm'
import type {
  AlertMetric,
  AlertCondition,
  AlertWindow,
  CreateAlertRuleRequest,
} from '../types/apm'

const METRIC_LABELS: Record<AlertMetric, string> = {
  error_rate: 'Error Rate',
  p95_ms: 'P95 Latency (ms)',
  p99_ms: 'P99 Latency (ms)',
  rate: 'Request Rate (req/min)',
}

const CONDITION_LABELS: Record<AlertCondition, string> = {
  gt: '>',
  lt: '<',
}

function fmtValue(metric: AlertMetric, value: number): string {
  if (metric === 'error_rate') return `${(value * 100).toFixed(2)}%`
  if (metric === 'p95_ms' || metric === 'p99_ms') return `${value.toFixed(1)}ms`
  return `${value.toFixed(1)} req/min`
}

const WINDOWS: AlertWindow[] = ['5m', '15m', '1h', '6h', '24h']

interface AlertExplorerProps {
  services: string[]
}

export function AlertExplorer({ services }: AlertExplorerProps) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formService, setFormService] = useState('')
  const [formMetric, setFormMetric] = useState<AlertMetric>('error_rate')
  const [formCondition, setFormCondition] = useState<AlertCondition>('gt')
  const [formThreshold, setFormThreshold] = useState('0.05')
  const [formWindow, setFormWindow] = useState<AlertWindow>('5m')
  const [formError, setFormError] = useState('')

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: fetchAlertRules,
    refetchInterval: 30_000,
  })

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['alert-status'],
    queryFn: () => fetchAlertStatus('5m'),
    refetchInterval: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: createAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] })
      queryClient.invalidateQueries({ queryKey: ['alert-status'] })
      setShowForm(false)
      resetForm()
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] })
      queryClient.invalidateQueries({ queryKey: ['alert-status'] })
    },
  })

  function resetForm() {
    setFormName('')
    setFormService('')
    setFormMetric('error_rate')
    setFormCondition('gt')
    setFormThreshold('0.05')
    setFormWindow('5m')
    setFormError('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const threshold = parseFloat(formThreshold)
    if (isNaN(threshold) || threshold < 0) {
      setFormError('Threshold must be a non-negative number')
      return
    }
    const req: CreateAlertRuleRequest = {
      name: formName.trim(),
      service: formService,
      metric: formMetric,
      condition: formCondition,
      threshold,
      window: formWindow,
    }
    createMutation.mutate(req)
  }

  const firing = statusData?.firing ?? []
  const rules = rulesData?.rules ?? []

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div
        className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            Alerting
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Threshold-based alerts on RED metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          {firing.length > 0 && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium"
              style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--error)' }}
            >
              <AlertTriangle size={13} />
              <span>{firing.length} firing</span>
            </div>
          )}
          <button
            onClick={() => { setShowForm((v) => !v); setFormError('') }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Plus size={13} />
            New Rule
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
        {/* Create rule form */}
        {showForm && (
          <div
            className="rounded border p-4"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <h2 className="text-sm font-medium mb-4" style={{ color: 'var(--text)' }}>
              Create Alert Rule
            </h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
              >
                <div className="flex flex-col gap-1">
                  <label className="text-xs" style={{ color: 'var(--muted)' }}>Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    maxLength={100}
                    placeholder="High error rate"
                    className="px-2 py-1.5 rounded text-xs outline-none"
                    style={inputStyle}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs" style={{ color: 'var(--muted)' }}>
                    Service (blank = all)
                  </label>
                  <select
                    value={formService}
                    onChange={(e) => setFormService(e.target.value)}
                    className="px-2 py-1.5 rounded text-xs outline-none"
                    style={inputStyle}
                  >
                    <option value="">All services</option>
                    {services.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs" style={{ color: 'var(--muted)' }}>Metric</label>
                  <select
                    value={formMetric}
                    onChange={(e) => setFormMetric(e.target.value as AlertMetric)}
                    className="px-2 py-1.5 rounded text-xs outline-none"
                    style={inputStyle}
                  >
                    {(Object.entries(METRIC_LABELS) as [AlertMetric, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs" style={{ color: 'var(--muted)' }}>Condition</label>
                  <select
                    value={formCondition}
                    onChange={(e) => setFormCondition(e.target.value as AlertCondition)}
                    className="px-2 py-1.5 rounded text-xs outline-none"
                    style={inputStyle}
                  >
                    <option value="gt">{'> (greater than)'}</option>
                    <option value="lt">{'< (less than)'}</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs" style={{ color: 'var(--muted)' }}>
                    Threshold
                    {formMetric === 'error_rate' && (
                      <span style={{ opacity: 0.7 }}> (0–1, e.g. 0.05 = 5%)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={formThreshold}
                    onChange={(e) => setFormThreshold(e.target.value)}
                    required
                    min={0}
                    step="any"
                    className="px-2 py-1.5 rounded text-xs outline-none"
                    style={inputStyle}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs" style={{ color: 'var(--muted)' }}>
                    Evaluation Window
                  </label>
                  <select
                    value={formWindow}
                    onChange={(e) => setFormWindow(e.target.value as AlertWindow)}
                    className="px-2 py-1.5 rounded text-xs outline-none"
                    style={inputStyle}
                  >
                    {WINDOWS.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formError && (
                <p className="text-xs" style={{ color: 'var(--error)' }}>{formError}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-3 py-1.5 rounded text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Rule'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); resetForm() }}
                  className="px-3 py-1.5 rounded text-xs font-medium"
                  style={{ background: 'var(--border)', color: 'var(--muted)' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Firing Alerts */}
        <section>
          <h2
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: 'var(--muted)' }}
          >
            Firing Alerts
          </h2>
          {statusLoading ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Evaluating...</p>
          ) : firing.length === 0 ? (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded border text-xs"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--muted)',
              }}
            >
              <Bell size={13} />
              <span>No alerts firing</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {firing.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3 rounded border text-xs"
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    borderColor: 'rgba(239,68,68,0.3)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle
                      size={13}
                      style={{ color: 'var(--error)', flexShrink: 0 }}
                    />
                    <div>
                      <span className="font-medium" style={{ color: 'var(--text)' }}>
                        {f.rule_name}
                      </span>
                      <span className="mx-1.5" style={{ color: 'var(--muted)' }}>·</span>
                      <span style={{ color: 'var(--error)' }}>{f.service}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span style={{ color: 'var(--muted)' }}>{METRIC_LABELS[f.metric]}</span>
                    <span
                      style={{
                        color: 'var(--error)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtValue(f.metric, f.current_value)}
                      {' '}
                      {CONDITION_LABELS[f.condition]}
                      {' '}
                      {fmtValue(f.metric, f.threshold)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Alert Rules */}
        <section>
          <h2
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: 'var(--muted)' }}
          >
            Alert Rules
          </h2>
          {rulesLoading ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Loading...</p>
          ) : rules.length === 0 ? (
            <div
              className="px-4 py-3 rounded border text-xs"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--muted)',
              }}
            >
              No rules configured. Click "New Rule" to create one.
            </div>
          ) : (
            <div
              className="rounded border overflow-hidden"
              style={{ borderColor: 'var(--border)' }}
            >
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface)' }}>
                    {['Name', 'Service', 'Condition', 'Window', ''].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left font-medium"
                        style={{
                          color: 'var(--muted)',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => {
                    const isFiring = firing.some((f) => f.rule_id === rule.id)
                    return (
                      <tr
                        key={rule.id}
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        <td className="px-4 py-2.5" style={{ color: 'var(--text)' }}>
                          <div className="flex items-center gap-2">
                            {isFiring && (
                              <AlertTriangle
                                size={12}
                                style={{ color: 'var(--error)', flexShrink: 0 }}
                              />
                            )}
                            {rule.name}
                          </div>
                        </td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--muted)' }}>
                          {rule.service || <em>all</em>}
                        </td>
                        <td
                          className="px-4 py-2.5"
                          style={{
                            color: 'var(--text)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {METRIC_LABELS[rule.metric]}
                          {' '}
                          {CONDITION_LABELS[rule.condition]}
                          {' '}
                          {fmtValue(rule.metric, rule.threshold)}
                        </td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--muted)' }}>
                          {rule.window}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => deleteMutation.mutate(rule.id)}
                            disabled={deleteMutation.isPending}
                            className="p-1 rounded transition-opacity hover:opacity-70"
                            style={{ color: 'var(--muted)' }}
                            title="Delete rule"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
