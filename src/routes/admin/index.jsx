import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/useAuth'
import { navy, gold, cream, faint, sansFamily as sans, serif } from '@/theme'
import AccountMenu from './AccountMenu'
import UsersTab from './UsersTab'
import ClassesTab from './ClassesTab'
import SubscriptionTab from './SubscriptionTab'
import HomeTab from './HomeTab'

/**
 * Admin console.
 *
 * Covers the Admin column of the module list: User Management (create, bulk
 * upload, enable/disable) and Class Oversight (all classes, class records,
 * school-wide statistics), with CSV export on both tables.
 *
 * Subscription Management covers plan status, seat usage and storage. Seat
 * usage is counted live from the users collection; nothing is enforced.
 */
const TABS = [
  { key: 'home', label: 'Home', hint: 'Your account and the password you sign in with' },
  { key: 'users', label: 'Users', hint: 'Create, upload, enable and disable accounts' },
  { key: 'classes', label: 'Class Overview', hint: 'All classes, records and school statistics' },
  { key: 'subscription', label: 'Subscription', hint: 'Plan, seat usage and storage' },
]

export default function AdminPage() {
  const { profile } = useAuth()
  // A PayMongo seat-increase checkout returns to /admin?tab=subscription --
  // read once on mount so that lands on the Subscription tab instead of the
  // Users default, which would never mount SubscriptionTab to poll the
  // pending payment. Not a full URL-synced tab system -- clicking a tab
  // afterward does not write the URL, same as before this.
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(() => {
    const requested = searchParams.get('tab')
    return TABS.some((t) => t.key === requested) ? requested : 'home'
  })
  const active = TABS.find((t) => t.key === tab) ?? TABS[0]
  // Keep the scrollbar track present on every tab. Tabs differ in height, so
  // without this the scrollbar appears and disappears as you switch and the
  // whole bar (title, account menu, tabs) jumps sideways by its width.
  useEffect(() => {
    const root = document.documentElement
    const before = root.style.overflowY
    root.style.overflowY = 'scroll'
    return () => { root.style.overflowY = before }
  }, [])
  return (
    <div style={{ minHeight: '100vh', background: cream, fontFamily: sans }}>
      {/* Title bar and sub navbar stay pinned while the page scrolls. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30 }}>
      <header style={{ background: navy, color: cream, padding: '12px 28px', position: 'relative' }}>
        {/* T-184 (andecobs-293): navy edge-to-edge filler beside the header;
            absolutely positioned inside it so it tracks the header's own box
            and scrolls away with it. */}
        <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, right: -24, width: 24, background: navy, pointerEvents: 'none' }} />
        {/* 1440 (was 1100): the Users table's seven columns did not fit at
            1100 and scrolled sideways. Header, sub navbar and main share the
            width so their edges line up. */}
        <div style={{ maxWidth: 1440, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ ...serif, fontSize: 32, lineHeight: 1.1 }}>
            ActivKlass <span style={{ color: gold }}>School Admin</span>
          </div>
          {/* Who is signed in, and Sign Out inside its menu. Change Password
              opens the Subscription tab, where that form lives. */}
          <div style={{ marginRight: -16 }}>
            <AccountMenu profile={profile} />
          </div>
        </div>
      </header>

      {/* Sub navbar: the console's sections live here, so a new section is one
          more entry in TABS and the title bar above never has to change. */}
      <nav aria-label="Admin sections" style={{ background: '#FFFFFF', borderBottom: '1px solid rgba(14,42,92,0.08)', padding: '0 28px' }}>
        <div style={{ maxWidth: 1440, margin: '0 auto', display: 'flex', gap: 4, overflowX: 'auto' }}>
          {TABS.map((t) => {
            const on = t.key === tab
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={on ? 'page' : undefined}
                className="whitespace-nowrap transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0E2A5C]/40"
                style={{
                  padding: '13px 16px 11px', fontSize: 14, fontWeight: 700, fontFamily: sans,
                  color: on ? navy : '#5B6B8C',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderBottom: on ? `3px solid ${gold}` : '3px solid transparent',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>
      </div>

      <main style={{ maxWidth: 1440, margin: '0 auto', padding: '22px 24px 60px' }}>
        <p style={{ fontSize: 13, color: faint, margin: '0 0 18px' }}>{active.hint}</p>
        {tab === 'home' && <HomeTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'classes' && <ClassesTab />}
        {tab === 'subscription' && <SubscriptionTab />}

      </main>
    </div>
  )
}
