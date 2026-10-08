import { useState } from 'react'
// TEMPORARY dev helper — remove this import and the <DevQuickLogin /> below
// when the seeded test accounts are no longer needed.
import DevQuickLogin from '@/components/DevQuickLogin'
import { Link, useNavigate } from 'react-router-dom'
import {
  signInWithEmailAndPassword,
  setPersistence,
  updatePassword,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { toAuthEmail, wrongCredentialMessage } from '@/lib/logins'
import { passwordError, PASSWORD_RULE } from '@/lib/validation'
import { useAuth } from '@/context/useAuth'
import AuthLayout, {
  SubmitButton,
  EyeToggle,
  AuthError,
  AuthNotice,
} from '@/components/AuthLayout'
import { authInputStyle, authLabelStyle } from '@/components/authStyles'
import { navy, ink } from '@/theme'

const FRIENDLY_ERRORS = {
  'auth/user-not-found': 'No account found with that email or login ID.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/invalid-email': 'That email or login ID is not valid.',
  // Deactivate (admin Users tab, solo teacher's Student accounts) disables the
  // Firebase user; unmapped, the student only saw the generic line below.
  'auth/user-disabled': 'This account has been deactivated. Ask your teacher or school to reactivate it.',
}

/* "Incorrect login or password." is true and useless: it never says WHICH
   credential this account signs in with, and the two kinds of account here
   have different ones. Both reported lock-outs were exactly that, from
   opposite sides. The wording lives in lib/logins.js beside toAuthEmail —
   the same module decides what an identifier IS, and it is reachable from
   logins.test.js, which a message defined in this route file was not. */
const WRONG_CREDENTIAL = new Set(['auth/invalid-credential', 'auth/wrong-password'])

function signInError(code, identifier) {
  if (WRONG_CREDENTIAL.has(code)) return wrongCredentialMessage(identifier)
  return FRIENDLY_ERRORS[code] ?? 'Sign in failed. Please try again.'
}

/* The page's two stages. An account still on its staff-issued password
   (is_temp_password on the profile) does not leave the login page to replace
   it: the form expands in place — new password + confirm appear below the
   sign-in inputs — and the next submit walks straight to the dashboard.
   Owner's call (2026-08-27): inline here, not a separate screen; the
   /change-password route stays only as the portal gate's fallback for
   sessions that signed in some other way. */
const SIGN_IN = 'sign_in'
const NEW_PASSWORD = 'new_password'

export default function Login() {
  const navigate = useNavigate()
  const { markPasswordChanged } = useAuth()
  const [stage, setStage] = useState(SIGN_IN)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const settingPassword = stage === NEW_PASSWORD

  async function handleSignIn() {
    // "Keep me signed in" → persist across browser restarts; otherwise the
    // session is cleared when the tab/browser closes.
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
    // Issued logins (snhs-789012) get the internal suffix appended here —
    // people type only the prefix-and-digits form the school gave them.
    await signInWithEmailAndPassword(auth, toAuthEmail(email), password)

    /* Still on the password staff issued? Expand instead of navigating. Read
       the flag directly rather than waiting on the auth context — the context
       loads the profile on its own schedule, and this decision is needed now.
       If the read fails, proceed to the portal: its gate re-checks the flag
       and falls back to /change-password, so nothing is lost but the nicety. */
    let onTempPassword = false
    try {
      const snap = await getDoc(doc(db, 'users', auth.currentUser.uid))
      onTempPassword = snap.data()?.is_temp_password === true
    } catch { /* gate handles it */ }

    if (onTempPassword) {
      setStage(NEW_PASSWORD)
      setNotice(
        'Your account was set up for you, so the password you just used is not yours yet. ' +
          'Choose a new one to continue to your dashboard.',
      )
      return
    }
    navigate('/portal')
  }

  async function handleSetPassword() {
    const problem =
      passwordError(newPassword) ||
      (newPassword === confirmPassword ? '' : 'The two passwords do not match.') ||
      (newPassword === password
        ? 'Your new password must be different from the one you were given.'
        : '')
    if (problem) throw Object.assign(new Error(problem), { friendly: true })

    // No reauthentication needed: they signed in seconds ago, which satisfies
    // Firebase's recent-login requirement for updatePassword.
    await updatePassword(auth.currentUser, newPassword)
    /* Best effort, and deliberately after the fact — same reasoning as
       components/ChangePassword: the password HAS changed by now, so a failed
       flag write must not read as a failed change. firestore.rules allows this
       self-write for every role (students are limited to exactly these
       credential fields plus photo_url). */
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        is_temp_password: false,
        password_changed_at: serverTimestamp(),
      })
    } catch (flagErr) {
      console.warn('[Login] password state not recorded:', flagErr)
    }
    // Lift the client-side gate for this session whether or not the write
    // landed, then straight to the role dashboard — no confirmation screen.
    markPasswordChanged()
    navigate('/portal')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!settingPassword) setNotice(null)
    setSubmitting(true)
    try {
      if (settingPassword) await handleSetPassword()
      else await handleSignIn()
    } catch (err) {
      if (err.friendly) setError(err.message)
      else if (settingPassword) {
        setError(
          err.code === 'auth/weak-password'
            ? 'That password is too easy to guess. Try a longer one, or mix in numbers.'
            : err.code === 'auth/requires-recent-login'
              ? 'Your sign-in expired. Reload the page and sign in again to set your password.'
              : 'Could not set the new password. Check your connection and try again.',
        )
      } else {
        setError(signInError(err.code, email.trim()))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Welcome!" subtitle="Sign in to your ActivKlass account.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {!settingPassword && (
          <DevQuickLogin
            disabled={submitting}
            onPick={(a) => { setEmail(a.email); setPassword(a.password); setError(null); setNotice(null) }}
          />
        )}

        {error && <AuthError>{error}</AuthError>}
        {notice && <AuthNotice>{notice}</AuthNotice>}

        <div>
          <label htmlFor="login-email" style={authLabelStyle}>Email/Login ID</label>
          <input
            id="login-email"
            className="ak-input"
            type="text"
            required
            disabled={settingPassword}
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...authInputStyle, opacity: settingPassword ? 0.6 : 1 }}
          />
        </div>

        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <label htmlFor="login-password" style={{ fontSize: 13, fontWeight: 600, color: ink }}>
              Password
            </label>
            {!settingPassword && (
              <Link
                to="/forgot-password"
                className="transition hover:opacity-70"
                style={{ fontSize: 12, fontWeight: 600, color: navy, textDecoration: 'none' }}
              >
                Forgot your password?
              </Link>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <input
              id="login-password"
              className="ak-input"
              type={showPassword ? 'text' : 'password'}
              required
              disabled={settingPassword}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...authInputStyle, paddingRight: 46, opacity: settingPassword ? 0.6 : 1 }}
            />
            {!settingPassword && (
              <EyeToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
            )}
          </div>
        </div>

        {settingPassword && (
          <>
            <div>
              <label htmlFor="login-new-password" style={authLabelStyle}>New password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-new-password"
                  className="ak-input"
                  type={showNew ? 'text' : 'password'}
                  required
                  autoFocus
                  autoComplete="new-password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ ...authInputStyle, paddingRight: 46 }}
                />
                <EyeToggle shown={showNew} onToggle={() => setShowNew((s) => !s)} />
              </div>
              <p style={{ fontSize: 12, color: '#9AA6BD', margin: '8px 0 0', lineHeight: 1.5 }}>
                {PASSWORD_RULE}
              </p>
            </div>

            <div>
              <label htmlFor="login-confirm-password" style={authLabelStyle}>Confirm new password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-confirm-password"
                  className="ak-input"
                  type={showConfirm ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{ ...authInputStyle, paddingRight: 46 }}
                />
                <EyeToggle shown={showConfirm} onToggle={() => setShowConfirm((s) => !s)} />
              </div>
            </div>
          </>
        )}

        {!settingPassword && (
          <label className="flex cursor-pointer items-center gap-2.5 select-none" style={{ marginTop: -4 }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: navy, cursor: 'pointer', margin: 0 }}
            />
            <span style={{ fontSize: 13, color: '#3A4A6B', fontWeight: 500 }}>Keep me signed in on this device</span>
          </label>
        )}

        <SubmitButton type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting
            ? settingPassword ? 'Setting password…' : 'Signing in…'
            : settingPassword ? 'Set password and continue' : 'Sign in'}
        </SubmitButton>

        {/* T-114: registration used to be explained in two lines here — one
            naming the teacher path, one routing a parent to the mobile app
            instead, because a parent's account is made there (with the link
            code from their child's Profile), never on the web. That second
            line is now redundant: /register itself offers a Parent card
            (step 1) that leads straight to the install QR, so this link no
            longer needs to cover for a sign-up form with no parent path. */}
        {!settingPassword && (
          <div style={{ textAlign: 'center', marginTop: 4, fontSize: 14, color: '#6A7A95' }}>
            <Link to="/register" className="transition hover:opacity-70" style={{ fontWeight: 700, color: navy }}>
              Create an Account
            </Link>
          </div>
        )}
      </form>
    </AuthLayout>
  )
}
