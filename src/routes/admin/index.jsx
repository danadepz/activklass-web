import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/useAuth'
import { navy, gold, cream, faint, sansFamily as sans, serif } from '@/theme'
import AccountMenu from './AccountMenu'
import UsersTab from './UsersTab'
import ClassesTab from './ClassesTab'
import SubscriptionTab from './SubscriptionTab'

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
    return TABS.some((t) => t.key === requested) ? requested : 'users'
  })
  const active = TABS.find((t) => t.key === tab) ?? TABS[0]
  // Account menu → Change Password: open Subscription (where the form lives)
  // and tell it to scroll to the form. A counter, so choosing it again while
  // already on that tab still jumps back to the form.
  const [passwordRequest, setPasswordRequest] = useState(0)
  function openChangePassword() {
    setTab('subscription')
    setPasswordRequest((n) => n + 1)
  }

  return (
    <div style={{ minHeight: '100vh', background: cream, fontFamily: sans }}>
      <header style={{ background: navy, color: cream, padding: '20px 28px 0', position: 'relative' }}>
        {/* T-184 (andecobs-293): this header is navy edge-to-edge, but its
            own width is narrowed by the scrollbar-gutter html reserves on
            the right (src/index.css), leaving a pale strip beside it where
            html's own background shows instead. This header scrolls away
            with the page (no sticky/fixed), so the fix has to scroll with
            it too -- an absolutely-positioned child tracks the header's own
            box exactly, at every height and every scroll position, which a
            viewport-fixed filler (used on the sticky teacher nav) could not. */}
        <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, right: -24, width: 24, background: navy, pointerEvents: 'none' }} />
        {/* 1440 (was 1100): the Users table's seven columns did not fit at
            1100 and scrolled sideways. Header and main share the width so
            their edges line up. */}
        <div style={{ maxWidth: 1440, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 16, flexWrap: 'wrap' }}>
            <div style={{ ...serif, fontSize: 22, lineHeight: 1.1 }}>
              ActivKlass <span style={{ color: gold }}>Admin</span>
            </div>
            {/* Who is signed in, and Sign Out inside its menu -- replaces the
                old signed-in caption and the lone Sign Out button. Change
                Password opens the Subscription tab, where that form lives. */}
            <AccountMenu profile={profile} onChangePassword={openChangePassword} />
          </div>

          <nav style={{ display: 'flex', gap: 4, marginTop: 18 }}>
            {TABS.map((t) => {
              const on = t.key === tab
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`transition focus-visible:outline-none ${
                    on
                      ? 'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1E6FB0]'
                      : 'focus-visible:ring-2 focus-visible:ring-[#FAFAF6] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0E2A5C]'
                  }`}
                  style={{
                    padding: '10px 16px', fontSize: 14, fontWeight: 700, fontFamily: sans,
                    color: on ? navy : cream,
                    background: on ? cream : 'transparent',
                    border: 'none', borderRadius: '10px 10px 0 0', cursor: 'pointer',
                    opacity: on ? 1 : 0.75,
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1440, margin: '0 auto', padding: '22px 24px 60px' }}>
        <p style={{ fontSize: 13, color: faint, margin: '0 0 18px' }}>{active.hint}</p>
        {tab === 'users' && <UsersTab />}
        {tab === 'classes' && <ClassesTab />}
        {tab === 'subscription' && <SubscriptionTab passwordRequest={passwordRequest} />}
      </main>
    </div>
  )
}
