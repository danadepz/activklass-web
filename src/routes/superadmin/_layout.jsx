import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/useAuth'
import SignOutButton from '@/components/SignOutButton'

/**
 * Shell for the developer console.
 *
 * Deliberately unlike the rest of the app. The school-facing portals are light,
 * navy and serif; this is dark and dense, and says INTERNAL at the top. That is
 * not decoration — it is so nobody screenshots this into a customer deck, and
 * so it is obvious at a glance which side of the product you are looking at.
 *
 * Styling is local rather than drawn from src/theme.js: the theme is the
 * customer brand, and this console is not part of it.
 */
export default function SuperAdminLayout() {
  const { profile } = useAuth()
  const { pathname } = useLocation()

  const tabs = [{ to: '/superadmin', label: 'Subscribers' }]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded bg-amber-400/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300 border border-amber-400/30">
              Internal
            </span>
            <div>
              <div className="font-mono text-sm font-semibold tracking-tight">
                ActivKlass Operations
              </div>
              <div className="text-[11px] text-zinc-500">
                Subscriber and entitlement management
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-zinc-500">
              {profile?.email ?? 'signed in'}
            </span>
            <Link
              to="/portal"
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
            >
              Exit to app
            </Link>
            <SignOutButton className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:border-zinc-700" />
          </div>
        </div>

        {tabs.length > 1 && (
          <nav className="mx-auto max-w-6xl px-6 flex gap-1">
            {tabs.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                className={`px-3 py-2 text-xs font-semibold border-b-2 ${
                  pathname === tab.to
                    ? 'border-amber-400 text-zinc-100'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
