import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { RefreshCw } from 'lucide-react'
import { fetchServices } from '../api/apm'
import type { ServiceSummary, TimeWindow } from '../types/apm'

interface ServiceTableProps {
  window: TimeWindow
  onWindowChange: (w: TimeWindow) => void
  selectedService: string | null
  onServiceSelect: (name: string) => void
}

const WINDOWS: TimeWindow[] = ['5m', '15m', '1h', '6h', '24h']

// --- Color helpers ---

function errorRateColor(rate: number): string {
  if (rate < 0.01) return 'var(--success)'
  if (rate < 0.05) return 'var(--warning)'
  return 'var(--error)'
}

function latencyColor(ms: number): string {
  if (ms < 100) return 'var(--success)'
  if (ms < 500) return 'var(--warning)'
  return 'var(--error)'
}

function errorRateDotColor(rate: number): string {
  if (rate < 0.01) return 'var(--success)'
  if (rate < 0.05) return 'var(--warning)'
  return 'var(--error)'
}

// --- Formatters ---

function fmtRate(n: number): string {
  return n.toFixed(2)
}

function fmtErrorRate(n: number): string {
  return (n * 100).toFixed(2) + '%'
}

function fmtMs(n: number): string {
  return n.toFixed(1)
}

function fmtRequests(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

// --- Skeleton row ---

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <div
            className="h-3 rounded animate-pulse"
            style={{
              background: 'var(--border)',
              width: i === 0 ? '120px' : '60px',
            }}
          />
        </td>
      ))}
    </tr>
  )
}

// --- Header cell ---

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={clsx('px-3 py-2 text-left text-xs font-medium uppercase tracking-wider', {
        'text-right': right,
      })}
      style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}
    >
      {children}
    </th>
  )
}

// --- Data cell ---

function Td({
  children,
  right,
  mono = true,
}: {
  children: React.ReactNode
  right?: boolean
  mono?: boolean
}) {
  return (
    <td
      className={clsx('px-3 py-2.5 text-sm', {
        'text-right': right,
        'font-mono': mono,
      })}
      style={{ borderBottom: '1px solid rgba(42,45,62,0.5)' }}
    >
      {children}
    </td>
  )
}

// --- Service row ---

interface ServiceRowProps {
  service: ServiceSummary
  selected: boolean
  onClick: () => void
}

function ServiceRow({ service, selected, onClick }: ServiceRowProps) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer transition-colors"
      style={{
        background: selected ? 'rgba(99,102,241,0.08)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          ;(e.currentTarget as HTMLTableRowElement).style.background =
            'rgba(255,255,255,0.03)'
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          ;(e.currentTarget as HTMLTableRowElement).style.background = 'transparent'
        }
      }}
    >
      {/* Service name */}
      <Td mono={false}>
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: errorRateDotColor(service.error_rate) }}
          />
          <span style={{ color: 'var(--text)', fontFamily: 'inherit' }}>
            {service.name}
          </span>
        </div>
      </Td>

      {/* Rate */}
      <Td right>
        <span style={{ color: 'var(--text)' }}>{fmtRate(service.rate)}</span>
        <span className="text-xs ml-1" style={{ color: 'var(--muted)' }}>
          /m
        </span>
      </Td>

      {/* Error rate */}
      <Td right>
        <span style={{ color: errorRateColor(service.error_rate) }}>
          {fmtErrorRate(service.error_rate)}
        </span>
      </Td>

      {/* P50 */}
      <Td right>
        <span style={{ color: latencyColor(service.p50_ms) }}>{fmtMs(service.p50_ms)}</span>
        <span className="text-xs ml-0.5" style={{ color: 'var(--muted)' }}>
          ms
        </span>
      </Td>

      {/* P95 */}
      <Td right>
        <span style={{ color: latencyColor(service.p95_ms) }}>{fmtMs(service.p95_ms)}</span>
        <span className="text-xs ml-0.5" style={{ color: 'var(--muted)' }}>
          ms
        </span>
      </Td>

      {/* P99 */}
      <Td right>
        <span style={{ color: latencyColor(service.p99_ms) }}>{fmtMs(service.p99_ms)}</span>
        <span className="text-xs ml-0.5" style={{ color: 'var(--muted)' }}>
          ms
        </span>
      </Td>

      {/* Total */}
      <Td right>
        <span style={{ color: 'var(--text)' }}>{fmtRequests(service.total_requests)}</span>
      </Td>
    </tr>
  )
}

// --- Main component ---

export function ServiceTable({
  window,
  onWindowChange,
  selectedService,
  onServiceSelect,
}: ServiceTableProps) {
  const { data, isLoading, isError, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['services', window],
    queryFn: () => fetchServices(window),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : null

  return (
    <div>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              className="px-2.5 py-1 text-xs rounded transition-colors"
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

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              updated {lastUpdated}
            </span>
          )}
          <RefreshCw
            size={12}
            style={{ color: 'var(--muted)', opacity: isFetching ? 1 : 0.3 }}
            className={isFetching ? 'animate-spin' : ''}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: 'rgba(26,29,39,0.8)' }}>
              <Th>Service</Th>
              <Th right>Rate</Th>
              <Th right>Error %</Th>
              <Th right>P50</Th>
              <Th right>P95</Th>
              <Th right>P99</Th>
              <Th right>Requests</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}

            {isError && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm"
                  style={{ color: 'var(--error)' }}
                >
                  Failed to load services. Check API connectivity.
                </td>
              </tr>
            )}

            {!isLoading && !isError && data?.services.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm"
                  style={{ color: 'var(--muted)' }}
                >
                  No services reporting data in the last {window}.
                </td>
              </tr>
            )}

            {data?.services.map((svc) => (
              <ServiceRow
                key={svc.name}
                service={svc}
                selected={selectedService === svc.name}
                onClick={() => onServiceSelect(svc.name)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary footer */}
      {data && (
        <div
          className="px-4 py-2 border-t text-xs flex items-center justify-between"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <span>
            {data.services.length} service{data.services.length !== 1 ? 's' : ''} — window:{' '}
            {data.window}
          </span>
          <span>{data.generated_at}</span>
        </div>
      )}
    </div>
  )
}
