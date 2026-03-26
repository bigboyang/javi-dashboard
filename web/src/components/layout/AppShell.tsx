import type { ReactNode } from 'react'
import { Activity, GitBranch, ScrollText } from 'lucide-react'

interface NavItem {
  icon: ReactNode
  label: string
  active: boolean
  disabled: boolean
}

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const navItems: NavItem[] = [
    {
      icon: <Activity size={16} />,
      label: 'Overview',
      active: true,
      disabled: false,
    },
    {
      icon: <GitBranch size={16} />,
      label: 'Traces',
      active: false,
      disabled: true,
    },
    {
      icon: <ScrollText size={16} />,
      label: 'Logs',
      active: false,
      disabled: true,
    },
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
            <NavButton key={item.label} {...item} />
          ))}
        </nav>

        {/* Footer */}
        <div className="mt-auto px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Phase 1
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)', opacity: 0.6 }}>
            RED Metrics
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}

function NavButton({ icon, label, active, disabled }: NavItem) {
  const baseStyle: React.CSSProperties = {
    color: disabled
      ? 'var(--muted)'
      : active
        ? 'var(--text)'
        : 'var(--muted)',
    background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? 'not-allowed' : 'default',
  }

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium select-none transition-colors"
      style={baseStyle}
      aria-disabled={disabled}
      role="menuitem"
    >
      {icon}
      <span>{label}</span>
      {disabled && (
        <span
          className="ml-auto text-xs rounded px-1"
          style={{
            fontSize: '9px',
            color: 'var(--muted)',
            background: 'var(--border)',
            opacity: 0.7,
            letterSpacing: '0.05em',
          }}
        >
          SOON
        </span>
      )}
    </div>
  )
}
