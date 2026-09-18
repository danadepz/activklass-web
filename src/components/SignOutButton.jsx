import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@/context/useAuth'
import { ink, muted, sansFamily, serifFamily, navy } from '@/theme'
import Button from '@/components/ui/Button'

/**
 * Sign-out trigger with a confirmation step.
 *
 * Signing out is one click away from losing unsaved work — a half-marked class
 * record, a quiz in progress — so every portal asks first. The student and
 * teacher shells already did this with their own copies of the dialog; this is
 * the same dialog, extracted, for the shells that signed out instantly.
 *
 * The trigger inherits whatever styling the caller passes, because the portals
 * disagree about it (ghost on navy in admin, a plain link elsewhere) — only the
 * confirmation is shared.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md).
 */
export default function SignOutButton({ children = 'Sign out', className, style }) {
  const { logout } = useAuth()
  const [asking, setAsking] = useState(false)

  // Escape closes it: a confirmation you cannot dismiss by reflex is a trap.
  useEffect(() => {
    if (!asking) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setAsking(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [asking])

  return (
    <>
      <button type="button" onClick={() => setAsking(true)} className={className} style={style}>
        {children}
      </button>

      {asking && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-title"
          onClick={(e) => { if (e.target === e.currentTarget) setAsking(false) }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(14,23,51,0.55)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 400,
              background: '#FFFFFF',
              borderRadius: 20,
              boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)',
              padding: '30px 28px',
              textAlign: 'center',
            }}
          >
            <h3 id="signout-title" style={{ fontFamily: serifFamily, fontSize: 22, color: ink, margin: '0 0 12px' }}>
              Sign Out Confirmation
            </h3>
            <p style={{ fontFamily: sansFamily, fontSize: 14, color: muted, lineHeight: 1.5, margin: '0 0 24px' }}>
              Are you sure you want to sign out of your ActivKlass account?
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Button type="button" variant="quiet" radius={12} onClick={() => setAsking(false)} style={{ flex: 1 }}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="dangerSolid"
                radius={12}
                autoFocus
                onClick={() => { setAsking(false); logout() }}
                style={{ flex: 1 }}
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
