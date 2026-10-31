import { useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { api } from '@/lib/api'
import { useAuth } from '@/context/useAuth'
import { MIN_PASSWORD, PASSWORD_RULE, passwordError } from '@/lib/validation'
import { navyDeep, ink, muted, green, red, line, serif, sansFamily as sans, navy } from '@/theme'

/**
 * "Change password" for whoever is signed in. Used by the teacher, student and
 * admin pages -- the module list gives Update Password to every role, and one
 * component keeps the wording and validation identical everywhere.
 *
 * Firebase requires a recent sign-in before a password change. Rather than
 * letting the user submit and then bouncing them out on
 * `auth/requires-recent-login`, the current password is collected up front and
 * used to reauthenticate -- which doubles as the confirmation step you want
 * before changing a credential.
 *
 * Note this changes the password but does not revoke other sessions; Firebase
 * keeps existing tokens valid. An admin disabling an account is what forces
 * everyone out.
 *
 * "Still on the password staff issued" is tracked in two places, and only one
 * of them is authority:
 *
 *   - `must_change_password`, a Firebase custom claim, is the real gate. It is
 *     set by every provisioning path (Admin SDK only) and enforced by the
 *     backend on EVERY authenticated request
 *     (checked in `app/middleware/auth.py:verify_bearer`, the one helper all
 *     eight backend guards funnel through), which refuses all but a short
 *     allowlist with `password_change_required`. A client cannot write it.
 *   - `is_temp_password` on the profile is a mirror, for the route guards
 *     (mobile `app/login.tsx`, web `components/ProtectedRoute`). It is now
 *     written only by the server.
 *
 * So this screen no longer clears anything itself: it reauthenticates, posts
 * the new password to `/api/auth/initial-password`, and refreshes the ID token
 * so the lifted claim is in hand. The password is never written to Firestore --
 * Firebase Auth holds it hashed, and a profile document is readable by staff.
 */
export default function ChangePassword({ compact = false }) {
  const { markPasswordChanged } = useAuth()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const card = {
    background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16,
    padding: compact ? 18 : 22,
  }
  const field = {
    width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: sans, color: ink,
    background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10,
    marginTop: 6,
  }
  const button = {
    padding: '10px 18px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6',
    background: navy, border: 'none', borderRadius: 10, cursor: 'pointer',
    boxShadow: `0 3px 0 ${navyDeep}`,
  }

  async function submit(e) {
    e.preventDefault()
    setMsg(''); setErr('')
    const weak = passwordError(form.next)
    if (weak) { setErr(`New ${weak.charAt(0).toLowerCase()}${weak.slice(1)}`); return }
    if (form.next !== form.confirm) { setErr('The two new passwords do not match.'); return }
    if (!form.current) { setErr('Enter your current password.'); return }

    setBusy(true)
    try {
      const user = auth.currentUser
      /* Still reauthenticate, and still with the CURRENT password: it proves
         the person at the keyboard owns this session rather than having walked
         up to it, and on the first-login path it is the one moment we can tell
         the intended holder from someone who merely knows the shared starting
         password. Firebase does this check, so it stays client-side. */
      await reauthenticateWithCredential(
        user, EmailAuthProvider.credential(user.email, form.current),
      )
      /* The change itself moved to the server. This used to call the Firebase
         client SDK's own password-update function here, then write the
         first-login mirror flag straight into Firestore -- which meant the
         server never learned whether a password had actually changed, and
         firestore.rules let a student write that flag directly, so the gate
         could be cleared without changing anything. The endpoint below
         performs the update through the Admin SDK and only then clears the
         `must_change_password` claim, so the state that gates every API
         request is something the server observed rather than something a
         client asserted. The server writes the mirror too, so this screen no
         longer touches Firestore at all. */
      await api('/api/auth/initial-password', {
        method: 'POST',
        body: { new_password: form.next, confirm_password: form.confirm },
      })
      /* The claim rides inside the ID token, so the token in memory still says
         "restricted" until it is refreshed. Without this the next request
         would 403 with password_change_required even though the change
         succeeded. */
      await user.getIdToken(true)
      markPasswordChanged()
      setForm({ current: '', next: '', confirm: '' })
      setMsg('Password changed. You stay signed in on this device.')
    } catch (e2) {
      setErr(
        e2.code === 'auth/wrong-password' || e2.code === 'auth/invalid-credential'
          ? 'That current password is not right.'
          : e2.code === 'auth/weak-password'
            ? 'That password is too easy to guess. Try a longer one, or mix in numbers.'
            : e2.code === 'auth/too-many-requests'
              ? 'Too many attempts. Wait a few minutes and try again.'
              : e2.message,
      )
    } finally {
      setBusy(false)
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <form onSubmit={submit} style={card}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ ...serif, fontSize: compact ? 18 : 20, color: ink, margin: 0 }}>
          Change Password
        </h2>
        <p style={{ fontSize: 13, color: muted, margin: '3px 0 0' }}>
          Your current password is required to confirm it is you. {PASSWORD_RULE}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          Current Password
          <input style={field} type="password" autoComplete="current-password"
                 value={form.current} onChange={set('current')} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          New Password
          <input style={field} type="password" autoComplete="new-password"
                 value={form.next} onChange={set('next')}
                 placeholder={`at least ${MIN_PASSWORD} characters`} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          Confirm New Password
          <input style={field} type="password" autoComplete="new-password"
                 value={form.confirm} onChange={set('confirm')} />
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <button type="submit" style={button} disabled={busy}>
          {busy ? 'Changing…' : 'Change Password'}
        </button>
      </div>

      {(err || msg) && (
        <div role="alert" style={{
          fontSize: 13, borderRadius: 10, padding: '10px 12px', marginTop: 12,
          color: err ? red : green,
          background: err ? 'rgba(192,57,43,0.07)' : 'rgba(31,138,91,0.08)',
          border: `1px solid ${err ? 'rgba(192,57,43,0.3)' : 'rgba(31,138,91,0.3)'}`,
        }}>
          {err || msg}
        </div>
      )}
    </form>
  )
}
