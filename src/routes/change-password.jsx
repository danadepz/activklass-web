import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import ChangePassword from '@/components/ChangePassword'
import AuthLayout from '@/components/AuthLayout'
import { useAuth } from '@/context/useAuth'
import { ink, muted, navy, gold, cream, line, sansFamily as sans } from '@/theme'

/**
 * The screen behind the temporary-password gate in components/ProtectedRoute.
 *
 * An account created by an admin -- from the console, from a CSV upload, or off
 * a class roster -- starts on a password that admin chose, and the backend
 * stamps `is_temp_password: true` on the profile (backend api/admin.py and
 * api/classes.py). Until it is replaced, several people may know the password
 * to somebody else's gradebook, so this is the one screen those accounts can
 * reach: the gate sends every other route here.
 *
 * Two things this deliberately does NOT do:
 *
 * - It does not treat itself as security. The gate is client-side routing, and
 *   firestore.rules -- the only thing actually enforced -- does not know or care
 *   whether a password is temporary. The point is that a shared password stops
 *   being shared before work starts, not that the account is sealed until it is.
 * - It does not trap anyone. Sign out stays reachable, because signing in as
 *   the wrong account is exactly the situation where a screen with one exit is
 *   worst.
 */
export default function ForcedChangePassword() {
  const { profile, logout } = useAuth()

  /* Captured on mount, not read live: once the form succeeds the flag flips to
     false, and without this the "you must change it" case and the "you just
     changed it" case would be indistinguishable. It also means someone who
     types this URL with a password of their own is sent away rather than shown
     a confirmation for something they never did -- their profile page carries
     the same form for a voluntary change. */
  const [arrivedOnTempPassword] = useState(() => profile?.is_temp_password === true)

  if (!arrivedOnTempPassword) return <Navigate to="/portal" replace />

  const done = profile?.is_temp_password === false

  return (
    <AuthLayout
      title={done ? 'Password set' : 'Choose your own password'}
      subtitle={
        done
          ? 'That is the only thing we needed before you start.'
          : 'Your account was set up for you, so the password on it is not yours yet. Pick one only you know to continue.'
      }
    >
      {done ? (
        <div style={{
          background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22,
        }}>
          <p style={{ fontSize: 14, color: ink, margin: '0 0 6px', fontWeight: 600 }}>
            Your password has been changed.
          </p>
          <p style={{ fontSize: 13, color: muted, margin: '0 0 18px' }}>
            Use it the next time you sign in. You stay signed in on this device.
          </p>
          <Link
            to="/portal"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px',
              fontSize: 14, fontWeight: 700, fontFamily: sans, color: cream, background: navy,
              borderRadius: 11, textDecoration: 'none', boxShadow: '0 3px 0 #061840',
            }}
          >
            Continue
            <span style={{
              display: 'inline-grid', placeItems: 'center', width: 20, height: 20,
              borderRadius: '50%', background: gold, color: navy, fontSize: 12, fontWeight: 700,
            }}>
              &rsaquo;
            </span>
          </Link>
        </div>
      ) : (
        <>
          <div role="note" style={{
            fontSize: 13, color: ink, background: 'rgba(245,197,24,0.12)',
            border: '1px solid rgba(245,197,24,0.45)', borderRadius: 12,
            padding: '11px 14px', marginBottom: 16,
          }}>
            Anyone who set up your account knows the password you just signed in
            with. Changing it here is what makes it yours.
          </div>

          {/* The same form the profile pages use -- one set of rules, one set of
              messages, whether the change is required or voluntary. */}
          <ChangePassword compact />

          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: muted }}>
            Signed in as{' '}
            <span style={{ color: ink, fontWeight: 600 }}>{profile?.email ?? 'this account'}</span>.{' '}
            <button
              type="button"
              onClick={logout}
              style={{
                border: 'none', background: 'none', padding: 0, fontSize: 13, fontWeight: 700,
                fontFamily: sans, color: navy, cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Not you? Sign out
            </button>
          </div>
        </>
      )}
    </AuthLayout>
  )
}
