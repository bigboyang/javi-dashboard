import { useState, useRef } from 'react'
import { Search, Loader2, AlertCircle, ExternalLink } from 'lucide-react'
import { fetchRAGSearch } from '../api/search'
import type { SearchResultItem } from '../types/search'

// -----------------------------------------------------------------------
// Score bar
// -----------------------------------------------------------------------

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.8 ? 'var(--success)' : score >= 0.65 ? 'var(--warning)' : 'var(--muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <div
        style={{
          width: 48,
          height: 4,
          borderRadius: 2,
          background: 'var(--border)',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 9, color, fontFamily: 'monospace', minWidth: 28 }}>{pct}%</span>
    </div>
  )
}

// -----------------------------------------------------------------------
// Result card
// -----------------------------------------------------------------------

function ResultCard({ item }: { item: SearchResultItem }) {
  const [expanded, setExpanded] = useState(false)
  const ts = item.timestamp_ms ? new Date(item.timestamp_ms).toLocaleString() : '—'
  const preview = item.text.slice(0, 160)
  const hasMore = item.text.length > 160

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '10px 14px',
        marginBottom: 8,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'rgba(99,102,241,0.12)',
            borderRadius: 3,
            padding: '2px 7px',
            flexShrink: 0,
          }}
        >
          {item.service_name}
        </span>
        <span
          style={{
            fontSize: 9,
            color: 'var(--muted)',
            fontFamily: 'monospace',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.trace_id}
        </span>
        <ScoreBar score={item.score} />
        <a
          href={`/traces?trace_id=${item.trace_id}`}
          style={{ color: 'var(--muted)', lineHeight: 0, flexShrink: 0 }}
          title="Open trace"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={11} />
        </a>
      </div>

      {/* Timestamp */}
      <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 6 }}>{ts}</div>

      {/* Text */}
      <pre
        style={{
          fontSize: 9,
          color: 'var(--text)',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {expanded ? item.text : preview}
        {hasMore && !expanded && '…'}
      </pre>
      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 4,
            fontSize: 9,
            color: 'var(--accent)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          {expanded ? 'show less' : 'show more'}
        </button>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// RAGSearchPage
// -----------------------------------------------------------------------

const EXAMPLE_QUERIES = [
  'database connection timeout',
  'payment service 500 error',
  'high latency in order processing',
  'NullPointerException in checkout',
]

export function RAGSearchPage() {
  const [query, setQuery] = useState('')
  const [service, setService] = useState('')
  const [results, setResults] = useState<SearchResultItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastQuery, setLastQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function doSearch(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    setLastQuery(trimmed)
    try {
      const res = await fetchRAGSearch(trimmed, service || undefined, undefined, 15)
      setResults(res.results)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') doSearch(query)
  }

  return (
    <div style={{ padding: '16px 20px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
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
          <Search size={15} style={{ color: 'var(--accent)' }} />
          RAG Error Search
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
            VECTOR SEARCH
          </span>
        </h1>
        <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>
          Describe an error or incident in natural language — semantically similar traces will surface.
        </p>
      </div>

      {/* Search bar */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 10,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '8px 12px',
        }}
      >
        <Search size={14} style={{ color: 'var(--muted)', flexShrink: 0, alignSelf: 'center' }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g. database connection timeout in payment service"
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            outline: 'none',
            fontSize: 12,
            color: 'var(--text)',
            fontFamily: 'inherit',
          }}
        />
        <input
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="service filter"
          style={{
            width: 120,
            background: 'var(--border)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            outline: 'none',
            fontSize: 10,
            color: 'var(--muted)',
            fontFamily: 'inherit',
            padding: '3px 7px',
          }}
        />
        <button
          onClick={() => doSearch(query)}
          disabled={loading || !query.trim()}
          style={{
            padding: '5px 14px',
            borderRadius: 4,
            border: 'none',
            cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
            background: 'rgba(99,102,241,0.2)',
            color: 'var(--accent)',
            fontSize: 11,
            fontFamily: 'inherit',
            fontWeight: 600,
            opacity: loading || !query.trim() ? 0.5 : 1,
          }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : 'Search'}
        </button>
      </div>

      {/* Example queries */}
      {results === null && !loading && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Example queries
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => { setQuery(q); doSearch(q) }}
                style={{
                  fontSize: 10,
                  padding: '4px 10px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 6,
            color: 'var(--error)',
            fontSize: 11,
            marginBottom: 12,
          }}
        >
          <AlertCircle size={13} />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 80,
                borderRadius: 6,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                animation: 'pulse 1.5s ease-in-out infinite',
                opacity: 0.6,
              }}
            />
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && results !== null && (
        <>
          <div
            style={{
              fontSize: 10,
              color: 'var(--muted)',
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>
              {results.length} result{results.length !== 1 ? 's' : ''} for
            </span>
            <span
              style={{
                color: 'var(--accent)',
                fontStyle: 'italic',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 400,
              }}
            >
              "{lastQuery}"
            </span>
          </div>

          {results.length === 0 ? (
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
              No similar error traces found.
              {error === null && (
                <div style={{ fontSize: 9, marginTop: 4, opacity: 0.7 }}>
                  Make sure EMBED_ENABLED=true in javi-collector and Qdrant is running.
                </div>
              )}
            </div>
          ) : (
            results.map((item) => <ResultCard key={item.trace_id + item.timestamp_ms} item={item} />)
          )}
        </>
      )}
    </div>
  )
}
