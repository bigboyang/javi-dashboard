import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronDown, X, Search } from 'lucide-react'
import { fetchLogs } from '../api/apm'
import type { LogEntry, TimeWindow, LogLevel } from '../types/apm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function severityColor(level: string): string {
  switch (level.toUpperCase()) {
    case 'FATAL':
    case 'ERROR':
      return 'var(--error)'
    case 'WARN':
      return '#f59e0b'
    case 'INFO':
      return 'var(--accent)'
    case 'DEBUG':
      return 'var(--muted)'
    case 'TRACE':
      return 'var(--muted)'
    default:
      return 'var(--muted)'
  }
}

function severityBg(level: string): string {
  switch (level.toUpperCase()) {
    case 'FATAL':
    case 'ERROR':
      return 'rgba(239,68,68,0.12)'
    case 'WARN':
      return 'rgba(245,158,11,0.12)'
    case 'INFO':
      return 'rgba(99,102,241,0.12)'
    default:
      return 'transparent'
  }
}

// ---------------------------------------------------------------------------
// Log detail panel
// ---------------------------------------------------------------------------

function LogDetail({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const resourceEntries: [string, string][] = Object.entries(entry.resource_attrs ?? {})
  const logAttrEntries: [string, string][] = Object.entries(entry.log_attrs ?? {})

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
          Log Detail
        </span>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
          aria-label="Close detail"
        >
          <X size={12} />
        </button>
      </div>

      <div className="px-4 py-3 grid gap-y-1.5 text-xs" style={{ gridTemplateColumns: '140px 1fr' }}>
        <span style={{ color: 'var(--muted)' }}>Timestamp</span>
        <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>
          {new Date(entry.timestamp).toISOString()}
        </span>

        <span style={{ color: 'var(--muted)' }}>Service</span>
        <span style={{ color: 'var(--text)' }}>{entry.service_name}</span>

        <span style={{ color: 'var(--muted)' }}>Severity</span>
        <span style={{ color: severityColor(entry.severity_text), fontWeight: 600 }}>
          {entry.severity_text || '—'} ({entry.severity_number})
        </span>

        <span style={{ color: 'var(--muted)' }}>Body</span>
        <span style={{ color: 'var(--text)', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
          {entry.body || '—'}
        </span>

        {entry.trace_id && (
          <>
            <span style={{ color: 'var(--muted)' }}>Trace ID</span>
            <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{entry.trace_id}</span>
          </>
        )}

        {entry.span_id && (
          <>
            <span style={{ color: 'var(--muted)' }}>Span ID</span>
            <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{entry.span_id}</span>
          </>
        )}

        {logAttrEntries.length > 0 && (
          <>
            <div
              className="col-span-2 mt-1 mb-0.5 text-xs font-semibold border-t pt-2"
              style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
            >
              Log Attributes
            </div>
            {logAttrEntries.map(([k, v]) => (
              <>
                <span key={`lk-${k}`} style={{ color: 'var(--muted)' }}>{k}</span>
                <span key={`lv-${k}`} style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{v}</span>
              </>
            ))}
          </>
        )}

        {resourceEntries.length > 0 && (
          <>
            <div
              className="col-span-2 mt-1 mb-0.5 text-xs font-semibold border-t pt-2"
              style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
            >
              Resource Attributes
            </div>
            {resourceEntries.map(([k, v]) => (
              <>
                <span key={`rk-${k}`} style={{ color: 'var(--muted)' }}>{k}</span>
                <span key={`rv-${k}`} style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{v}</span>
              </>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Log row
// ---------------------------------------------------------------------------

function LogRow({
  entry,
  selected,
  onSelect,
}: {
  entry: LogEntry
  selected: boolean
  onSelect: () => void
}) {
  const level = entry.severity_text?.toUpperCase() || '—'
  const rowBg = selected ? 'rgba(99,102,241,0.08)' : severityBg(level)

  return (
    <div
      onClick={onSelect}
      className="flex items-start gap-3 px-4 py-2 border-b text-xs cursor-pointer transition-colors"
      style={{
        borderColor: 'var(--border)',
        background: rowBg,
        color: 'var(--text)',
      }}
    >
      {/* Expand indicator */}
      <span style={{ color: 'var(--muted)', width: 14, flexShrink: 0, paddingTop: 1 }}>
        {selected ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>

      {/* Timestamp */}
      <span
        style={{ width: 72, flexShrink: 0, color: 'var(--muted)', fontFamily: 'monospace' }}
      >
        {fmtTimestamp(entry.timestamp)}
      </span>

      {/* Service */}
      <span
        style={{
          width: 120,
          flexShrink: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--muted)',
        }}
      >
        {entry.service_name}
      </span>

      {/* Severity badge */}
      <span
        className="font-semibold"
        style={{
          width: 50,
          flexShrink: 0,
          color: severityColor(level),
          fontSize: 10,
          letterSpacing: '0.04em',
        }}
      >
        {level.slice(0, 5)}
      </span>

      {/* Body */}
      <span
        className="flex-1 overflow-hidden"
        style={{
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--text)',
        }}
      >
        {entry.body || <span style={{ color: 'var(--muted)' }}>(empty body)</span>}
      </span>

      {/* Trace ID shortlink */}
      {entry.trace_id && (
        <span
          className="font-mono"
          style={{ width: 72, flexShrink: 0, textAlign: 'right', color: 'var(--accent)', fontSize: 10 }}
        >
          {entry.trace_id.slice(0, 8)}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main LogExplorer
// ---------------------------------------------------------------------------

const LOG_WINDOWS: TimeWindow[] = ['5m', '15m', '1h', '6h', '24h']
const LEVEL_OPTIONS: Array<LogLevel | 'ALL'> = ['ALL', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']

interface LogExplorerProps {
  services: string[]
}

export function LogExplorer({ services }: LogExplorerProps) {
  const [window, setWindow] = useState<TimeWindow>('1h')
  const [serviceFilter, setServiceFilter] = useState<string>('')
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'ALL'>('ALL')
  const [searchInput, setSearchInput] = useState<string>('')
  const [activeSearch, setActiveSearch] = useState<string>('')
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['logs', window, serviceFilter, levelFilter, activeSearch],
    queryFn: () =>
      fetchLogs(
        window,
        serviceFilter || undefined,
        levelFilter !== 'ALL' ? levelFilter : undefined,
        activeSearch || undefined,
      ),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const logs: LogEntry[] = data?.logs ?? []

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setActiveSearch(searchInput.trim())
    setSelectedIdx(null)
  }

  const handleLevelChange = (l: LogLevel | 'ALL') => {
    setLevelFilter(l)
    setSelectedIdx(null)
  }

  const handleServiceChange = (s: string) => {
    setServiceFilter(s)
    setSelectedIdx(null)
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
            Log Explorer
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Structured logs · OTLP ingestion
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
          {LOG_WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => { setWindow(w); setSelectedIdx(null) }}
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
          onChange={(e) => handleServiceChange(e.target.value)}
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
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Level filter */}
        <div className="flex items-center gap-1">
          {LEVEL_OPTIONS.map((l) => (
            <button
              key={l}
              onClick={() => handleLevelChange(l)}
              className="px-2 py-1 text-xs rounded transition-colors"
              style={{
                background: levelFilter === l ? 'rgba(99,102,241,0.2)' : 'transparent',
                color:
                  levelFilter === l
                    ? 'var(--accent)'
                    : l === 'ALL'
                      ? 'var(--muted)'
                      : severityColor(l),
                border: `1px solid ${levelFilter === l ? 'rgba(99,102,241,0.4)' : 'transparent'}`,
                fontFamily: 'inherit',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Search box */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1 ml-auto">
          <div className="relative flex items-center">
            <Search
              size={11}
              className="absolute left-2 pointer-events-none"
              style={{ color: 'var(--muted)' }}
            />
            <input
              ref={inputRef}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search body…"
              className="text-xs pl-6 pr-2 py-1 rounded"
              style={{
                background: 'var(--surface)',
                color: 'var(--text)',
                border: `1px solid ${activeSearch ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                fontFamily: 'inherit',
                width: 160,
                outline: 'none',
              }}
            />
          </div>
          {activeSearch && (
            <button
              type="button"
              onClick={() => { setSearchInput(''); setActiveSearch(''); setSelectedIdx(null) }}
              className="text-xs px-1.5 py-1 rounded"
              style={{
                background: 'transparent',
                color: 'var(--muted)',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <X size={12} />
            </button>
          )}
        </form>

        {/* Count */}
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {isLoading
            ? 'Loading…'
            : `${logs.length} log${logs.length !== 1 ? 's' : ''}${
                dataUpdatedAt
                  ? ' · ' + new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                  : ''
              }`}
        </span>
      </div>

      {/* Table header */}
      <div
        className="flex items-center gap-3 px-4 py-1.5 border-b flex-shrink-0 text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
      >
        <span style={{ width: 14, flexShrink: 0 }} />
        <span style={{ width: 72, flexShrink: 0 }}>Time</span>
        <span style={{ width: 120, flexShrink: 0 }}>Service</span>
        <span style={{ width: 50, flexShrink: 0 }}>Level</span>
        <span className="flex-1">Message</span>
        <span style={{ width: 72, flexShrink: 0, textAlign: 'right' }}>Trace</span>
      </div>

      {/* Body */}
      <div className="overflow-auto flex-1">
        {isLoading && (
          <div className="flex flex-col gap-0">
            {Array.from({ length: 10 }).map((_, i) => (
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
            Failed to load logs.
          </div>
        )}

        {!isLoading && !isError && logs.length === 0 && (
          <div className="px-6 py-8 text-sm" style={{ color: 'var(--muted)' }}>
            No logs found for the selected filters.
          </div>
        )}

        {!isLoading &&
          !isError &&
          logs.map((entry, idx) => (
            <div key={`${entry.timestamp_nano}-${idx}`}>
              <LogRow
                entry={entry}
                selected={selectedIdx === idx}
                onSelect={() => setSelectedIdx((prev) => (prev === idx ? null : idx))}
              />
              {selectedIdx === idx && (
                <LogDetail entry={entry} onClose={() => setSelectedIdx(null)} />
              )}
            </div>
          ))}
      </div>
    </div>
  )
}
