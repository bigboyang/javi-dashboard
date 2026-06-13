import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Rocket, Plus, WifiOff } from 'lucide-react'
import { fetchDeploymentEvents, createDeploymentEvent } from '../api/deployments'
import type { DeploymentEvent, CreateDeploymentRequest } from '../api/deployments'

const ENVS = ['', 'production', 'staging', 'development'] as const

const ENV_COLORS: Record<string, string> = {
  production: 'var(--health-critical)',
  staging: 'var(--health-warn)',
  development: 'var(--accent)',
}

function EnvBadge({ env }: { env: string }) {
  const color = ENV_COLORS[env] ?? 'var(--muted)'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px',
      borderRadius: 4, background: color + '22', color,
      textTransform: 'uppercase',
    }}>
      {env}
    </span>
  )
}

const FORM_INIT: CreateDeploymentRequest = {
  service_name: '',
  version: '',
  environment: 'production',
  deployed_by: '',
  description: '',
}

function AddDeploymentForm() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<CreateDeploymentRequest>(FORM_INIT)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (req: CreateDeploymentRequest) => createDeploymentEvent(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment-events'] })
      setForm(FORM_INIT)
      setOpen(false)
    },
  })

  const inp = (key: keyof CreateDeploymentRequest, placeholder: string, full = false) => (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
        {key.replace(/_/g, ' ')}
      </label>
      <input
        type="text"
        value={String(form[key] ?? '')}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '7px 10px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--bg)',
          color: 'var(--text)', fontSize: 12, boxSizing: 'border-box',
        }}
      />
    </div>
  )

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 6, fontSize: 12,
          border: 'none', background: 'var(--accent)', color: '#fff',
          cursor: 'pointer', marginBottom: 16,
        }}
      >
        <Plus size={14} />
        Record Deployment
      </button>
    )
  }

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16, marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
        Record Deployment Event
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {inp('service_name', 'e.g. payment-service')}
        {inp('version', 'e.g. v2.4.1')}
        <div>
          <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
            environment
          </label>
          <select
            value={form.environment}
            onChange={e => setForm(f => ({ ...f, environment: e.target.value as typeof form.environment }))}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', fontSize: 12,
            }}
          >
            {(['production', 'staging', 'development'] as const).map(e => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        {inp('deployed_by', 'e.g. github-actions / username')}
        {inp('description', 'What changed?', true)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => mutation.mutate(form)}
          disabled={!form.service_name || !form.version || mutation.isPending}
          style={{
            padding: '7px 16px', borderRadius: 6, fontSize: 12,
            border: 'none', background: 'var(--accent)', color: '#fff',
            cursor: form.service_name && form.version ? 'pointer' : 'not-allowed',
            opacity: form.service_name && form.version ? 1 : 0.5,
          }}
        >
          {mutation.isPending ? 'Recording...' : 'Record'}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            padding: '7px 16px', borderRadius: 6, fontSize: 12,
            border: '1px solid var(--border)', background: 'var(--card)',
            color: 'var(--text)', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        {mutation.isError && (
          <span style={{ fontSize: 12, color: 'var(--health-critical)', alignSelf: 'center' }}>
            Failed to record
          </span>
        )}
      </div>
    </div>
  )
}

function EventRow({ event }: { event: DeploymentEvent }) {
  const dt = new Date(event.deployed_at)
  const timeStr = dt.toLocaleString()
  const ago = (() => {
    const diffMs = Date.now() - dt.getTime()
    const h = Math.floor(diffMs / 3600_000)
    if (h < 1) return `${Math.floor(diffMs / 60_000)}m ago`
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  })()

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
        <div>{timeStr}</div>
        <div style={{ fontSize: 10, marginTop: 2, color: 'var(--accent)' }}>{ago}</div>
      </td>
      <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
        {event.service_name}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{
          fontFamily: 'monospace', fontSize: 12,
          color: 'var(--text)', fontWeight: 500,
        }}>
          {event.version}
        </span>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <EnvBadge env={event.environment} />
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
        {event.deployed_by || '—'}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)', maxWidth: 250 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.description || '—'}
        </span>
      </td>
    </tr>
  )
}

export function DeploymentEvents() {
  const [service, setService] = useState('')
  const [env, setEnv] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['deployment-events', service, env],
    queryFn: () => fetchDeploymentEvents(service || undefined, env || undefined),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Rocket size={20} color="var(--accent)" />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
          Deployment Events
        </h2>
      </div>

      <AddDeploymentForm />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={service}
          onChange={e => setService(e.target.value)}
          placeholder="Service filter..."
          style={{
            padding: '6px 10px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--card)',
            color: 'var(--text)', fontSize: 12, width: 180,
          }}
        />
        {ENVS.map(e => (
          <button
            key={e}
            onClick={() => setEnv(e)}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12,
              border: '1px solid var(--border)',
              background: env === e ? 'var(--accent)' : 'var(--card)',
              color: env === e ? '#fff' : 'var(--text)',
              cursor: 'pointer',
            }}
          >
            {e === '' ? 'All Envs' : e}
          </button>
        ))}
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          Loading...
        </div>
      )}
      {error && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--health-critical)', fontSize: 13 }}>
          <WifiOff size={18} style={{ marginRight: 6 }} />
          Failed to load deployment events
        </div>
      )}
      {data && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, overflow: 'hidden',
        }}>
          {data.events.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No deployment events yet. Record one above.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  {['Time', 'Service', 'Version', 'Env', 'Deployed By', 'Description'].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left',
                      fontSize: 10, color: 'var(--muted)', fontWeight: 600,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.events.map(e => (
                  <EventRow key={e.id} event={e} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
