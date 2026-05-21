import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarDays,
  ListChecks,
  FileText,
  Users,
  Briefcase,
  Receipt,
  Settings,
  Shield,
  HelpCircle,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../auth/useAuth'

const navLinks = [
  { id: 'dashboard', title: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, group: 'general' },
  { id: 'enquiries', title: 'Enquiries', path: '/enquiries', icon: FileText, group: 'general' },
  { id: 'customers', title: 'Customers', path: '/customers', icon: Users, group: 'general' },
  { id: 'bookings', title: 'Bookings', path: '/bookings', icon: Briefcase, group: 'general' },
  { id: 'schedule', title: 'Schedule', path: '/schedule', icon: CalendarDays, group: 'general' },
  { id: 'tasks', title: 'Tasks', path: '/tasks', icon: ListChecks, group: 'general' },
  { id: 'invoices', title: 'Invoices', path: '/invoices', icon: Receipt, group: 'tools' },
]

const supportLinks = [
  { id: 'settings', title: 'Settings', path: '/settings', icon: Settings },
  { id: 'security', title: 'Security', icon: Shield },
  { id: 'help', title: 'Help', icon: HelpCircle },
]

const NavigationSidebar = ({ isMobileNavOpen = false, onClose }) => {
  const { signOut, user } = useAuth()
  const generalLinks = navLinks.filter((item) => item.group === 'general')
  const toolLinks = navLinks.filter((item) => item.group === 'tools')

  const handleSignOut = async () => {
    await signOut()
    onClose?.()
  }

  const renderNavItem = (item) => {
    const Icon = item.icon
    const baseClass =
      'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition'

    if (!item.path) {
      return (
        <button
          key={item.id}
          type="button"
          className={`${baseClass} w-full text-text-secondary hover:bg-surface-subtle hover:text-text-primary`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-subtle text-text-secondary transition group-hover:bg-surface group-hover:text-text-primary">
            <Icon className="h-4 w-4" />
          </span>

          <span>{item.title}</span>
        </button>
      )
    }

    return (
      <NavLink
        key={item.id}
        to={item.path}
        onClick={onClose}
        className={({ isActive }) =>
          `${baseClass} ${
            isActive
              ? 'border border-border-soft bg-surface text-text-primary shadow-[0_6px_20px_rgba(15,23,42,0.05)]'
              : 'text-text-secondary hover:bg-surface-subtle hover:text-text-primary'
          }`
        }
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-subtle text-text-secondary transition group-hover:bg-surface group-hover:text-text-primary">
          <Icon className="h-4 w-4" />
        </span>

        <span>{item.title}</span>
      </NavLink>
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-text-primary/30 backdrop-blur-sm transition-opacity lg:hidden ${
          isMobileNavOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(82vw,252px)] flex-col border-r border-border-soft bg-app shadow-[0_20px_50px_rgba(15,23,42,0.16)] transition-transform duration-200 lg:static lg:z-auto lg:w-[252px] lg:translate-x-0 lg:shadow-none ${
          isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
      <div className="flex h-[84px] items-center border-b border-border-soft px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-text-primary text-sm font-semibold text-white shadow-[0_8px_20px_rgba(15,23,42,0.12)]">
            DJ
          </div>

          <div>
            <p className="text-base font-semibold tracking-tight text-text-primary">
              DJ CRM
            </p>
            <p className="text-xs text-text-muted">Studio workspace</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mb-8">
          <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            General
          </p>

          <nav className="space-y-1.5">
            {generalLinks.map(renderNavItem)}
          </nav>
        </div>

        <div>
          <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Tools
          </p>

          <nav className="space-y-1.5">
            {toolLinks.map(renderNavItem)}
          </nav>
        </div>
      </div>

      <div className="border-t border-border-soft px-4 py-4">
        <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Support
        </p>

        <nav className="space-y-1.5">
          {supportLinks.map(renderNavItem)}
        </nav>

        <div className="mt-5 rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_6px_20px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-text-primary">
              DJ
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">
                {user?.email || 'DJ Setup'}
              </p>
              <p className="text-xs text-text-muted">Authenticated</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface-subtle px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-surface"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
      </aside>
    </>
  )
}

export default NavigationSidebar
