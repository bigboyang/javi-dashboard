import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchTopology } from '../api/apm'
import type { TopologyNode, TopologyEdge, TimeWindow } from '../types/apm'

const WINDOWS: TimeWindow[] = ['5m', '15m', '1h', '6h', '24h']

// SVG canvas dimensions
const SVG_W = 720
const SVG_H = 480
const CX = SVG_W / 2
const CY = SVG_H / 2
const LAYOUT_RADIUS = 175
const NODE_R = 30

function nodeStroke(errorRate: number): string {
  if (errorRate > 0.1) return 'var(--error)'
  if (errorRate > 0.01) return '#f59e0b'
  return 'var(--success)'
}

function edgeStroke(errorRate: number): string {
  if (errorRate > 0.1) return '#ef4444'
  if (errorRate > 0.01) return '#f59e0b'
  return '#6366f1'
}

function fmtRate(r: number): string {
  return r === 0 ? '0%' : r < 0.001 ? '<0.1%' : `${(r * 100).toFixed(1)}%`
}

function fmtMs(ms: number): string {
  return ms < 1 ? '<1ms' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms.toFixed(0)}ms`
}

// Position nodes in a circle; single node goes to center.
function layoutNodes(nodes: TopologyNode[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  const n = nodes.length
  if (n === 0) return pos
  if (n === 1) {
    pos.set(nodes[0].name, { x: CX, y: CY })
    return pos
  }
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    pos.set(node.name, {
      x: CX + LAYOUT_RADIUS * Math.cos(angle),
      y: CY + LAYOUT_RADIUS * Math.sin(angle),
    })
  })
  return pos
}

// Curved arrow path from node center to node center, shortening by NODE_R.
function edgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  curveFactor = 0.18,
): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return ''

  const nx = dx / len
  const ny = dy / len

  // Start and end points shortened by node radius (+ 6 px for arrowhead gap)
  const sx = x1 + nx * NODE_R
  const sy = y1 + ny * NODE_R
  const ex = x2 - nx * (NODE_R + 7)
  const ey = y2 - ny * (NODE_R + 7)

  // Quadratic bezier control point: offset perpendicular to the midpoint
  const mx = (sx + ex) / 2
  const my = (sy + ey) / 2
  const perp = len * curveFactor
  const cpx = mx - ny * perp
  const cpy = my + nx * perp

  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`
}

interface DetailPanel {
  node: TopologyNode
  inbound: TopologyEdge[]
  outbound: TopologyEdge[]
}

export function TopologyExplorer() {
  const [window, setWindow] = useState<TimeWindow>('1h')
  const [selected, setSelected] = useState<string | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<TopologyEdge | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['topology', window],
    queryFn: () => fetchTopology(window),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const nodes = data?.nodes ?? []
  const edges = data?.edges ?? []
  const pos = layoutNodes(nodes)

  const detail: DetailPanel | null = selected
    ? (() => {
        const node = nodes.find((n) => n.name === selected)
        if (!node) return null
        return {
          node,
          inbound: edges.filter((e) => e.callee === selected),
          outbound: edges.filter((e) => e.caller === selected),
        }
      })()
    : null

  const handleNodeClick = (name: string) => {
    setSelected((prev) => (prev === name ? null : name))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            Service Topology
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Dependency graph derived from distributed traces
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Window selector */}
          <div className="flex gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className="px-2 py-1 rounded text-xs font-medium transition-colors"
                style={{
                  background: window === w ? 'rgba(99,102,241,0.15)' : 'transparent',
                  color: window === w ? 'var(--accent)' : 'var(--muted)',
                  border: window === w ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                }}
              >
                {w}
              </button>
            ))}
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-1.5 ml-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: 'var(--success)',
                boxShadow: '0 0 4px var(--success)',
              }}
            />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              live · 60s
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph area */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
          {isLoading && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Loading topology…
            </p>
          )}
          {isError && (
            <p className="text-xs" style={{ color: 'var(--error)' }}>
              Failed to load topology
            </p>
          )}
          {!isLoading && !isError && nodes.length === 0 && (
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                No cross-service calls found
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                Widen the time window or ingest traces with multi-service spans
              </p>
            </div>
          )}
          {!isLoading && nodes.length > 0 && (
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              style={{
                width: '100%',
                maxWidth: SVG_W,
                height: 'auto',
                userSelect: 'none',
              }}
            >
              {/* Arrowhead marker definitions */}
              <defs>
                {['default', 'error', 'warn'].map((variant) => {
                  const fill =
                    variant === 'error' ? '#ef4444' : variant === 'warn' ? '#f59e0b' : '#6366f1'
                  return (
                    <marker
                      key={variant}
                      id={`arrow-${variant}`}
                      markerWidth="8"
                      markerHeight="8"
                      refX="6"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L0,6 L8,3 z" fill={fill} opacity="0.85" />
                    </marker>
                  )
                })}
              </defs>

              {/* Edges */}
              {edges.map((edge) => {
                const from = pos.get(edge.caller)
                const to = pos.get(edge.callee)
                if (!from || !to) return null

                const isHighlighted =
                  selected === edge.caller || selected === edge.callee
                const isHovered = hoveredEdge === edge

                const variant =
                  edge.error_rate > 0.1 ? 'error' : edge.error_rate > 0.01 ? 'warn' : 'default'
                const stroke = edgeStroke(edge.error_rate)
                const d = edgePath(from.x, from.y, to.x, to.y)

                return (
                  <g key={`${edge.caller}->${edge.callee}`}>
                    {/* Wider invisible hit area */}
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredEdge(edge)}
                      onMouseLeave={() => setHoveredEdge(null)}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={isHovered ? 2.5 : isHighlighted ? 2 : 1.5}
                      opacity={
                        selected && !isHighlighted && !isHovered ? 0.15 : isHovered ? 1 : 0.7
                      }
                      markerEnd={`url(#arrow-${variant})`}
                      style={{ transition: 'opacity 0.15s, stroke-width 0.1s', cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredEdge(edge)}
                      onMouseLeave={() => setHoveredEdge(null)}
                    />
                  </g>
                )
              })}

              {/* Nodes */}
              {nodes.map((node) => {
                const p = pos.get(node.name)
                if (!p) return null
                const isActive = selected === node.name
                const isConnected =
                  selected &&
                  edges.some((e) => e.caller === node.name || e.callee === node.name
                    ? (e.caller === selected || e.callee === selected)
                    : false)
                const dimmed = selected && !isActive && !isConnected

                const stroke = nodeStroke(node.error_rate)
                const label =
                  node.name.length > 12 ? node.name.slice(0, 11) + '…' : node.name

                return (
                  <g
                    key={node.name}
                    transform={`translate(${p.x}, ${p.y})`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleNodeClick(node.name)}
                    opacity={dimmed ? 0.25 : 1}
                  >
                    {/* Glow ring for active node */}
                    {isActive && (
                      <circle
                        r={NODE_R + 5}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={1.5}
                        opacity={0.35}
                      />
                    )}
                    {/* Node circle */}
                    <circle
                      r={NODE_R}
                      fill="var(--surface)"
                      stroke={stroke}
                      strokeWidth={isActive ? 2.5 : 1.5}
                    />
                    {/* Service name */}
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={10}
                      fontWeight={isActive ? 600 : 400}
                      fill="var(--text)"
                      style={{ pointerEvents: 'none' }}
                    >
                      {label}
                    </text>
                    {/* Error badge */}
                    {node.error_rate > 0 && (
                      <text
                        y={NODE_R + 12}
                        textAnchor="middle"
                        fontSize={9}
                        fill={stroke}
                        style={{ pointerEvents: 'none' }}
                      >
                        {fmtRate(node.error_rate)} err
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Hover tooltip for edge */}
              {hoveredEdge && (() => {
                const from = pos.get(hoveredEdge.caller)
                const to = pos.get(hoveredEdge.callee)
                if (!from || !to) return null
                const tx = (from.x + to.x) / 2
                const ty = (from.y + to.y) / 2
                return (
                  <g transform={`translate(${tx}, ${ty})`} style={{ pointerEvents: 'none' }}>
                    <rect
                      x={-60}
                      y={-28}
                      width={120}
                      height={52}
                      rx={4}
                      fill="var(--surface)"
                      stroke="var(--border)"
                      strokeWidth={1}
                    />
                    <text textAnchor="middle" y={-14} fontSize={9} fill="var(--muted)">
                      {hoveredEdge.caller} → {hoveredEdge.callee}
                    </text>
                    <text textAnchor="middle" y={0} fontSize={9} fill="var(--text)">
                      {hoveredEdge.call_count.toLocaleString()} calls
                    </text>
                    <text textAnchor="middle" y={13} fontSize={9} fill="var(--muted)">
                      {fmtRate(hoveredEdge.error_rate)} err · p95 {fmtMs(hoveredEdge.p95_ms)}
                    </text>
                  </g>
                )
              })()}
            </svg>
          )}
        </div>

        {/* Detail panel */}
        {detail && (
          <div
            className="flex-shrink-0 w-72 border-l overflow-y-auto"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="p-4">
              {/* Node header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p
                    className="text-sm font-semibold break-all"
                    style={{ color: 'var(--text)' }}
                  >
                    {detail.node.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    {detail.node.total_requests.toLocaleString()} inbound calls
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: 'var(--muted)', background: 'var(--border)' }}
                >
                  ✕
                </button>
              </div>

              {/* Node metrics */}
              <div
                className="grid grid-cols-2 gap-2 mb-4 p-3 rounded"
                style={{ background: 'var(--bg)' }}
              >
                <MetricCell label="Error rate" value={fmtRate(detail.node.error_rate)} />
                <MetricCell
                  label="Error count"
                  value={detail.node.error_count.toLocaleString()}
                />
              </div>

              {/* Inbound */}
              {detail.inbound.length > 0 && (
                <EdgeList title="Inbound (callers)" edges={detail.inbound} direction="in" />
              )}

              {/* Outbound */}
              {detail.outbound.length > 0 && (
                <EdgeList title="Outbound (callees)" edges={detail.outbound} direction="out" />
              )}

              {detail.inbound.length === 0 && detail.outbound.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  No cross-service edges recorded in this window.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        className="flex items-center gap-4 px-6 py-2 border-t flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          Node border:
        </span>
        {[
          { color: 'var(--success)', label: 'healthy' },
          { color: '#f59e0b', label: '>1% errors' },
          { color: 'var(--error)', label: '>10% errors' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full border-2"
              style={{ borderColor: color, background: 'transparent' }}
            />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {label}
            </span>
          </span>
        ))}
        <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
          Click a node to inspect · hover an edge for metrics
        </span>
      </div>
    </div>
  )
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text)' }}>
        {value}
      </p>
    </div>
  )
}

function EdgeList({
  title,
  edges,
  direction,
}: {
  title: string
  edges: TopologyEdge[]
  direction: 'in' | 'out'
}) {
  return (
    <div className="mb-4">
      <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>
        {title}
      </p>
      <div className="flex flex-col gap-1">
        {edges.map((e) => {
          const peer = direction === 'in' ? e.caller : e.callee
          const stroke = edgeStroke(e.error_rate)
          return (
            <div
              key={peer}
              className="flex items-center justify-between px-2 py-1.5 rounded text-xs"
              style={{ background: 'var(--bg)' }}
            >
              <span style={{ color: 'var(--text)' }} className="truncate mr-2 flex-1">
                {peer}
              </span>
              <span className="shrink-0 font-mono" style={{ color: stroke }}>
                {fmtRate(e.error_rate)}
              </span>
              <span
                className="shrink-0 ml-2 font-mono"
                style={{ color: 'var(--muted)' }}
              >
                p95 {fmtMs(e.p95_ms)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
