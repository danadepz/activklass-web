import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { INTERNAL_LOGIN_SUFFIX } from '@/lib/logins'
import { passwordError, PASSWORD_RULE } from '@/lib/validation'
import { SubmitButton, EyeToggle, AuthError, BrandMark } from '@/components/AuthLayout'
import { authInputStyle, authLabelStyle } from '@/components/authStyles'
import { Check } from '@/components/icons'
import { navy, ink, gold, muted, cream, sansFamily as sans } from '@/theme'

/**
 * The page a password-reset LINK opens — deliberately not AuthLayout's
 * two-panel shell. Whoever lands here came from their inbox mid-task, so it
 * is one centered card with exactly one job: new password, confirm, done.
 *
 * The link carries Firebase's one-time oobCode (?oobCode=...). For real-email
 * accounts that is the code Firebase's own reset email ships; for issued
 * logins the backend generates the same kind of link with the Admin SDK and
 * mails it to the verified personal email — either way this page just
 * verifies the code and applies the new password, so it works identically
 * for both. verifyPasswordResetCode also tells us WHOSE password this is;
 * internal auth emails are shown as the login id people actually know
 * (snhs-789012), never the @activklass.internal form.
 */

/* The card's four states, in the order a visitor meets them. */
const CHECKING = 'checking'
const READY = 'ready'
const INVALID = 'invalid'
const DONE = 'done'

/**
 * Whose password this is, masked. The link holder is almost always the
 * account owner, but a forwarded link or a shoulder-surfer should not be
 * handed the full address — just enough to recognise their own account:
 *   abi.namocatcat@testmail.activklass.ph -> ab•••@t•••.ph
 *   snhs-789012@activklass.internal       -> snhs-•••012
 */
function displayLogin(email) {
  if (email.endsWith(INTERNAL_LOGIN_SUFFIX)) {
    const id = email.slice(0, -INTERNAL_LOGIN_SUFFIX.length) // e.g. snhs-789012
    const dash = id.lastIndexOf('-')
    const digits = id.slice(dash + 1)
    return `${id.slice(0, dash + 1)}•••${digits.slice(-3)}`
  }
  const at = email.indexOf('@')
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const tld = domain.slice(domain.lastIndexOf('.'))
  return `${local.slice(0, 2)}•••@${domain.slice(0, 1)}•••${tld}`
}

export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const oobCode = params.get('oobCode') ?? ''

  const [state, setState] = useState(oobCode ? CHECKING : INVALID)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!oobCode) return
    let cancelled = false
    verifyPasswordResetCode(auth, oobCode)
      .then((email) => {
        if (cancelled) return
        setLogin(displayLogin(email))
        setState(READY)
      })
      .catch(() => {
        // expired-action-code / invalid-action-code / user-not-found all mean
        // the same thing to the visitor: this link no longer works.
        if (!cancelled) setState(INVALID)
      })
    return () => { cancelled = true }
  }, [oobCode])

  // After a successful reset, walk them back to sign in on their own click
  // or after a short pause — whichever comes first.
  useEffect(() => {
    if (state !== DONE) return
    const t = setTimeout(() => navigate('/login'), 4000)
    return () => clearTimeout(t)
  }, [state, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const problem =
      passwordError(password) ||
      (password === confirm ? '' : 'The two passwords do not match.')
    if (problem) { setError(problem); return }
    setSubmitting(true)
    try {
      await confirmPasswordReset(auth, oobCode, password)
      setState(DONE)
    } catch (err) {
      if (err.code === 'auth/expired-action-code' || err.code === 'auth/invalid-action-code') {
        setState(INVALID)
      } else {
        setError('Could not update the password. Check your connection and try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: cream,
        fontFamily: sans,
        color: ink,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#FFFFFF',
          border: '1px solid rgba(14,42,92,0.12)',
          borderRadius: 18,
          boxShadow: '0 18px 44px -22px rgba(14,42,92,0.35)',
          padding: '34px 30px',
        }}
      >
        <div className="flex items-center justify-center" style={{ gap: 10, marginBottom: 22 }}>
          <BrandMark size={30} />
          <span style={{ fontSize: 18, fontWeight: 800, color: navy }}>ActivKlass</span>
        </div>

        {state === CHECKING && (
          <p style={{ textAlign: 'center', color: muted, fontSize: 14, margin: '18px 0' }}>
            Checking your reset link…
          </p>
        )}

        {state === INVALID && (
          <div className="flex flex-col gap-4" style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 21, fontWeight: 800, color: navy, margin: 0, fontFamily: sans }}>
              This link no longer works
            </h1>
            <p style={{ fontSize: 14, color: muted, margin: 0, lineHeight: 1.6 }}>
              Reset links can only be used once and expire after a while.
              Request a new one and try again.
            </p>
            <Link
              to="/forgot-password"
              className="transition hover:opacity-70"
              style={{ fontWeight: 700, color: navy, fontSize: 14 }}
            >
              Request a new link
            </Link>
          </div>
        )}

        {state === READY && (
          <>
            <h1 style={{ fontSize: 21, fontWeight: 800, color: navy, margin: '0 0 6px', textAlign: 'center', fontFamily: sans }}>
              Set a new password
            </h1>
            <p style={{ fontSize: 13.5, color: muted, margin: '0 0 20px', textAlign: 'center' }}>
              for <strong style={{ color: ink }}>{login}</strong>
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
              {error && <AuthError>{error}</AuthError>}

              <div>
                <label htmlFor="reset-password" style={authLabelStyle}>New password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-password"
                    className="ak-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ ...authInputStyle, paddingRight: 46 }}
                  />
                  <EyeToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
                </div>
                <p style={{ fontSize: 12, color: '#9AA6BD', margin: '8px 0 0', lineHeight: 1.5 }}>
                  {PASSWORD_RULE}
                </p>
              </div>

              <div>
                <label htmlFor="reset-confirm" style={authLabelStyle}>Confirm new password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-confirm"
                    className="ak-input"
                    type={showConfirm ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="Re-enter new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    style={{ ...authInputStyle, paddingRight: 46 }}
                  />
                  <EyeToggle shown={showConfirm} onToggle={() => setShowConfirm((s) => !s)} />
                </div>
              </div>

              <SubmitButton type="submit" disabled={submitting} aria-busy={submitting}>
                {submitting ? 'Updating…' : 'Update password'}
              </SubmitButton>
            </form>
          </>
        )}

        {state === DONE && (
          <div className="flex flex-col items-center gap-4" style={{ textAlign: 'center' }}>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: navy,
                color: gold,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Check className="h-5 w-5" />
            </span>
            <h1 style={{ fontSize: 21, fontWeight: 800, color: navy, margin: 0, fontFamily: sans }}>
              Password updated
            </h1>
            <p style={{ fontSize: 14, color: muted, margin: 0, lineHeight: 1.6 }}>
              Taking you back to sign in…
            </p>
            <Link
              to="/login"
              className="transition hover:opacity-70"
              style={{ fontWeight: 700, color: navy, fontSize: 14 }}
            >
              Sign in now
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
