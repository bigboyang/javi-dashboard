import { useQuery } from '@tanstack/react-query'

interface HealthResponse {
  status: string
  clickhouse: string
  timestamp: string
}

function App() {
  const { data, isLoading, isError } = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: () => fetch('/health').then(r => r.json()),
  })

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      {/* Logo */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
          javi-dashboard
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
          Java APM Dashboard — Phase 0 Setup
        </p>
      </div>

      {/* Health card */}
      <div
        className="rounded-xl border p-6 w-full max-w-md space-y-3"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          System Status
        </h2>

        {isLoading && (
          <p style={{ color: 'var(--muted)' }}>Checking...</p>
        )}
        {isError && (
          <StatusRow label="API Server" status="error" value="unreachable" />
        )}
        {data && (
          <>
            <StatusRow label="API Server" status="ok" value="ok" />
            <StatusRow label="ClickHouse" status={data.clickhouse === 'ok' ? 'ok' : 'error'} value={data.clickhouse} />
            <div className="pt-2 text-xs" style={{ color: 'var(--muted)' }}>
              {data.timestamp}
            </div>
          </>
        )}
      </div>

      {/* Phase roadmap */}
      <div
        className="rounded-xl border p-6 w-full max-w-md space-y-2"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Implementation Roadmap
        </h2>
        {[
          { phase: 'Phase 0', label: 'Project Setup', done: true },
          { phase: 'Phase 1', label: 'Service Overview (RED Metrics)', done: false },
          { phase: 'Phase 2', label: 'Trace Explorer + Waterfall', done: false },
          { phase: 'Phase 3', label: 'Log Viewer + Live Tail', done: false },
          { phase: 'Phase 4', label: 'Service Topology Map', done: false },
          { phase: 'Phase 5', label: 'Custom Metrics Dashboard', done: false },
          { phase: 'Phase 6', label: 'Schema Hardening + Alerts', done: false },
        ].map(({ phase, label, done }) => (
          <div key={phase} className="flex items-center gap-3 text-sm">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: done ? 'var(--success)' : 'var(--border)' }}
            />
            <span style={{ color: done ? 'var(--text)' : 'var(--muted)' }}>
              <span className="font-medium">{phase}</span> — {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusRow({ label, status, value }: { label: string; status: 'ok' | 'error'; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span
        className="px-2 py-0.5 rounded text-xs font-medium"
        style={{
          background: status === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          color: status === 'ok' ? 'var(--success)' : 'var(--error)',
        }}
      >
        {value}
      </span>
    </div>
  )
}

export default App
