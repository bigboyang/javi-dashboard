import type { ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Activity, GitBranch, ScrollText, Network, BarChart2, Bell, TrendingUp } from 'lucide-react'

interface NavItem {
  icon: ReactNode
  label: string
  to: string
}

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { location } = useRouterState()

  const navItems: NavItem[] = [
    { icon: <Activity size={16} />, label: 'Overview', to: '/' },
    { icon: <GitBranch size={16} />, label: 'Traces', to: '/traces' },
    { icon: <ScrollText size={16} />, label: 'Logs', to: '/logs' },
    { icon: <Network size={16} />, label: 'Topology', to: '/topology' },
    { icon: <BarChart2 size={16} />, label: 'Metrics', to: '/metrics' },
    { icon: <Bell size={16} />, label: 'Alerts', to: '/alerts' },
    { icon: <TrendingUp size={16} />, label: 'Forecast', to: '/forecast' },
  ]

  return (
    <div
      className="flex min-h-screen"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0 w-44 border-r"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2 px-4 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <span
            className="text-sm font-bold tracking-tight"
            style={{ color: 'var(--accent)' }}
          >
            javi
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(99,102,241,0.15)',
              color: 'var(--accent)',
              fontSize: '10px',
              letterSpacing: '0.05em',
            }}
          >
            APM
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 p-2 mt-1">
          {navItems.map((item) => (
            <NavButton
              key={item.label}
              icon={item.icon}
              label={item.label}
              to={item.to}
              active={location.pathname === item.to}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="mt-auto px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Phase 6
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)', opacity: 0.6 }}>
            Forecast
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}

function NavButton({
  icon,
  label,
  to,
  active,
}: {
  icon: ReactNode
  label: string
  to: string
  active: boolean
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium select-none transition-colors"
      style={{
        color: active ? 'var(--text)' : 'var(--muted)',
        background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
        textDecoration: 'none',
      }}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )
}
