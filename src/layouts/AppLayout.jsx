import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Search, Bell, Menu, X, Settings } from 'lucide-react'
import NavigationSidebar from '../components/NavigationSidebar'
import { navLinks } from '../constants'
import { useAuth } from '../auth/useAuth'
import { ensureDemoSeedData } from '../utils/demoSeed'

const AppLayout = () => {
  const location = useLocation()
  const { isDemoMode, isTesterMode, user } = useAuth()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [demoSeedStatus, setDemoSeedStatus] = useState('idle')

  const currentPage = navLinks.find((link) => link.path === location.pathname)

  useEffect(() => {
    if (!isDemoMode || !user?.id || demoSeedStatus !== 'idle') return

    let isMounted = true

    const seedDemoData = async () => {
      setDemoSeedStatus('loading')

      try {
        await ensureDemoSeedData(user)
        if (isMounted) setDemoSeedStatus('ready')
      } catch (seedError) {
        console.warn('Demo seed failed:', seedError)
        if (isMounted) setDemoSeedStatus('error')
      }
    }

    void seedDemoData()

    return () => {
      isMounted = false
    }
  }, [demoSeedStatus, isDemoMode, user])

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-app text-text-primary">
      <NavigationSidebar
        isMobileNavOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border-soft bg-app/85 backdrop-blur-xl">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:h-[84px] lg:px-8 lg:py-0">
            <button
              type="button"
              onClick={() => setIsMobileNavOpen((isOpen) => !isOpen)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border-soft bg-surface text-text-secondary shadow-[0_6px_20px_rgba(15,23,42,0.04)] transition hover:bg-surface-subtle hover:text-text-primary lg:hidden"
              aria-label={isMobileNavOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={isMobileNavOpen}
            >
              {isMobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-4 lg:max-w-xl">
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search contacts, events, tasks..."
                  className="h-11 w-full rounded-2xl border border-border-soft bg-surface pl-11 pr-4 text-sm text-text-primary shadow-[0_6px_20px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:ring-4 focus:ring-indigo-100 sm:h-12"
                />
              </div>
            </div>

            <div className="hidden shrink-0 items-center gap-2 sm:ml-3 sm:flex lg:ml-6">
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-soft bg-surface text-text-secondary shadow-[0_6px_20px_rgba(15,23,42,0.04)] transition hover:bg-surface-subtle hover:text-text-primary"
              >
                <Bell className="h-4 w-4" />
              </button>

              <Link
                to="/settings"
                aria-label="Open settings"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-soft bg-surface text-text-secondary shadow-[0_6px_20px_rgba(15,23,42,0.04)] transition hover:bg-surface-subtle hover:text-text-primary"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
          <div className="mx-auto max-w-7xl">
            {isDemoMode && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                Demo Mode - explore freely. Data may reset.
                {demoSeedStatus === 'loading' && (
                  <span className="ml-1 font-normal">Preparing demo data...</span>
                )}
                {demoSeedStatus === 'error' && (
                  <span className="ml-1 font-normal">
                    Demo seed could not finish. Refresh or contact the app owner.
                  </span>
                )}
              </div>
            )}

            {isTesterMode && (
              <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
                Tester Mode - your data is isolated and can be edited safely.
              </div>
            )}

            <div className="mb-4 lg:mb-5">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Workspace
              </p>

              <h1 className="break-words text-2xl font-semibold tracking-tight text-text-primary">
                {currentPage?.title || 'Dashboard'}
              </h1>
            </div>

            <Outlet key={isDemoMode ? demoSeedStatus : 'app'} />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AppLayout
