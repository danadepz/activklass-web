import { useEffect, useRef, useState } from 'react'
import SignOutButton from '@/components/SignOutButton'
import { navy, gold, cream, ink, faint, red, line, sansFamily as sans, mono } from '@/theme'

/**
 * The admin header's account control (2026-11-17, owner request).
 *
 * Replaces a lone outlined "Sign Out" button that sat by itself on the navy
 * header. Standard pattern: the signed-in person (initials, name, role) is the
 * trigger, and Sign Out lives in its menu with the account's other action.
 * Sign Out still goes through SignOutButton, so the "are you sure?" dialog is
 * unchanged.
 *
 * Closes on Escape and on a click outside -- but not on a click inside a
 * dialog: SignOutButton's confirmation is portalled to <body>, outside this
 * menu, and closing the menu there would unmount the dialog mid-question.
 */
const itemStyle = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 36,
  padding: '0 10px', boxSizing: 'border-box', border: 'none', borderRadius: 6,
  background: 'transparent', fontFamily: sans, fontSize: 14, fontWeight: 500,
  color: ink, textAlign: 'left', cursor: 'pointer',
}
const itemClass = 'transition hover:bg-[#F2F4F7] focus-visible:outline-none focus-visible:bg-[#F2F4F7]'

const Icon = ({ children }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    {children}
  </svg>
)

export function initialsOf(profile) {
  const s = `${profile?.first_name?.[0] ?? ''}${profile?.last_name?.[0] ?? ''}`.toUpperCase()
  return s || 'A'
}

export default function AccountMenu({ profile, roleLabel = 'School Admin', onChangePassword }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
  const login = profile?.login_id ?? profile?.email ?? ''

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (e.target.closest?.('[role="dialog"]')) return
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        onClick={() => setOpen((o) => !o)}
        className="transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FAFAF6]"
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 4px 4px',
          background: open ? 'rgba(255,255,255,0.10)' : 'transparent', border: 'none',
          borderRadius: 8, color: cream, cursor: 'pointer', fontFamily: sans,
        }}
      >
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
        <Icon><path d="m6 9 6 6 6-6" /></Icon>
      </button>

      {open && (
        <div role="menu" aria-label="Account" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 248, zIndex: 50,
          background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 8,
          boxShadow: '0 8px 24px rgba(16,24,40,0.16)', padding: 4,
        }}>
          <div style={{ padding: '8px 10px 10px', borderBottom: `1px solid ${line}`, marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: ink }}>{name}</div>
            {login && (
              <div style={{ ...mono, fontSize: 12, color: faint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {login}
              </div>
            )}
          </div>

          {onChangePassword && (
            <button type="button" role="menuitem" className={itemClass} style={itemStyle}
                    onClick={() => { setOpen(false); onChangePassword() }}>
              <Icon><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>
              Change Password
            </button>
          )}

          <div role="separator" style={{ height: 1, background: line, margin: '4px 0' }} />

          <SignOutButton className={itemClass} style={{ ...itemStyle, color: red }}>
            <Icon><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Icon>
            Sign Out
          </SignOutButton>
        </div>
      )}
    </div>
  )
}
