import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { LayoutGrid, Megaphone, Notebook } from '../../components/icons'

/* Teacher portal shell — navy sidebar (matching the Landing / Auth brand
   identity) beside the scrolling content area. Top-level nav is just three
   sections; per-class tools live in the sub-navbar inside a class (ClassLayout). */

const navy = '#0E2A5C'
const gold = '#F5C518'
const cream = '#FAFAF6'

const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const sans = "'Plus Jakarta Sans', sans-serif"

const NAV_ITEMS = [
  { to: '/teacher', label: 'Dashboard', end: true, Icon: LayoutGrid },
  { to: '/teacher/announcements', label: 'Announcement', Icon: Megaphone },
  { to: '/teacher/classes', label: 'My Classes', Icon: Notebook },
]

const navBase = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  textAlign: 'left',
  padding: '11px 14px',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: sans,
  borderRadius: 10,
  textDecoration: 'none',
}

function navStyle(isActive) {
  return isActive
    ? { ...navBase, background: 'rgba(255,255,255,0.1)', color: cream }
    : { ...navBase, background: 'transparent', color: 'rgba(250,250,246,0.66)' }
}

export default function TeacherLayout() {
  const { profile, logout } = useAuth()
  const initials = `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase()

  return (
    <div
      className="grid min-h-screen grid-cols-1 md:grid-cols-[256px_1fr]"
      style={{ background: '#EEF1F6', color: '#0A1733', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      {/* SIDEBAR */}
      <aside className="relative flex flex-col overflow-hidden" style={{ background: navy, color: cream }}>
        <div aria-hidden="true" style={{ position: 'absolute', top: -90, right: -90, width: 260, height: 260, border: '1px solid rgba(245,197,24,0.12)', borderRadius: '50%' }} />
        <div aria-hidden="true" style={{ position: 'absolute', bottom: 90, left: -120, width: 280, height: 280, border: '1px solid rgba(63,169,245,0.1)', borderRadius: '50%' }} />

        {/* brand */}
        <div className="relative" style={{ padding: '26px 22px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2.5">
            <div style={{ position: 'relative', width: 32, height: 32, borderRadius: 8, background: cream, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2.5px solid ${navy}`, borderRightColor: 'transparent', transform: 'rotate(35deg)' }} />
              <div style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: gold }} />
            </div>
            <div>
              <div style={{ ...serif, fontSize: 20, lineHeight: 1, letterSpacing: '-0.01em' }}>Activklass</div>
              <div style={{ fontSize: 11, color: 'rgba(250,250,246,0.55)', marginTop: 3, letterSpacing: '0.02em' }}>Teacher Portal</div>
            </div>
          </div>
        </div>

        {/* nav */}
        <nav className="relative flex flex-1 flex-col gap-1" style={{ padding: '18px 14px' }}>
          {NAV_ITEMS.map(({ to, label, end, Icon }) => (
            <NavLink key={to} to={to} end={end} className="ak-nav" style={({ isActive }) => navStyle(isActive)}>
              {({ isActive }) => (
                <>
                  <Icon className="h-[17px] w-[17px]" />
                  {label}
                  {isActive && (
                    <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, borderRadius: '0 3px 3px 0', background: gold }} />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* user */}
        <div className="relative" style={{ padding: 18, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #F5C518, #3FA9F5)', display: 'grid', placeItems: 'center', color: navy, fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>
                {profile.first_name} {profile.last_name}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(250,250,246,0.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile.email}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            style={{ width: '100%', padding: 10, fontSize: 13, fontWeight: 600, fontFamily: sans, color: 'rgba(250,250,246,0.85)', background: 'transparent', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 9, cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="overflow-y-auto px-6 py-8 md:px-11 md:py-9">
        <Outlet />
      </main>
    </div>
  )
}
