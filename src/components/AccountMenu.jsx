import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { initialsOf } from '@/lib/avatar'
import SignOutButton from '@/components/SignOutButton'
import { navy, gold, cream, ink, faint, red, line, sansFamily as sans, mono } from '@/theme'

/**
 * Shared header account menu. A custom trigger keeps each portal's avatar
 * and account display, while the menu provides Profile and Sign Out.
 *
 * Closes on Escape and on a click outside -- but not on a click inside a
 * dialog: SignOutButton's confirmation is portalled to <body>, outside this
 * menu, and closing the menu there would unmount the dialog mid-question.
 */
const itemStyle = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 36,
  padding: '7px 10px', boxSizing: 'border-box', border: 'none', borderRadius: 7,
  fontFamily: sans, fontSize: 13, fontWeight: 600, lineHeight: 1.5,
  color: navy, textAlign: 'left', cursor: 'pointer',
}
const itemClass = 'bg-transparent transition-colors hover:bg-slate-100 focus:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0E2A5C]/30'
const signOutClass = 'bg-transparent transition-colors hover:bg-red-50 focus:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-700/25'

const Icon = ({ children }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    {children}
  </svg>
)

export default function AccountMenu({
  profile, roleLabel = 'School Admin', onChangePassword, profileTo,
  children, className, style,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const focusLast = useRef(false)
  const menuId = useId()
  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
  const login = profile?.login_id ?? profile?.email ?? ''

  useEffect(() => {
    if (!open) return undefined
    const items = menuRef.current?.querySelectorAll('[role="menuitem"]')
    const target = focusLast.current ? items?.[items.length - 1] : items?.[0]
    target?.focus()
    const onDown = (e) => {
      if (e.target.closest?.('[role="dialog"]')) return
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.target.closest?.('[role="dialog"]')) return
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function openWithKeyboard(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    focusLast.current = event.key === 'ArrowUp'
    setOpen(true)
  }

  function navigateMenu(event) {
    if (event.target.closest?.('[role="dialog"]')) return
    if (event.key === 'Tab') {
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(menuRef.current.querySelectorAll('[role="menuitem"]'))
    const current = items.indexOf(document.activeElement)
    let next = 0
    if (event.key === 'End') next = items.length - 1
    if (event.key === 'ArrowDown') next = (current + 1) % items.length
    if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account menu for ${name}`}
        onClick={() => { focusLast.current = false; setOpen((o) => !o) }}
        onKeyDown={openWithKeyboard}
        className={className ?? 'transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FAFAF6]'}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 4px 4px',
          background: open ? 'rgba(255,255,255,0.10)' : 'transparent', border: 'none',
          borderRadius: 8, color: cream, cursor: 'pointer', fontFamily: sans,
          ...style,
        }}
      >
        {children ?? (
          <>
            <span aria-hidden="true" style={{
              width: 32, height: 32, borderRadius: '50%', background: gold, color: navy,
              fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              {initialsOf(profile)}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.25, textAlign: 'left' }}>
              <span style={{ fontSize: 13, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              <span style={{ fontSize: 12, opacity: 0.75 }}>{roleLabel}</span>
            </span>
          </>
        )}
        <span aria-hidden="true" style={{
          display: 'flex', opacity: 0.8, transform: open ? 'rotate(180deg)' : undefined,
          transition: 'transform 150ms ease',
        }}>
          <Icon><path d="m7 10 5 5 5-5" /></Icon>
        </span>
      </button>

      {open && (
        <div ref={menuRef} id={menuId} role="menu" aria-label="Account" onKeyDown={navigateMenu} style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 224, maxWidth: 'calc(100vw - 32px)', zIndex: 50,
          background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 10,
          boxShadow: '0 12px 28px -8px rgba(10,23,51,0.18), 0 2px 6px rgba(10,23,51,0.05)',
          padding: 6, fontFamily: sans,
        }}>
          <div role="presentation" style={{ padding: '6px 10px 9px', borderBottom: `1px solid ${line}`, marginBottom: 4 }}>
            <div style={{ fontSize: 13, lineHeight: 1.4, fontWeight: 700, color: ink, overflowWrap: 'anywhere' }}>{name}</div>
            {login && (
              <div title={login} style={{ ...mono, fontSize: 11.5, lineHeight: 1.5, color: faint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {login}
              </div>
            )}
          </div>

          {profileTo && (
            <Link to={profileTo} role="menuitem" className={itemClass}
                  style={{ ...itemStyle, textDecoration: 'none' }} onClick={() => setOpen(false)}>
              <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></Icon>
              Profile
            </Link>
          )}

          {onChangePassword && (
            <button type="button" role="menuitem" className={itemClass} style={itemStyle}
                    onClick={() => { setOpen(false); onChangePassword() }}>
              <Icon><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>
              Change Password
            </button>
          )}

          {profileTo && !onChangePassword && (
            <Link to={`${profileTo}#change-password`} role="menuitem" className={itemClass}
                  style={{ ...itemStyle, textDecoration: 'none' }} onClick={() => setOpen(false)}>
              <Icon><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>
              Change Password
            </Link>
          )}

          {(profileTo || onChangePassword) && (
            <div role="separator" style={{ height: 1, background: line, margin: '4px' }} />
          )}

          <SignOutButton role="menuitem" className={signOutClass} style={{ ...itemStyle, color: red }}>
            <Icon><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Icon>
            Sign Out
          </SignOutButton>
        </div>
      )}
    </div>
  )
}
