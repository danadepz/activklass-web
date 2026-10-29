import { Outlet, Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/context/useAuth'
import SignOutButton from '@/components/SignOutButton'
import {
  PENDING_REQUESTS_KEY,
  PENDING_TEACHERS_KEY,
  fetchPendingRequests,
  fetchPendingTeachers,
} from './queues'

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

  /* The counts the tabs wear. Same query keys the two queues use, so opening
     a tab does not re-read what the bar already fetched and acting on one
     updates the other. Cheap by nature: both collections are what is waiting
     on us, never what exists. */
  const { data: pendingTeachers } = useQuery({
    queryKey: PENDING_TEACHERS_KEY,
    queryFn: fetchPendingTeachers,
    staleTime: 60 * 1000,
  })
  const { data: pendingRequests } = useQuery({
    queryKey: PENDING_REQUESTS_KEY,
    queryFn: fetchPendingRequests,
    staleTime: 60 * 1000,
  })

  /* Top-level navigation:
     - Subscribers: active on /superadmin
     - Approvals: consolidated queue for both Schools and Solo Teachers.
       Shows total waiting count. When active, exposes sub-navigation pills
       for Schools and Solo teachers. */
  const totalPending = (pendingRequests?.length || 0) + (pendingTeachers?.length || 0)
  const isApprovals =
    pathname.startsWith('/superadmin/requests') ||
    pathname.startsWith('/superadmin/verifications') ||
    pathname.startsWith('/superadmin/approvals')

  const topTabs = [
    {
      to: '/superadmin',
      label: 'Subscribers',
      active: pathname === '/superadmin',
    },
    {
      to: pathname.startsWith('/superadmin/verifications') ? '/superadmin/verifications' : '/superadmin/requests',
      label: 'Approvals',
      waiting: totalPending,
      active: isApprovals,
    },
  ]

  const approvalSubTabs = [
    {
      to: '/superadmin/requests',
      label: 'Schools',
      waiting: pendingRequests?.length || 0,
      active: pathname === '/superadmin/requests',
    },
    {
      to: '/superadmin/verifications',
      label: 'Solo teachers',
      waiting: pendingTeachers?.length || 0,
      active: pathname === '/superadmin/verifications',
    },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <div className="mx-auto max-w-[1440px] 2xl:max-w-[1600px] px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* The mark identifies the product; the INTERNAL badge stays beside
                it at equal weight so a screenshot still reads as ours-not-theirs.
                Deliberately small and unaccompanied by the wordmark or the navy
                — this is a build stamp, not the customer brand. */}
            <img
              src="/brand-cap.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 opacity-90"
            />
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
            {/* Signing out is the only way out of the console, deliberately.
                There used to be an "Exit to site" link beside this; it pointed
                at /portal, which RoleHomeRedirect bounces a super admin straight
                back here from before it ever reads their role
                (ProtectedRoute.jsx) — so it did nothing. Repointed at the
                landing page it worked, but then it sat next to this one as a
                near-identical button for a trip a browser back button already
                makes. Red hover because this ends the session: coming back
                costs a re-auth, and for a super admin the claim only returns on
                a fresh ID token. */}
            <SignOutButton className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:border-red-500/40 hover:bg-red-500/5 hover:text-red-300" />
          </div>
        </div>

        <nav aria-label="Superadmin Navigation" className="mx-auto max-w-[1440px] 2xl:max-w-[1600px] px-6 lg:px-8 flex gap-1">
          {topTabs.map((tab) => (
            <Link
              key={tab.label}
              to={tab.to}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition ${
                tab.active
                  ? 'border-amber-400 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
              {tab.waiting > 0 && (
                <span className="ml-1.5 rounded bg-amber-400/15 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                  {tab.waiting}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {isApprovals && (
          <div className="border-t border-zinc-800/80 bg-zinc-950/40">
            <nav aria-label="Approvals Queues" className="mx-auto max-w-[1440px] 2xl:max-w-[1600px] px-6 lg:px-8 flex gap-2 py-2">
              {approvalSubTabs.map((subTab) => (
                <Link
                  key={subTab.to}
                  to={subTab.to}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    subTab.active
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/80'
                      : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  <span>{subTab.label}</span>
                  {subTab.waiting > 0 && (
                    <span className="rounded bg-amber-400/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                      {subTab.waiting}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1440px] 2xl:max-w-[1600px] px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
