import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Network, WifiOff, ChevronRight } from 'lucide-react'
import { fetchDependencyGraph, fetchDependencyCauses } from '../api/jvm'
import type { DependencyEdge } from '../types/jvm'

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function pValueLabel(p: number): { label: string; color: string } {
  if (p < 0.01) return { label: 'strong', color: 'var(--health-critical)' }
  if (p < 0.05) return { label: 'moderate', color: 'var(--warning)' }
  return { label: 'weak', color: 'var(--muted)' }
}

// -----------------------------------------------------------------------
// Causality Matrix (tabular dependency view)
// -----------------------------------------------------------------------

interface MatrixProps {
  edges: DependencyEdge[]
  onSelect: (service: string) => void
  selected: string | null
}

function CausalityMatrix({ edges, onSelect, selected }: MatrixProps) {
  // Collect unique services (sources)
  const sources = Array.from(new Set(edges.map((e) => e.source))).sort()
  const targets = Array.from(new Set(edges.map((e) => e.target))).sort()
  const allServices = Array.from(new Set([...sources, ...targets])).sort()

  // Build lookup: source→target→edge
  const lookup = new Map<string, DependencyEdge>()
  for (const e of edges) lookup.set(`${e.source}→${e.target}`, e)

  if (allServices.length === 0) return null

  const cellSize = 44

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Granger Causality Matrix — row causes column
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 9 }}>
        <thead>
          <tr>
            <th
              style={{
                width: 90,
                minWidth: 90,
                padding: '4px 6px',
                textAlign: 'left',
                color: 'var(--muted)',
                borderBottom: '1px solid var(--border)',
                fontWeight: 400,
              }}
            />
            {allServices.map((svc) => (
              <th
                key={svc}
                style={{
                  width: cellSize,
                  minWidth: cellSize,
                  padding: '4px 2px',
                  textAlign: 'center',
                  color: 'var(--muted)',
                  borderBottom: '1px solid var(--border)',
                  fontWeight: 400,
                  fontSize: 8,
                  maxWidth: cellSize,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={svc}
              >
                {svc.length > 6 ? svc.slice(0, 6) + '…' : svc}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allServices.map((src) => (
            <tr
              key={src}
              style={{
                background: selected === src ? 'rgba(99,102,241,0.08)' : 'transparent',
                cursor: 'pointer',
              }}
              onClick={() => onSelect(src)}
            >
              <td
                style={{
                  padding: '4px 6px',
                  color: selected === src ? 'var(--accent)' : 'var(--text)',
                  fontWeight: selected === src ? 700 : 400,
                  borderBottom: '1px solid rgba(42,45,62,0.4)',
                  whiteSpace: 'nowrap',
                  fontSize: 9,
                  maxWidth: 90,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={src}
              >
                {src}
              </td>
              {allServices.map((tgt) => {
                if (src === tgt) {
                  return (
                    <td
                      key={tgt}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        background: 'rgba(42,45,62,0.3)',
                        borderBottom: '1px solid rgba(42,45,62,0.4)',
                      }}
                    />
                  )
                }
                const edge = lookup.get(`${src}→${tgt}`)
                if (!edge) {
                  return (
                    <td
                      key={tgt}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        borderBottom: '1px solid rgba(42,45,62,0.4)',
                      }}
                    />
                  )
                }
                const { color } = pValueLabel(edge.p_value)
                const intensity = Math.round((1 - edge.p_value) * 100)
                return (
                  <td
                    key={tgt}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      borderBottom: '1px solid rgba(42,45,62,0.4)',
                      position: 'relative',
                    }}
                    title={`${src} → ${tgt}\np_value: ${edge.p_value.toFixed(4)}\nlag: ${edge.max_lag}`}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: color,
                        opacity: 0.15 + (intensity / 100) * 0.7,
                        margin: '0 auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span style={{ fontSize: 7, color: 'var(--text)', fontFamily: 'monospace', opacity: 1 }}>
                        {edge.p_value.toFixed(2)}
                      </span>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// -----------------------------------------------------------------------
// Edge list (sorted by significance)
// -----------------------------------------------------------------------

function EdgeList({ edges, onSelect, selected }: MatrixProps) {
  const sorted = [...edges].sort((a, b) => a.p_value - b.p_value)
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Causal edges — sorted by significance
      </div>
      {sorted.map((e) => {
        const { label, color } = pValueLabel(e.p_value)
        return (
          <div
            key={`${e.source}→${e.target}`}
            onClick={() => onSelect(e.source)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 5,
              marginBottom: 4,
              cursor: 'pointer',
              background: selected === e.source ? 'rgba(99,102,241,0.08)' : 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--text)', fontWeight: 600, minWidth: 80, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.source}>
              {e.source}
            </span>
            <ChevronRight size={10} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: 'var(--text)', minWidth: 80, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.target}>
              {e.target}
            </span>
            <span
              style={{
                fontSize: 9,
                fontFamily: 'monospace',
                color,
                marginLeft: 'auto',
                flexShrink: 0,
              }}
            >
              p={e.p_value.toFixed(4)}
            </span>
            <span
              style={{
                fontSize: 8,
                padding: '1px 5px',
                borderRadius: 3,
                background: color,
                color: 'var(--bg)',
                fontWeight: 600,
                flexShrink: 0,
                opacity: 0.85,
              }}
            >
              {label}
            </span>
            <span style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>
              lag {e.max_lag}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// -----------------------------------------------------------------------
// Causes panel
// -----------------------------------------------------------------------

function CausesPanel({ service }: { service: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dependency-causes', service],
    queryFn: () => fetchDependencyCauses(service),
    staleTime: 60_000,
    retry: 1,
  })

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '14px 16px',
        minWidth: 260,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text)',
          marginBottom: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        Root causes for{' '}
        <span style={{ color: 'var(--accent)' }}>{service}</span>
      </div>

      {isLoading && (
        <div style={{ fontSize: 10, color: 'var(--muted)' }}>loading…</div>
      )}

      {isError && (
        <div style={{ fontSize: 10, color: 'var(--error)' }}>
          Failed to load causes.
        </div>
      )}

      {data && data.root_causes.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
          No Granger-causal predecessors detected.
        </div>
      )}

      {data && data.root_causes.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Granger predecessors
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            {data.root_causes.map((rc) => (
              <span
                key={rc}
                style={{
                  fontSize: 9,
                  padding: '2px 8px',
                  borderRadius: 3,
                  background: 'rgba(239,68,68,0.12)',
                  color: 'var(--error)',
                  fontWeight: 600,
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                {rc}
              </span>
            ))}
          </div>
        </>
      )}

      {data && data.upstream_edges.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Upstream edges
          </div>
          {data.upstream_edges.map((e) => {
            const { color } = pValueLabel(e.p_value)
            return (
              <div
                key={`${e.source}→${e.target}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 8px',
                  marginBottom: 4,
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  fontSize: 9,
                }}
              >
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{e.source}</span>
                <ChevronRight size={9} style={{ color: 'var(--muted)' }} />
                <span style={{ color: 'var(--text)' }}>{e.target}</span>
                <span style={{ marginLeft: 'auto', color, fontFamily: 'monospace' }}>
                  p={e.p_value.toFixed(4)}
                </span>
                <span style={{ color: 'var(--muted)' }}>lag {e.max_lag}</span>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// CausalityExplorer
// -----------------------------------------------------------------------

type ViewMode = 'matrix' | 'list'

export function CausalityExplorer() {
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  const { data: edges, isLoading, isError } = useQuery({
    queryKey: ['dependency-graph'],
    queryFn: fetchDependencyGraph,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  })

  const edgeList = edges ?? []

  return (
    <div style={{ padding: '16px 20px', maxWidth: 1100, margin: '0 auto' }}>
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
          <Network size={15} style={{ color: 'var(--accent)' }} />
          Granger Causality Explorer
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
            ML CAUSALITY
          </span>
          {edgeList.length > 0 && (
            <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>
              {edgeList.length} edge{edgeList.length !== 1 ? 's' : ''}
            </span>
          )}
        </h1>
        <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>
          Granger causality detects which services statistically predict failures in others. Lower p-value = stronger causal signal.
        </p>
      </div>

      {/* Unavailable */}
      {isError && !isLoading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            background: 'rgba(99,102,241,0.07)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--muted)',
            fontSize: 11,
            marginBottom: 14,
          }}
        >
          <WifiOff size={13} />
          javi-forecast dependency graph unavailable — ensure javi-forecast is running.
        </div>
      )}

      {isLoading && (
        <div style={{ color: 'var(--muted)', fontSize: 11 }}>loading causality graph…</div>
      )}

      {!isLoading && !isError && edgeList.length === 0 && (
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: 11,
            border: '1px dashed var(--border)',
            borderRadius: 8,
          }}
        >
          No causal edges detected yet. Granger analysis requires at least 30 minutes of RED metric history.
        </div>
      )}

      {edgeList.length > 0 && (
        <>
          {/* View toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
            {(['list', 'matrix'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                style={{
                  fontSize: 10,
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === m ? 'rgba(99,102,241,0.2)' : 'var(--border)',
                  color: viewMode === m ? 'var(--accent)' : 'var(--muted)',
                  fontFamily: 'inherit',
                  fontWeight: viewMode === m ? 700 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {m}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
            {/* Main panel */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '14px 16px',
              }}
            >
              {viewMode === 'matrix' ? (
                <CausalityMatrix
                  edges={edgeList}
                  onSelect={setSelectedService}
                  selected={selectedService}
                />
              ) : (
                <EdgeList
                  edges={edgeList}
                  onSelect={setSelectedService}
                  selected={selectedService}
                />
              )}
            </div>

            {/* Causes panel */}
            {selectedService && (
              <CausesPanel service={selectedService} />
            )}
            {!selectedService && (
              <div
                style={{
                  padding: '20px 16px',
                  background: 'var(--surface)',
                  border: '1px dashed var(--border)',
                  borderRadius: 8,
                  color: 'var(--muted)',
                  fontSize: 10,
                  textAlign: 'center',
                  minWidth: 200,
                }}
              >
                Click a service to inspect its root causes
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
