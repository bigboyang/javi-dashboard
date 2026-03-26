import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronDown, X } from 'lucide-react'
import { fetchTraces, fetchTraceDetail } from '../api/apm'
import type { TraceSummary, TraceSpan, TimeWindow } from '../types/apm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortId(id: string): string {
  return id.slice(0, 8)
}

function fmtDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  if (ms >= 1) return `${ms.toFixed(1)}ms`
  return `${(ms * 1000).toFixed(0)}µs`
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function statusColor(code: number): string {
  if (code === 2) return 'var(--error)'
  if (code === 1) return 'var(--success)'
  return 'var(--muted)'
}

function statusLabel(code: number): string {
  if (code === 2) return 'ERROR'
  if (code === 1) return 'OK'
  return 'UNSET'
}

// ---------------------------------------------------------------------------
// Waterfall – span row
// ---------------------------------------------------------------------------

interface WaterfallRowProps {
  span: TraceSpan
  depth: number
  traceStartMs: number
  traceDurationMs: number
  selected: boolean
  onSelect: () => void
}

function WaterfallRow({
  span,
  depth,
  traceStartMs,
  traceDurationMs,
  selected,
  onSelect,
}: WaterfallRowProps) {
  const spanStartMs = new Date(span.start_time).getTime()
  const leftPct = traceDurationMs > 0 ? ((spanStartMs - traceStartMs) / traceDurationMs) * 100 : 0
  const widthPct = traceDurationMs > 0 ? (span.duration_ms / traceDurationMs) * 100 : 1
  const barColor = span.status_code === 2 ? 'var(--error)' : 'var(--accent)'

  return (
    <div
      onClick={onSelect}
      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-xs"
      style={{
        background: selected ? 'rgba(99,102,241,0.1)' : 'transparent',
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      {/* Service + name with tree indent */}
      <div
        className="flex-shrink-0 overflow-hidden"
        style={{ width: 280, paddingLeft: depth * 16 }}
      >
        <span style={{ color: 'var(--muted)', fontSize: 10 }}>{span.service_name} </span>
        <span
          className="font-medium"
          style={{
            color: span.status_code === 2 ? 'var(--error)' : 'var(--text)',
          }}
        >
          {span.name}
        </span>
      </div>

      {/* Timeline bar */}
      <div className="flex-1 relative" style={{ height: 16 }}>
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-sm"
          style={{
            left: `${leftPct.toFixed(2)}%`,
            width: `${Math.max(widthPct, 0.3).toFixed(2)}%`,
            height: 8,
            background: barColor,
            opacity: 0.85,
          }}
        />
      </div>

      {/* Duration */}
      <div className="flex-shrink-0 text-right" style={{ width: 70, color: 'var(--muted)' }}>
        {fmtDuration(span.duration_ms)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Span detail panel
// ---------------------------------------------------------------------------

function SpanDetail({ span, onClose }: { span: TraceSpan; onClose: () => void }) {
  const attrEntries = Object.entries(span.attrs ?? {})
  return (
    <div
      className="border-t overflow-auto"
      style={{ borderColor: 'var(--border)', maxHeight: 280 }}
    >
      <div
        className="flex items-center justify-between px-4 py-2 border-b sticky top-0"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
          Span Detail
        </span>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
        >
          <X size={12} />
        </button>
      </div>
      <div className="px-4 py-3 grid gap-y-1.5 text-xs" style={{ gridTemplateColumns: '140px 1fr' }}>
        <span style={{ color: 'var(--muted)' }}>Span ID</span>
        <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{span.span_id}</span>
        <span style={{ color: 'var(--muted)' }}>Parent ID</span>
        <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>
          {span.parent_span_id || '—'}
        </span>
        <span style={{ color: 'var(--muted)' }}>Service</span>
        <span style={{ color: 'var(--text)' }}>{span.service_name}</span>
        <span style={{ color: 'var(--muted)' }}>Operation</span>
        <span style={{ color: 'var(--text)' }}>{span.name}</span>
        <span style={{ color: 'var(--muted)' }}>Start Time</span>
        <span style={{ color: 'var(--text)' }}>{new Date(span.start_time).toISOString()}</span>
        <span style={{ color: 'var(--muted)' }}>Duration</span>
        <span style={{ color: 'var(--text)' }}>{fmtDuration(span.duration_ms)}</span>
        <span style={{ color: 'var(--muted)' }}>Status</span>
        <span style={{ color: statusColor(span.status_code) }}>{statusLabel(span.status_code)}</span>
        {span.http_method && (
          <>
            <span style={{ color: 'var(--muted)' }}>HTTP Method</span>
            <span style={{ color: 'var(--text)' }}>{span.http_method}</span>
          </>
        )}
        {span.http_status_code > 0 && (
          <>
            <span style={{ color: 'var(--muted)' }}>HTTP Status</span>
            <span style={{ color: 'var(--text)' }}>{span.http_status_code}</span>
          </>
        )}
        {attrEntries.length > 0 && (
          <>
            <div
              className="col-span-2 mt-1 mb-0.5 text-xs font-semibold border-t pt-2"
              style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
            >
              Attributes
            </div>
            {attrEntries.map(([k, v]) => (
              <>
                <span key={`k-${k}`} style={{ color: 'var(--muted)' }}>
                  {k}
                </span>
                <span
                  key={`v-${k}`}
                  style={{ color: 'var(--text)', wordBreak: 'break-all' }}
                >
                  {v}
                </span>
              </>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trace waterfall
// ---------------------------------------------------------------------------

interface SpanTreeNode {
  span: TraceSpan
  children: SpanTreeNode[]
}

function buildTree(spans: TraceSpan[]): SpanTreeNode[] {
  const byId = new Map<string, SpanTreeNode>()
  for (const s of spans) {
    byId.set(s.span_id, { span: s, children: [] })
  }
  const roots: SpanTreeNode[] = []
  for (const node of byId.values()) {
    const parentNode = byId.get(node.span.parent_span_id)
    if (parentNode) {
      parentNode.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function flattenTree(
  nodes: SpanTreeNode[],
  depth = 0,
): Array<{ span: TraceSpan; depth: number }> {
  const result: Array<{ span: TraceSpan; depth: number }> = []
  for (const node of nodes) {
    result.push({ span: node.span, depth })
    result.push(...flattenTree(node.children, depth + 1))
  }
  return result
}

function TraceWaterfall({ traceId, onClose }: { traceId: string; onClose: () => void }) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trace-detail', traceId],
    queryFn: () => fetchTraceDetail(traceId),
    staleTime: 30_000,
  })

  const spans = data?.spans ?? []
  const roots = buildTree(spans)
  const flat = flattenTree(roots)

  const traceStartMs =
    spans.length > 0 ? Math.min(...spans.map((s) => new Date(s.start_time).getTime())) : 0
  const traceEndMs =
    spans.length > 0
      ? Math.max(...spans.map((s) => new Date(s.start_time).getTime() + s.duration_ms))
      : 0
  const traceDurationMs = traceEndMs - traceStartMs

  const selectedSpan = spans.find((s) => s.span_id === selectedSpanId) ?? null

  return (
    <div
      className="border-t flex flex-col"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      {/* Waterfall header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
            Trace
          </span>
          <span
            className="text-xs font-mono"
            style={{ color: 'var(--accent)' }}
          >
            {shortId(traceId)}…
          </span>
          {spans.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {spans.length} spans · {fmtDuration(traceDurationMs)}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
          aria-label="Close waterfall"
        >
          <X size={14} />
        </button>
      </div>

      {/* Column headers */}
      <div
        className="flex items-center gap-2 px-2 py-1 border-b text-xs flex-shrink-0"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
      >
        <div style={{ width: 280, flexShrink: 0 }}>Operation</div>
        <div className="flex-1">Timeline</div>
        <div style={{ width: 70, flexShrink: 0, textAlign: 'right' }}>Duration</div>
      </div>

      {/* Span rows */}
      <div className="overflow-auto flex-1" style={{ maxHeight: 320 }}>
        {isLoading && (
          <div className="px-4 py-6 text-xs" style={{ color: 'var(--muted)' }}>
            Loading spans…
          </div>
        )}
        {isError && (
          <div className="px-4 py-6 text-xs" style={{ color: 'var(--error)' }}>
            Failed to load trace spans.
          </div>
        )}
        {!isLoading && !isError && flat.length === 0 && (
          <div className="px-4 py-6 text-xs" style={{ color: 'var(--muted)' }}>
            No spans found.
          </div>
        )}
        {!isLoading &&
          !isError &&
          flat.map(({ span, depth }) => (
            <WaterfallRow
              key={span.span_id}
              span={span}
              depth={depth}
              traceStartMs={traceStartMs}
              traceDurationMs={traceDurationMs}
              selected={selectedSpanId === span.span_id}
              onSelect={() =>
                setSelectedSpanId((prev) => (prev === span.span_id ? null : span.span_id))
              }
            />
          ))}
      </div>

      {/* Span detail */}
      {selectedSpan && (
        <SpanDetail span={selectedSpan} onClose={() => setSelectedSpanId(null)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trace list row
// ---------------------------------------------------------------------------

function TraceRow({
  trace,
  selected,
  onSelect,
}: {
  trace: TraceSummary
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className="flex items-center gap-4 px-4 py-2 border-b text-xs cursor-pointer transition-colors"
      style={{
        borderColor: 'var(--border)',
        background: selected ? 'rgba(99,102,241,0.08)' : 'transparent',
        color: 'var(--text)',
      }}
    >
      {/* Expand indicator */}
      <span style={{ color: 'var(--muted)', width: 14, flexShrink: 0 }}>
        {selected ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>

      {/* Trace ID */}
      <span
        className="font-mono"
        style={{ color: 'var(--accent)', width: 80, flexShrink: 0 }}
      >
        {shortId(trace.trace_id)}
      </span>

      {/* Service */}
      <span style={{ width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {trace.service_name}
      </span>

      {/* Root operation */}
      <span
        className="flex-1 overflow-hidden"
        style={{ textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}
      >
        {trace.root_operation}
      </span>

      {/* Start time */}
      <span style={{ width: 80, flexShrink: 0, color: 'var(--muted)', textAlign: 'right' }}>
        {fmtTime(trace.start_time)}
      </span>

      {/* Duration */}
      <span style={{ width: 80, flexShrink: 0, textAlign: 'right' }}>
        {fmtDuration(trace.duration_ms)}
      </span>

      {/* Span count */}
      <span style={{ width: 50, flexShrink: 0, textAlign: 'right', color: 'var(--muted)' }}>
        {trace.span_count}
      </span>

      {/* Status */}
      <span
        className="w-12 text-right font-medium"
        style={{ color: statusColor(trace.status_code), flexShrink: 0 }}
      >
        {statusLabel(trace.status_code)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main TraceExplorer
// ---------------------------------------------------------------------------

const TRACE_WINDOWS: TimeWindow[] = ['15m', '1h', '6h', '24h']
const STATUS_OPTIONS = ['all', 'error', 'ok'] as const
type StatusFilter = (typeof STATUS_OPTIONS)[number]

interface TraceExplorerProps {
  services: string[]
}

export function TraceExplorer({ services }: TraceExplorerProps) {
  const [window, setWindow] = useState<TimeWindow>('1h')
  const [serviceFilter, setServiceFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['traces', window, serviceFilter],
    queryFn: () => fetchTraces(window, serviceFilter || undefined),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const allTraces = data?.traces ?? []

  const traces = allTraces.filter((t) => {
    if (statusFilter === 'error') return t.status_code === 2
    if (statusFilter === 'ok') return t.status_code !== 2
    return true
  })

  const handleTraceSelect = (id: string) => {
    setSelectedTraceId((prev) => (prev === id ? null : id))
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
            Trace Explorer
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Distributed traces · waterfall view
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--success)', boxShadow: '0 0 4px var(--success)' }}
          />
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            live · 30s refresh
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <div
        className="flex items-center gap-3 px-4 py-2 border-b flex-shrink-0 flex-wrap"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* Window */}
        <div className="flex items-center gap-1">
          {TRACE_WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className="px-2 py-1 text-xs rounded transition-colors"
              style={{
                background: window === w ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: window === w ? 'var(--accent)' : 'var(--muted)',
                border: `1px solid ${window === w ? 'rgba(99,102,241,0.4)' : 'transparent'}`,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Service filter */}
        <select
          value={serviceFilter}
          onChange={(e) => {
            setServiceFilter(e.target.value)
            setSelectedTraceId(null)
          }}
          className="text-xs px-2 py-1 rounded"
          style={{
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          <option value="">All Services</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <div className="flex items-center gap-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-2 py-1 text-xs rounded capitalize transition-colors"
              style={{
                background: statusFilter === s ? 'rgba(99,102,241,0.2)' : 'transparent',
                color:
                  statusFilter === s
                    ? 'var(--accent)'
                    : s === 'error'
                      ? 'var(--error)'
                      : 'var(--muted)',
                border: `1px solid ${statusFilter === s ? 'rgba(99,102,241,0.4)' : 'transparent'}`,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Count */}
        <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
          {isLoading
            ? 'Loading…'
            : `${traces.length} trace${traces.length !== 1 ? 's' : ''}${
                dataUpdatedAt ? ' · ' + fmtTime(new Date(dataUpdatedAt).toISOString()) : ''
              }`}
        </span>
      </div>

      {/* Table header */}
      <div
        className="flex items-center gap-4 px-4 py-1.5 border-b flex-shrink-0 text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
      >
        <span style={{ width: 14, flexShrink: 0 }} />
        <span style={{ width: 80, flexShrink: 0 }}>Trace ID</span>
        <span style={{ width: 120, flexShrink: 0 }}>Service</span>
        <span className="flex-1">Root Operation</span>
        <span style={{ width: 80, flexShrink: 0, textAlign: 'right' }}>Time</span>
        <span style={{ width: 80, flexShrink: 0, textAlign: 'right' }}>Duration</span>
        <span style={{ width: 50, flexShrink: 0, textAlign: 'right' }}>Spans</span>
        <span style={{ width: 48, flexShrink: 0, textAlign: 'right' }}>Status</span>
      </div>

      {/* Body */}
      <div className="overflow-auto flex-1">
        {isLoading && (
          <div className="flex flex-col gap-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-8 animate-pulse border-b mx-4 my-1 rounded"
                style={{ background: 'var(--border)', borderColor: 'transparent' }}
              />
            ))}
          </div>
        )}

        {isError && (
          <div className="px-6 py-8 text-sm" style={{ color: 'var(--error)' }}>
            Failed to load traces.
          </div>
        )}

        {!isLoading && !isError && traces.length === 0 && (
          <div className="px-6 py-8 text-sm" style={{ color: 'var(--muted)' }}>
            No traces found for the selected filters.
          </div>
        )}

        {!isLoading &&
          !isError &&
          traces.map((trace) => (
            <div key={trace.trace_id}>
              <TraceRow
                trace={trace}
                selected={selectedTraceId === trace.trace_id}
                onSelect={() => handleTraceSelect(trace.trace_id)}
              />
              {selectedTraceId === trace.trace_id && (
                <TraceWaterfall
                  traceId={trace.trace_id}
                  onClose={() => setSelectedTraceId(null)}
                />
              )}
            </div>
          ))}
      </div>
    </div>
  )
}
