import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/useAuth'
import { Bell } from '@/components/icons'
import { BrandMark } from '@/components/AuthLayout'
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { navy, gold, cream, serifAlt as serif, sansFamily as sans } from '@/theme'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'

const NAV_ITEMS = [
  { to: '/teacher', label: 'Dashboard', end: true },
  { to: '/teacher/announcements', label: 'Announcement' },
  { to: '/teacher/classes', label: 'My Classes' },
  { to: '/teacher/syllabus', label: 'Syllabus' },
  { to: '/teacher/quizzes', label: 'Quizzes' },
  { to: '/teacher/grading', label: 'Grade Config' },
  { to: '/teacher/reports', label: 'Reports' },
  { to: '/teacher/account', label: 'Account' },
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

export default function TeacherLayout() {
  const { profile, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const notifRef = useRef(null)
  const initials = `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase()

  const { data: classes } = useTeacherClasses()

  const classIds = (classes ?? []).map((c) => c.id)
  const classById = Object.fromEntries((classes ?? []).map((c) => [c.id, c]))

  // Pending attendance disputes across all the teacher's classes — surfaced in
  // the notification bell so a contest doesn't sit unseen.
  const { data: pendingContests } = useQuery({
    queryKey: ['fs-pending-contests', profile?.id, classIds.join(',')],
    enabled: classIds.length > 0,
    queryFn: async () => {
      const out = []
      for (let i = 0; i < classIds.length; i += 30) {
        const chunk = classIds.slice(i, i + 30)
        const snap = await getDocs(
          query(collection(db, 'attendance_contests'), where('class_id', 'in', chunk)),
        )
        snap.forEach((d) => out.push({ id: d.id, ...d.data() }))
      }
      return out.filter((c) => c.status === 'pending')
    },
  })

  // Pending grade/score disputes across the teacher's classes.
  const { data: pendingGradeContests } = useQuery({
    queryKey: ['fs-pending-grade-contests', profile?.id, classIds.join(',')],
    enabled: classIds.length > 0,
    queryFn: async () => {
      const out = []
      for (let i = 0; i < classIds.length; i += 30) {
        const chunk = classIds.slice(i, i + 30)
        const snap = await getDocs(
          query(collection(db, 'grade_contests'), where('class_id', 'in', chunk)),
        )
        snap.forEach((d) => out.push({ id: d.id, ...d.data() }))
      }
      return out.filter((c) => c.status === 'pending')
    },
  })

  const emptyRosters = (classes ?? []).filter((c) => (c.student_ids?.length ?? 0) === 0)

  const contestNotifications = (pendingContests ?? []).map((c) => ({
    id: `contest-${c.id}`,
    icon: '📝',
    message: (
      <span>
        Attendance dispute — <strong>{c.student_name || 'A student'}</strong> contested {c.date}
        {classById[c.class_id]?.section ? ` in ${classById[c.class_id].section}` : ''}. Review it.
      </span>
    ),
    link: `/teacher/classes/${c.class_id}/attendance`,
  }))

  const gradeContestNotifications = (pendingGradeContests ?? []).map((c) => ({
    id: `grade-contest-${c.id}`,
    icon: '🧮',
    message: (
      <span>
        Score dispute — <strong>{c.student_name || 'A student'}</strong> contested “{c.assessment_title}”
        {classById[c.class_id]?.section ? ` in ${classById[c.class_id].section}` : ''}. Review it.
      </span>
    ),
    link: `/teacher/classes/${c.class_id}/record`,
  }))

  const rosterNotifications = emptyRosters.map((c) => ({
    id: `empty-roster-${c.id}`,
    icon: '⚠️',
    message: (
      <span>
        Needs your attention. <strong>{c.section}</strong> has no students yet — add a roster.
      </span>
    ),
    link: `/teacher/classes/${c.id}`,
  }))

  // Disputes first — they're the most time-sensitive.
  const notifications = [...contestNotifications, ...gradeContestNotifications, ...rosterNotifications]

  const closeMenu = () => setMenuOpen(false)

  // Close notification panel when clicking outside
  useEffect(() => {
    if (!notifOpen) return
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [notifOpen])

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
        {/* decorative rings — desktop only so they don't clip on mobile */}
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
            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <BrandMark size={32} onNavy />
              <div>
                <div style={{ ...serif, fontSize: 22, lineHeight: 1, letterSpacing: '-0.02em' }}>ActivKlass</div>
                <div className="hidden sm:block" style={{ fontSize: 10, color: 'rgba(250,250,246,0.5)', letterSpacing: '0.05em', marginTop: 1 }}>Teacher Portal</div>
              </div>
            </div>

            {/* Desktop nav links — hidden on mobile */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Notification bell + dropdown */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button
                aria-label="Notifications"
                aria-expanded={notifOpen}
                onClick={() => setNotifOpen((o) => !o)}
                className="transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: notifOpen
                    ? '1px solid rgba(245,197,24,0.5)'
                    : '1px solid rgba(255,255,255,0.14)',
                  background: notifOpen ? 'rgba(255,255,255,0.12)' : 'transparent',
                  cursor: 'pointer',
                  color: notifOpen ? gold : 'rgba(250,250,246,0.75)',
                  display: 'grid',
                  placeItems: 'center',
                  position: 'relative',
                }}
              >
                <Bell className="h-4 w-4" />
                {notifications.length > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#EF4444',
                    }}
                  />
                )}
              </button>

              {/* Dropdown panel */}
              {notifOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 10px)',
                    right: 0,
                    width: 320,
                    background: '#fff',
                    borderRadius: 12,
                    boxShadow: '0 8px 32px rgba(14,42,92,0.18), 0 2px 8px rgba(14,42,92,0.08)',
                    border: '1px solid rgba(14,42,92,0.1)',
                    zIndex: 200,
                    overflow: 'hidden',
                  }}
                >
                  {/* Panel header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px 12px',
                      borderBottom: '1px solid rgba(14,42,92,0.08)',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0A1733', fontFamily: sans }}>
                      Notifications ({notifications.length})
                    </span>
                    <button
                      onClick={() => setNotifOpen(false)}
                      aria-label="Close notifications"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        border: '1px solid rgba(14,42,92,0.12)',
                        background: 'transparent',
                        cursor: 'pointer',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#6A7A95',
                        fontSize: 16,
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* List */}
                  {notifications.length > 0 ? (
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                      {notifications.map((n) => (
                        <NavLink
                          key={n.id}
                          to={n.link}
                          onClick={() => setNotifOpen(false)}
                          style={{
                            display: 'flex',
                            alignItems: 'start',
                            gap: 10,
                            padding: '12px 16px',
                            borderBottom: '1px solid rgba(14,42,92,0.06)',
                            textDecoration: 'none',
                            color: '#0A1733',
                            transition: 'background-color 0.15s',
                          }}
                          className="hover:bg-slate-50"
                        >
                          <div style={{ fontSize: 16, marginTop: 1 }}>{n.icon ?? '⚠️'}</div>
                          <div style={{ fontSize: 12.5, lineHeight: 1.45, flex: 1 }}>
                            {n.message}
                          </div>
                        </NavLink>
                      ))}
                    </div>
                  ) : (
                    /* Empty state */
                    <div
                      style={{
                        padding: '36px 24px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 28, marginBottom: 10 }}>🔔</div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#0A1733', marginBottom: 4 }}>
                        No notifications yet
                      </p>
                      <p style={{ fontSize: 12, color: '#6A7A95', lineHeight: 1.5 }}>
                        You're all caught up! Alerts about your classes and students will appear here.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Avatar + name — name hidden on mobile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
              <div className="hidden md:block" style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: cream }}>
                  {profile.first_name} {profile.last_name}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(250,250,246,0.5)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.email}
                </div>
              </div>
            </div>

            {/* Sign out — desktop only */}
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

            {/* Hamburger — mobile only */}
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

      {/* MAIN CONTENT — responsive padding */}
      <main className="px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-9" style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  )
}
