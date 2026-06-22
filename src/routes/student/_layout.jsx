import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/useAuth'
import { LayoutGrid, BookOpen, TrendingUp, ShieldCheck } from '@/components/icons'
import StudentNotificationBell from '@/components/StudentNotificationBell'

/* Student Portal shell — responsive glassmorphic sidebar over a navy gradient,
   per docs/06-student-portal-outline.md §2. Brand tokens match the rest of
   Activklass (navy + gold + cream). */

const navy = '#0E2A5C'
const navyDeep = '#061840'
const gold = '#F5C518'
const cream = '#FAFAF6'
const ink = '#0A1733'

const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const sans = "'Plus Jakarta Sans', sans-serif"

const NAV_ITEMS = [
  { to: '/student', label: 'Dashboard', Icon: LayoutGrid, end: true },
  { to: '/student/classes', label: 'My Classes', Icon: BookOpen },
  { to: '/student/remediation', label: 'Remediation', Icon: TrendingUp },
  { to: '/student/profile', label: 'Profile', Icon: ShieldCheck },
]

function glassLink(isActive) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 14px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: sans,
    borderRadius: 12,
    textDecoration: 'none',
    color: isActive ? navy : 'rgba(250,250,246,0.78)',
    background: isActive ? cream : 'transparent',
    border: isActive ? '1px solid rgba(255,255,255,0.4)' : '1px solid transparent',
    boxShadow: isActive ? '0 8px 20px -10px rgba(0,0,0,0.45)' : 'none',
    transition: 'background 0.15s, color 0.15s',
  }
}

function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <div style={{ position: 'relative', width: 36, height: 36, borderRadius: 9, background: cream, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2.5px solid ${navy}`, borderRightColor: 'transparent', transform: 'rotate(35deg)' }} />
        <div style={{ position: 'absolute', top: -3, right: -3, width: 9, height: 9, borderRadius: '50%', background: gold }} />
      </div>
      <div>
        <div style={{ ...serif, fontSize: 22, lineHeight: 1, color: cream, letterSpacing: '-0.01em' }}>Activklass</div>
        <div style={{ fontSize: 10, color: 'rgba(250,250,246,0.55)', letterSpacing: '0.08em', marginTop: 2 }}>STUDENT PORTAL</div>
      </div>
    </div>
  )
}

function NavList({ onNavigate }) {
  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {NAV_ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={onNavigate} style={({ isActive }) => glassLink(isActive)}>
          {({ isActive }) => (
            <>
              <Icon className="h-[18px] w-[18px]" style={{ color: isActive ? navy : gold }} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function UserCard({ profile, logout }) {
  const initials = `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase()
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {profile.photo_url ? (
          <img src={profile.photo_url} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.25)' }} />
        ) : (
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #F5C518, #3FA9F5)', display: 'grid', placeItems: 'center', color: navy, fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
            {initials}
          </div>
        )}
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile.first_name} {profile.last_name}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(250,250,246,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile.email}
          </div>
        </div>
      </div>
      <button
        onClick={logout}
        className="transition hover:bg-white/10"
        style={{ width: '100%', padding: '9px 14px', fontSize: 13, fontWeight: 600, fontFamily: sans, color: 'rgba(250,250,246,0.85)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 10, cursor: 'pointer' }}
      >
        Sign out
      </button>
    </div>
  )
}

export default function StudentLayout() {
  const { profile, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const sidebarInner = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20, gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Brand />
        <StudentNotificationBell dark align="left" />
      </div>
      <div style={{ flex: 1 }}>
        <NavList onNavigate={() => setMenuOpen(false)} />
      </div>
      <UserCard profile={profile} logout={logout} />
    </div>
  )

  // Glass sidebar surface: translucent navy with blur, layered over the gradient.
  const sidebarSurface = {
    background: 'linear-gradient(180deg, rgba(14,42,92,0.92), rgba(6,24,64,0.96))',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    borderRight: '1px solid rgba(255,255,255,0.1)',
  }

  return (
    <div style={{ minHeight: '100vh', background: `radial-gradient(1200px 600px at -10% -10%, rgba(63,169,245,0.18), transparent 55%), radial-gradient(900px 500px at 110% 10%, rgba(245,197,24,0.14), transparent 50%), linear-gradient(180deg, ${navyDeep}, #0A1733)`, color: ink, fontFamily: sans }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex" style={{ ...sidebarSurface, position: 'fixed', top: 0, left: 0, bottom: 0, width: 256, flexDirection: 'column', zIndex: 40 }}>
        {sidebarInner}
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden" style={{ position: 'sticky', top: 0, zIndex: 50, ...sidebarSurface, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
        <Brand />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <StudentNotificationBell dark />
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          style={{ width: 38, height: 38, borderRadius: 9, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: cream, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            {menuOpen ? (
              <>
                <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="17" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="3" y1="14" x2="17" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
        </div>
      </header>
      {menuOpen && (
        <div className="md:hidden" style={{ ...sidebarSurface, padding: '8px 16px 18px', position: 'sticky', top: 62, zIndex: 49 }}>
          <NavList onNavigate={() => setMenuOpen(false)} />
          <div style={{ marginTop: 16 }}>
            <UserCard profile={profile} logout={logout} />
          </div>
        </div>
      )}

      {/* Main content — light glass panel so the dashboard cards read cleanly */}
      <main className="md:ml-64">
        <div
          className="px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-9"
          style={{ minHeight: '100vh', background: 'rgba(238,241,246,0.97)', borderTopLeftRadius: 0 }}
        >
          <Outlet />
        </div>
      </main>
    </div>
  )
}
