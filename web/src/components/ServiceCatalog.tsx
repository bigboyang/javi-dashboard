import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Plus, Trash2, WifiOff, ExternalLink } from 'lucide-react'
import { fetchServiceCatalog, upsertServiceCatalog, deleteServiceCatalog } from '../api/catalog'
import type { ServiceCatalogEntry, CreateCatalogEntryRequest } from '../api/catalog'

const TIERS = ['critical', 'high', 'standard', 'low'] as const

const TIER_COLORS: Record<string, string> = {
  critical: 'var(--health-critical)',
  high: 'var(--health-warn)',
  standard: 'var(--accent)',
  low: 'var(--muted)',
}

function TierBadge({ tier }: { tier: string }) {
  const color = TIER_COLORS[tier] ?? 'var(--muted)'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px',
      borderRadius: 4, background: color + '22', color,
      textTransform: 'uppercase',
    }}>
      {tier}
    </span>
  )
}

const FORM_INIT: CreateCatalogEntryRequest = {
  service_name: '',
  team: '',
  slack_channel: '',
  runbook_url: '',
  tier: 'standard',
  on_call_rotation: '',
  description: '',
}

function AddEntryForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState<CreateCatalogEntryRequest>(FORM_INIT)
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (req: CreateCatalogEntryRequest) => upsertServiceCatalog(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-catalog'] })
      setForm(FORM_INIT)
      setOpen(false)
      onSuccess()
    },
  })

  const field = (key: keyof CreateCatalogEntryRequest, placeholder: string, full = false) => (
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
          border: '1px solid var(--accent)', background: 'var(--accent)',
          color: '#fff', cursor: 'pointer', marginBottom: 16,
        }}
      >
        <Plus size={14} />
        Add Service
      </button>
    )
  }

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16, marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
        Add / Update Service
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {field('service_name', 'e.g. payment-service')}
        {field('team', 'e.g. Platform Team')}
        {field('slack_channel', 'e.g. #payments-oncall')}
        {field('runbook_url', 'https://...')}
        <div>
          <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
            tier
          </label>
          <select
            value={form.tier}
            onChange={e => setForm(f => ({ ...f, tier: e.target.value as typeof form.tier }))}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', fontSize: 12,
            }}
          >
            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {field('on_call_rotation', 'e.g. payments-primary')}
        {field('description', 'Short description...', true)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => mutation.mutate(form)}
          disabled={!form.service_name || mutation.isPending}
          style={{
            padding: '7px 16px', borderRadius: 6, fontSize: 12,
            border: 'none', background: 'var(--accent)', color: '#fff',
            cursor: form.service_name ? 'pointer' : 'not-allowed', opacity: form.service_name ? 1 : 0.5,
          }}
        >
          {mutation.isPending ? 'Saving...' : 'Save'}
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
            Failed to save
          </span>
        )}
      </div>
    </div>
  )
}

function CatalogRow({ entry }: { entry: ServiceCatalogEntry }) {
  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: () => deleteServiceCatalog(entry.service_name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['service-catalog'] }),
  })

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
        {entry.service_name}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <TierBadge tier={entry.tier} />
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
        {entry.team || '—'}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12 }}>
        {entry.slack_channel
          ? <span style={{ color: 'var(--accent)' }}>{entry.slack_channel}</span>
          : <span style={{ color: 'var(--muted)' }}>—</span>
        }
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12 }}>
        {entry.runbook_url
          ? (
            <a href={entry.runbook_url} target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              Runbook <ExternalLink size={11} />
            </a>
          )
          : <span style={{ color: 'var(--muted)' }}>—</span>
        }
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)', maxWidth: 200 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.description || '—'}
        </span>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <button
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          title="Delete"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--health-critical)', padding: 4, borderRadius: 4,
            opacity: deleteMutation.isPending ? 0.4 : 1,
          }}
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  )
}

export function ServiceCatalog() {
  const [, setRefresh] = useState(0)
  const { data, isLoading, error } = useQuery({
    queryKey: ['service-catalog'],
    queryFn: fetchServiceCatalog,
    staleTime: 30_000,
  })

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <BookOpen size={20} color="var(--accent)" />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
          Service Catalog
        </h2>
      </div>

      <AddEntryForm onSuccess={() => setRefresh(r => r + 1)} />

      {isLoading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          Loading...
        </div>
      )}
      {error && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--health-critical)', fontSize: 13 }}>
          <WifiOff size={18} style={{ marginRight: 6 }} />
          Failed to load service catalog
        </div>
      )}
      {data && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, overflow: 'hidden',
        }}>
          {data.entries.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No services in catalog yet. Add one above.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  {['Service', 'Tier', 'Team', 'Slack', 'Runbook', 'Description', ''].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left',
                      fontSize: 10, color: 'var(--muted)', fontWeight: 600,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.entries.map(e => (
                  <CatalogRow key={e.service_name} entry={e} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
