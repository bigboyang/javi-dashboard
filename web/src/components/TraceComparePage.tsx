import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitCompare, WifiOff, ArrowRight } from 'lucide-react'
import { fetchTraceCompare } from '../api/trace_compare'
import type { TraceCompareNode } from '../api/trace_compare'

function fmtMs(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n.toFixed(0)}ms`
}

function deltaColor(d: number): string {
  if (Math.abs(d) < 0.5) return 'var(--muted)'
  return d > 0 ? 'var(--health-critical, #ef4444)' : 'var(--success, #22c55e)'
}

function NodeRow({ node, maxDur }: { node: TraceCompareNode; maxDur: number }) {
  const presence =
    node.present_a && node.present_b ? 'both' : node.present_a ? 'a-only' : 'b-only'
  const barA = maxDur > 0 ? (node.duration_a_ms / maxDur) * 100 : 0
  const barB = maxDur > 0 ? (node.duration_b_ms / maxDur) * 100 : 0

  const tagColor =
    presence === 'a-only' ? 'var(--accent)' : presence === 'b-only' ? 'var(--warning, #f59e0b)' : 'transparent'

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '6px 12px', fontSize: 12 }}>
        <div style={{ paddingLeft: node.depth * 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          {presence !== 'both' && (
            <span style={{ fontSize: 9, fontWeight: 700, color: tagColor, border: `1px solid ${tagColor}`, padding: '0 4px', borderRadius: 6 }}>
              {presence === 'a-only' ? 'A' : 'B'}
            </span>
          )}
          <span style={{ color: 'var(--muted)', fontSize: 10 }}>{node.service}</span>
          <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{node.operation}</span>
        </div>
      </td>
      {/* A */}
      <td style={{ padding: '6px 12px', width: '26%' }}>
        {node.present_a ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 8, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${barA}%`, height: '100%', background: 'var(--accent)', opacity: 0.7 }} />
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text)', minWidth: 48, textAlign: 'right' }}>{fmtMs(node.duration_a_ms)}</span>
          </div>
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
        )}
      </td>
      {/* B */}
      <td style={{ padding: '6px 12px', width: '26%' }}>
        {node.present_b ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 8, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${barB}%`, height: '100%', background: 'var(--warning, #f59e0b)', opacity: 0.7 }} />
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text)', minWidth: 48, textAlign: 'right' }}>{fmtMs(node.duration_b_ms)}</span>
          </div>
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
        )}
      </td>
      {/* delta */}
      <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
        {node.present_a && node.present_b ? (
          <span style={{ color: deltaColor(node.delta_ms) }}>
            {node.delta_ms > 0 ? '+' : ''}{fmtMs(node.delta_ms)}
          </span>
        ) : (
          <span style={{ color: 'var(--muted)' }}>—</span>
        )}
      </td>
    </tr>
  )
}

export function TraceComparePage() {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [submitted, setSubmitted] = useState<{ a: string; b: string } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['traceCompare', submitted?.a, submitted?.b],
    queryFn: () => fetchTraceCompare(submitted!.a, submitted!.b),
    enabled: !!submitted,
  })

  const nodes = data?.nodes ?? []
  const maxDur = nodes.reduce((m, n) => Math.max(m, n.duration_a_ms, n.duration_b_ms), 0)

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <GitCompare size={18} style={{ color: 'var(--accent)' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Trace Comparison</h1>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 18px' }}>
        Align two traces by operation path and diff per-span duration. Paste two trace IDs (e.g. a fast vs a slow request).
      </p>

      {/* Inputs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Trace A (baseline)"
          value={a}
          onChange={e => setA(e.target.value.trim())}
          style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', minWidth: 260, fontFamily: 'monospace' }}
        />
        <ArrowRight size={14} style={{ color: 'var(--muted)' }} />
        <input
          placeholder="Trace B (compare)"
          value={b}
          onChange={e => setB(e.target.value.trim())}
          style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', minWidth: 260, fontFamily: 'monospace' }}
        />
        <button
          onClick={() => a && b && setSubmitted({ a, b })}
          disabled={!a || !b}
          style={{ fontSize: 12, fontWeight: 700, padding: '6px 16px', borderRadius: 6, border: 'none', cursor: a && b ? 'pointer' : 'not-allowed', background: a && b ? 'var(--accent)' : 'var(--surface)', color: a && b ? '#fff' : 'var(--muted)' }}
        >
          Compare
        </button>
      </div>

      {/* Totals */}
      {data && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 12, fontSize: 12 }}>
          <span style={{ color: 'var(--accent)' }}>A total: <strong>{fmtMs(data.total_a_ms)}</strong></span>
          <span style={{ color: 'var(--warning, #f59e0b)' }}>B total: <strong>{fmtMs(data.total_b_ms)}</strong></span>
          <span style={{ color: deltaColor(data.total_b_ms - data.total_a_ms) }}>
            Δ <strong>{data.total_b_ms - data.total_a_ms > 0 ? '+' : ''}{fmtMs(data.total_b_ms - data.total_a_ms)}</strong>
          </span>
        </div>
      )}

      {/* Table */}
      {!submitted ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>
          <GitCompare size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
          <div>Enter two trace IDs to compare</div>
        </div>
      ) : isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--health-critical)' }}>
          <WifiOff size={32} style={{ marginBottom: 8 }} />
          <div>Failed to load comparison</div>
        </div>
      ) : nodes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>
          No spans found for these trace IDs
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Operation</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>A</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--warning, #f59e0b)', fontWeight: 600 }}>B</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Δ (B−A)</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map(n => <NodeRow key={n.path_key} node={n} maxDur={maxDur} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
