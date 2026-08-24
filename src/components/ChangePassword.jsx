import { useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
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
 * `is_temp_password` on the profile means "still on the password staff issued"
 * -- pass1234 for a roster-provisioned account, whatever an admin typed for one
 * made in the console. The mobile app already gates on it (app/login.tsx sends
 * anyone carrying it to the change-password screen); this is where it stops
 * being true, so this is where it is cleared. The password itself is never
 * written to Firestore: Firebase Auth holds it hashed, and a profile document
 * is readable by staff.
 */
export default function ChangePassword({ compact = false }) {
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
      await reauthenticateWithCredential(
        user, EmailAuthProvider.credential(user.email, form.current),
      )
      await updatePassword(user, form.next)
      /* Best effort, and deliberately after the fact: the password HAS changed
         by now, so a failed flag write must not be reported as a failed change.
         A stale flag is a wrong badge in a console; telling someone their
         password did not change when it did is a lockout. */
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          is_temp_password: false,
          password_changed_at: serverTimestamp(),
        })
      } catch (flagErr) {
        console.warn('[ChangePassword] password state not recorded:', flagErr)
      }
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
      <h2 style={{ ...serif, fontSize: compact ? 18 : 20, color: ink, margin: '0 0 4px' }}>
        Change password
      </h2>
      <p style={{ fontSize: 13, color: muted, margin: '0 0 16px' }}>
        Your current password is required to confirm it is you. {PASSWORD_RULE}
      </p>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          Current password
          <input style={field} type="password" autoComplete="current-password"
                 value={form.current} onChange={set('current')} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          New password
          <input style={field} type="password" autoComplete="new-password"
                 value={form.next} onChange={set('next')}
                 placeholder={`at least ${MIN_PASSWORD} characters`} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          Confirm new password
          <input style={field} type="password" autoComplete="new-password"
                 value={form.confirm} onChange={set('confirm')} />
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <button type="submit" style={button} disabled={busy}>
          {busy ? 'Changing…' : 'Change password'}
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
