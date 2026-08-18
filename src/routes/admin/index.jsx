import { useState } from 'react'
import { useAuth } from '@/context/useAuth'
import { navy, gold, cream, faint, sansFamily as sans, serif } from '@/theme'
import { btnGhost } from './ui'
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
  { key: 'classes', label: 'Class oversight', hint: 'All classes, records and school statistics' },
  { key: 'subscription', label: 'Subscription', hint: 'Plan, seat usage and storage' },
]

export default function AdminPage() {
  const { profile, logout } = useAuth()
  const [tab, setTab] = useState('users')
  const active = TABS.find((t) => t.key === tab) ?? TABS[0]

  return (
    <div style={{ minHeight: '100vh', background: cream, fontFamily: sans }}>
      <header style={{ background: navy, color: cream, padding: '20px 28px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                        gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ ...serif, fontSize: 22, lineHeight: 1.1 }}>
                ActivKlass <span style={{ color: gold }}>Admin</span>
              </div>
              <div style={{ fontSize: 12.5, opacity: 0.75 }}>
                Signed in as {profile.first_name} {profile.last_name}
              </div>
            </div>
            <button onClick={logout} style={{ ...btnGhost, background: 'transparent', color: cream,
                                              borderColor: 'rgba(250,250,246,0.35)' }}>
              Sign out
            </button>
          </div>

          <nav style={{ display: 'flex', gap: 4, marginTop: 18 }}>
            {TABS.map((t) => {
              const on = t.key === tab
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
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

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px 60px' }}>
        <p style={{ fontSize: 13, color: faint, margin: '0 0 18px' }}>{active.hint}</p>
        {tab === 'users' && <UsersTab />}
        {tab === 'classes' && <ClassesTab />}
        {tab === 'subscription' && <SubscriptionTab />}
      </main>
    </div>
  )
}
