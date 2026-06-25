import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/useAuth'
import StudentNotificationBell from '@/components/StudentNotificationBell'
import { BrandMark } from '@/components/AuthLayout'

const navy = '#0E2A5C'
const gold = '#F5C518'
const cream = '#FAFAF6'

const serif = { fontFamily: "'Lexend', 'Inter', sans-serif" }
const sans = "'Plus Jakarta Sans', sans-serif"

const NAV_ITEMS = [
  { to: '/student', label: 'Dashboard', end: true },
  { to: '/student/classes', label: 'My Classes' },
  { to: '/student/remediation', label: 'Remediation' },
  { to: '/student/profile', label: 'Profile' },
]

function HamburgerIcon({ open }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {open ? (
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
  )
}

function navLinkStyle(isActive) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '7px 14px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: sans,
    borderRadius: 8,
    textDecoration: 'none',
    color: isActive ? cream : 'rgba(250,250,246,0.66)',
    background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
    position: 'relative',
  }
}

function mobileNavLinkStyle(isActive) {
  return {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    fontSize: 15,
    fontWeight: 600,
    fontFamily: sans,
    borderRadius: 10,
    textDecoration: 'none',
    color: isActive ? cream : 'rgba(250,250,246,0.75)',
    background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
    borderLeft: isActive ? `3px solid ${gold}` : '3px solid transparent',
  }
}

function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      <BrandMark size={32} onNavy />
      <div>
        <div style={{ ...serif, fontSize: 22, lineHeight: 1, letterSpacing: '-0.02em', color: cream }}>ActivKlass</div>
        <div className="hidden sm:block" style={{ fontSize: 10, color: 'rgba(250,250,246,0.5)', letterSpacing: '0.05em', marginTop: 1 }}>Student Portal</div>
      </div>
    </div>
  )
}

export default function StudentLayout() {
  const { profile, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const initials = `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase()

  const closeMenu = () => setMenuOpen(false)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: '#EEF1F6',
        color: '#0A1733',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* TOP NAV */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: navy,
          color: cream,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* decorative rings — desktop only */}
        <div aria-hidden="true" className="hidden md:block" style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, border: '1px solid rgba(245,197,24,0.1)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div aria-hidden="true" className="hidden md:block" style={{ position: 'absolute', bottom: -80, left: -80, width: 200, height: 200, border: '1px solid rgba(63,169,245,0.08)', borderRadius: '50%', pointerEvents: 'none' }} />

        {/* Main bar */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            height: 64,
            gap: 16,
          }}
        >
          {/* LEFT — brand + desktop nav */}
          <div className="flex items-center" style={{ gap: 24, flex: 1 }}>
            <Brand />

            {/* Desktop nav links */}
            <nav className="hidden md:flex items-center" style={{ gap: 2 }}>
              {NAV_ITEMS.map(({ to, label, end }) => (
                <NavLink key={to} to={to} end={end} style={({ isActive }) => navLinkStyle(isActive)}>
                  {({ isActive }) => (
                    <>
                      {label}
                      {isActive && (
                        <span
                          style={{
                            position: 'absolute',
                            bottom: -1,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: 24,
                            height: 3,
                            borderRadius: '3px 3px 0 0',
                            background: gold,
                          }}
                        />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* RIGHT — actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {/* Notification bell */}
            <StudentNotificationBell dark />

            {/* Avatar + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {profile.photo_url ? (
                <img
                  src={profile.photo_url}
                  alt=""
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0,
                    border: '1px solid rgba(255,255,255,0.25)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #F5C518, #3FA9F5)',
                    display: 'grid',
                    placeItems: 'center',
                    color: navy,
                    fontWeight: 800,
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>
              )}
              <div className="hidden md:block" style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: cream }}>
                  {profile.first_name} {profile.last_name}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(250,250,246,0.5)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.email}
                </div>
              </div>
            </div>

            {/* Sign out */}
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="hidden md:block transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              style={{
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: sans,
                color: 'rgba(250,250,246,0.85)',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>

            {/* Hamburger */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              className="grid md:hidden transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'transparent',
                cursor: 'pointer',
                color: cream,
                placeItems: 'center',
              }}
            >
              <HamburgerIcon open={menuOpen} />
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div
            className="md:hidden"
            style={{
              borderTop: '1px solid rgba(255,255,255,0.1)',
              padding: '10px 16px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={closeMenu}
                style={({ isActive }) => mobileNavLinkStyle(isActive)}
              >
                {label}
              </NavLink>
            ))}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '8px 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px' }}>
              <div style={{ fontSize: 13, color: 'rgba(250,250,246,0.6)' }}>
                {profile.first_name} {profile.last_name} · {profile.email}
              </div>
            </div>
            <button
              onClick={() => { closeMenu(); setShowLogoutConfirm(true) }}
              style={{
                margin: '0 0',
                padding: '11px 16px',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: sans,
                color: 'rgba(250,250,246,0.85)',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 10,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      {/* Sign Out Confirmation Modal */}
      {showLogoutConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(14,23,51,0.55)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 24
        }}>
          <div style={{
            width: '100%',
            maxWidth: 400,
            background: '#FFFFFF',
            borderRadius: 20,
            boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)',
            padding: '30px 28px',
            textAlign: 'center'
          }}>
            <h3 style={{
              fontFamily: "'DM Serif Display', Georgia, serif",
              fontSize: 22,
              color: '#0A1733',
              margin: '0 0 12px 0'
            }}>
              Sign Out Confirmation
            </h3>
            <p style={{
              fontFamily: sans,
              fontSize: 14,
              color: '#6A7A95',
              lineHeight: 1.5,
              margin: '0 0 24px 0'
            }}>
              Are you sure you want to sign out of your ActivKlass account?
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: sans,
                  color: '#3A4A6B',
                  background: '#FFFFFF',
                  border: '1.5px solid rgba(14,42,92,0.14)',
                  borderRadius: 12,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false)
                  logout()
                }}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: sans,
                  color: '#FAFAF6',
                  background: '#C0392B',
                  border: 'none',
                  borderRadius: 12,
                  cursor: 'pointer',
                  boxShadow: '0 3px 0 #922B21'
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-9" style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  )
}
