import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Flame, WifiOff, ChevronRight } from 'lucide-react'
import { fetchProfilingSessions, fetchProfilingPayload } from '../api/profiling'
import type { ProfilingSession } from '../api/profiling'

// ---- Collapsed stacktrace parser → flame graph tree ----

interface FlameNode {
  name: string
  value: number
  children: Map<string, FlameNode>
}

function makeNode(name: string): FlameNode {
  return { name, value: 0, children: new Map() }
}

function parseCollapsed(payload: string): FlameNode {
  const root = makeNode('root')
  for (const line of payload.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const lastSpace = trimmed.lastIndexOf(' ')
    if (lastSpace === -1) continue
    const frames = trimmed.slice(0, lastSpace).split(';')
    const count = parseInt(trimmed.slice(lastSpace + 1), 10)
    if (isNaN(count) || count <= 0) continue

    root.value += count
    let cur = root
    for (const frame of frames) {
      const f = frame.trim()
      if (!f) continue
      if (!cur.children.has(f)) {
        cur.children.set(f, makeNode(f))
      }
      const child = cur.children.get(f)!
      child.value += count
      cur = child
    }
  }
  return root
}

// ---- Flame graph SVG renderer ----

const SVG_WIDTH = 800
const ROW_H = 18
const FONT_SIZE = 10
const MAX_DEPTH = 20

function hashColor(name: string): string {
  let h = 5381
  for (let i = 0; i < name.length; i++) h = (h * 33) ^ name.charCodeAt(i)
  const hue = Math.abs(h) % 360
  return `hsl(${hue},60%,50%)`
}

interface FlatRect {
  x: number
  w: number
  y: number
  name: string
  value: number
  color: string
}

function flattenTree(
  node: FlameNode,
  total: number,
  x: number,
  depth: number,
  rects: FlatRect[]
) {
  if (depth > MAX_DEPTH) return
  const w = (node.value / total) * SVG_WIDTH
  if (w < 0.5) return
  const y = depth * ROW_H
  rects.push({ x, w, y, name: node.name, value: node.value, color: hashColor(node.name) })
  let cx = x
  for (const child of node.children.values()) {
    flattenTree(child, total, cx, depth + 1, rects)
    cx += (child.value / total) * SVG_WIDTH
  }
}

function FlameGraph({ payload }: { payload: string }) {
  const [tooltip, setTooltip] = useState<{ rect: FlatRect; mx: number; my: number } | null>(null)

  const { root, rects } = useMemo(() => {
    const root = parseCollapsed(payload)
    const rects: FlatRect[] = []
    if (root.value > 0) {
      for (const child of root.children.values()) {
        flattenTree(child, root.value, 0, 0, rects)
        // x offset is computed in flattenTree starting from 0 cumulatively
      }
      // Recompute with proper x offsets
      rects.length = 0
      let cx = 0
      for (const child of root.children.values()) {
        flattenTree(child, root.value, cx, 0, rects)
        cx += (child.value / root.value) * SVG_WIDTH
      }
    }
    return { root, rects }
  }, [payload])

  const maxDepth = rects.reduce((m, r) => Math.max(m, r.y / ROW_H), 0) + 1
  const svgH = maxDepth * ROW_H + 4

  const shortName = (name: string) => {
    const parts = name.split('.')
    if (parts.length > 2) return parts.slice(-2).join('.')
    return name
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={SVG_WIDTH} height={svgH} style={{ display: 'block' }}>
        {rects.map((r, i) => (
          <g key={i}
            onMouseEnter={e => setTooltip({ rect: r, mx: e.clientX, my: e.clientY })}
            onMouseMove={e => setTooltip(t => t ? { ...t, mx: e.clientX, my: e.clientY } : null)}
            onMouseLeave={() => setTooltip(null)}
          >
            <rect
              x={r.x} y={r.y} width={Math.max(r.w - 1, 0)} height={ROW_H - 1}
              fill={r.color} rx={1}
            />
            {r.w > 30 && (
              <text
                x={r.x + 3} y={r.y + FONT_SIZE + 2}
                fontSize={FONT_SIZE} fill="#fff"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {shortName(r.name).slice(0, Math.floor(r.w / 6))}
              </text>
            )}
          </g>
        ))}
      </svg>
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.mx + 12, top: tooltip.my - 10,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '6px 10px', fontSize: 11, zIndex: 9999,
          pointerEvents: 'none', maxWidth: 400,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', wordBreak: 'break-all' }}>
            {tooltip.rect.name}
          </div>
          <div style={{ color: 'var(--muted)', marginTop: 2 }}>
            {tooltip.rect.value} samples ({((tooltip.rect.value / root.value) * 100).toFixed(1)}%)
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Session list ----

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString()
}

function TypeBadge({ type }: { type: string }) {
  const color = type === 'cpu' ? 'var(--accent)' : '#a78bfa'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px',
      borderRadius: 4, background: color + '22', color,
      textTransform: 'uppercase',
    }}>
      {type}
    </span>
  )
}

function SessionRow({
  session,
  selected,
  onClick,
}: {
  session: ProfilingSession
  selected: boolean
  onClick: () => void
}) {
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border)',
        background: selected ? 'var(--accent)11' : 'transparent',
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      <td style={{ padding: '7px 12px', fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
        {fmtTime(session.sampled_at)}
      </td>
      <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text)' }}>
        {session.service_name}
      </td>
      <td style={{ padding: '7px 12px' }}>
        <TypeBadge type={session.profile_type} />
      </td>
      <td style={{ padding: '7px 12px', fontSize: 11, color: 'var(--muted)' }}>
        {session.host}
      </td>
      <td style={{ padding: '7px 12px', textAlign: 'right' }}>
        <ChevronRight size={14} color={selected ? 'var(--accent)' : 'var(--muted)'} />
      </td>
    </tr>
  )
}

// ---- Main page ----

const PROFILE_TYPES = ['', 'cpu', 'alloc'] as const

export function ProfilingPage() {
  const [service, setService] = useState('')
  const [profileType, setProfileType] = useState<'' | 'cpu' | 'alloc'>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['profiling-sessions', service, profileType],
    queryFn: () => fetchProfilingSessions(service || undefined, profileType || undefined, 50),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { data: payloadData, isLoading: payloadLoading } = useQuery({
    queryKey: ['profiling-payload', selectedId],
    queryFn: () => fetchProfilingPayload(selectedId!),
    enabled: !!selectedId,
    staleTime: Infinity,
  })

  return (
    <div style={{ padding: '20px 24px', fontFamily: 'var(--font-mono, monospace)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Flame size={20} color="var(--accent)" />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
          Profiling Flame Graph
        </h2>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={service}
          onChange={e => { setService(e.target.value); setSelectedId(null) }}
          placeholder="Service filter..."
          style={{
            padding: '6px 10px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--card)',
            color: 'var(--text)', fontSize: 12, width: 180,
          }}
        />
        {PROFILE_TYPES.map(t => (
          <button
            key={t}
            onClick={() => { setProfileType(t); setSelectedId(null) }}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12,
              border: '1px solid var(--border)',
              background: profileType === t ? 'var(--accent)' : 'var(--card)',
              color: profileType === t ? '#fff' : 'var(--text)',
              cursor: 'pointer',
            }}
          >
            {t === '' ? 'All Types' : t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Layout: list left, flame graph right */}
      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Session list */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, overflow: 'hidden',
        }}>
          {isLoading && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Loading sessions...
            </div>
          )}
          {error && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--health-critical)', fontSize: 13 }}>
              <WifiOff size={18} style={{ marginRight: 6 }} />
              Failed to load profiling sessions
            </div>
          )}
          {data && data.sessions.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No profiling sessions found
            </div>
          )}
          {data && data.sessions.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>TIME</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>SERVICE</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>TYPE</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>HOST</th>
                  <th style={{ padding: '8px 12px' }} />
                </tr>
              </thead>
              <tbody>
                {data.sessions.map(s => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    selected={selectedId === s.id}
                    onClick={() => setSelectedId(s.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Flame Graph Panel */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 16, minHeight: 300,
        }}>
          {!selectedId && (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, paddingTop: 60 }}>
              Select a profiling session to view the flame graph
            </div>
          )}
          {selectedId && payloadLoading && (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, paddingTop: 60 }}>
              Loading flame graph...
            </div>
          )}
          {payloadData && (
            <>
              <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--muted)' }}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                  {payloadData.service_name}
                </span>
                {' · '}
                <TypeBadge type={payloadData.profile_type} />
                {' · '}
                {fmtTime(payloadData.sampled_at)}
                {' · '}
                {payloadData.host}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>
                Hover over a frame for details. Width = % of total samples.
              </div>
              <FlameGraph payload={payloadData.payload} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
