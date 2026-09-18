import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import AuthLayout, { SubmitButton, AuthError, AuthNotice } from '@/components/AuthLayout'
import { authInputStyle, authLabelStyle } from '@/components/authStyles'
import { emailError } from '@/lib/validation'
import { navy } from '@/theme'

/**
 * Forgot-password page. Pilot feedback asked for the standard "Forgot your
 * password?" link that goes to its own page, instead of the old inline
 * "Forgot?" button that reused whatever was typed in the login email field.
 *
 * The link itself is ours, not Firebase's (T-79): Firebase's own hosted reset
 * page is broken on this project -- a fresh, never-opened code fails there on
 * the very first click, and Google refuses every attempt to point its console
 * at our own page instead. `POST /api/auth/forgot-password` generates the
 * same kind of code server-side and mails our own link straight at
 * reset-password.jsx, through the Gmail sender T-69 already built. This page
 * only collects the address. Note the success message does not confirm the
 * account exists -- the backend answers the same either way regardless of
 * what actually happened, so this page cannot be used to probe which emails
 * are registered.
 *
 * It can only ever help an account that signs in with an email. A school- or
 * teacher-issued login (`snhs-123456`, see lib/logins.js) is stored behind an
 * internal address with no inbox, so no link can reach it; the way back in
 * for those is the teacher's or admin's Reset password. A student on one of
 * those logins landed here with nowhere to type it and, had she typed the
 * personal email her teacher entered, would have read "a reset link is on its
 * way" for a link that never comes (T-47). So the page says so up front, says
 * it again instead of "enter a valid email" when what was typed has no `@`,
 * and the success screen no longer promises an inbox to an issued account.
 */

/** The one sentence that tells an issued login where its reset really is. */
export const ISSUED_LOGIN_NOTE =
  'Signed in with a login ID like snhs-123456? Those accounts have no inbox, so no ' +
  'link can be sent — ask your teacher or your school admin to reset your password.'

/**
 * What stops the submit, or '' to send. Text without an `@` is a login ID
 * (or nothing an account could be), and "enter a valid email address" is the
 * wrong answer to that: the person has no email to enter. Say where their
 * reset actually is instead. Anything with an `@` is judged by the shared
 * email rule as before.
 */
export function forgotPasswordProblem(value) {
  const text = String(value ?? '').trim()
  if (text && !text.includes('@')) return ISSUED_LOGIN_NOTE
  return emailError(text)
}

/**
 * The success screen. "If an account *signs in with* that email" is true for
 * everyone -- an issued login signs in with its ID, so a personal email the
 * teacher recorded is not what any account signs in with -- and it still
 * confirms nothing about which emails are registered. The second sentence is
 * for the student who typed that personal email anyway.
 */
export function ResetSentNotice({ email }) {
  return (
    <AuthNotice>
      If an account signs in with {email}, a password reset link is on its way.
      Check your inbox (and spam folder), then follow the link to choose a new password.
      <br />
      <br />
      {ISSUED_LOGIN_NOTE}
    </AuthNotice>
  )
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const problem = forgotPasswordProblem(email)
    if (problem) { setError(problem); return }
    setSubmitting(true)
    try {
      // Always answers { sent: true } -- an unknown email, a mail-send
      // failure, and a real send all look identical here on purpose (the
      // anti-enumeration promise above). A thrown ApiError means the request
      // never reached the server at all (network down, Flask not running).
      await api('/api/auth/forgot-password', { method: 'POST', body: { email: email.trim() }, requireAuth: false })
      setSent(true)
    } catch (err) {
      setError(err.message || 'Could not send a reset link. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you sign in with and we'll send you a link to set a new password."
    >
      {sent ? (
        <div className="flex flex-col gap-5">
          <ResetSentNotice email={email.trim()} />
          <div style={{ textAlign: 'center', fontSize: 14, color: '#6A7A95' }}>
            <Link to="/login" className="transition hover:opacity-70" style={{ fontWeight: 700, color: navy }}>
              Back to sign in
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          {error && <AuthError>{error}</AuthError>}

          <div>
            <label htmlFor="forgot-email" style={authLabelStyle}>Email</label>
            <input
              id="forgot-email"
              className="ak-input"
              type="email"
              required
              autoComplete="email"
              autoFocus
              placeholder="you@school.edu.ph"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={authInputStyle}
            />
            {error !== ISSUED_LOGIN_NOTE && (
              // Read before anything is typed; hidden while the banner above says the same thing.
              <p style={{ fontSize: 13, color: '#6A7A95', margin: '8px 0 0', lineHeight: 1.5 }}>
                {ISSUED_LOGIN_NOTE}
              </p>
            )}
          </div>

          <SubmitButton type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </SubmitButton>

          <div style={{ textAlign: 'center', marginTop: 4, fontSize: 14, color: '#6A7A95' }}>
            Remembered it?{' '}
            <Link to="/login" className="transition hover:opacity-70" style={{ fontWeight: 700, color: navy }}>
              Back to sign in
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  )
}
