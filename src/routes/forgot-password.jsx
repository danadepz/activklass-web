import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { alertDialog } from '@/components/ui/dialogs'
import AuthLayout, { SubmitButton, AuthError } from '@/components/AuthLayout'
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
 * for those is the teacher's or admin's Reset password (T-47 is what this
 * page used to spend a standing paragraph warning about). T-131 moved that
 * warning off the page itself and into the one place it is actually read --
 * the confirmation popup shown right after Send reset link, which is also
 * where "nothing arriving" gets a next step (T-100). The form no longer
 * blocks a typed login ID either: the backend already no-ops safely for
 * anything without an `@` (same anti-enumeration answer either way), so this
 * page lets every submission through to the one honest message instead of
 * guessing from the shape of what was typed.
 */

/**
 * What stops the submit, or '' to send. Only an empty field or a malformed
 * email (one with an `@` that still is not one) blocks here -- a typed login
 * ID has no `@` and is let through, because the popup after submit already
 * covers that case for every reader, not just the ones this check happens to
 * catch.
 */
export function forgotPasswordProblem(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'Email is required.'
  if (!text.includes('@')) return ''
  return emailError(text)
}

/**
 * The confirmation popup's message, after Send reset link. Three things in
 * order, and none of them ever branch on whether the account exists (the
 * anti-enumeration promise `POST /api/auth/forgot-password` already makes):
 * the condition leads (T-100 -- "if X signs in here" before "the link is on
 * its way", so the sentence can never be read as unconditional), then what
 * nothing arriving actually means, then the way in for an issued login
 * (T-47 -- still names "teacher" and "school admin", still says there is no
 * inbox, never a vendor name).
 */
export function resetRequestedMessage(email) {
  return (
    `If ${email} signs in here, the link is on its way — check your inbox ` +
    `and spam folder.\n\nNothing arriving in a few minutes usually means ` +
    `that isn't the address this account signs in with. Try another, or ` +
    `ask your teacher or your school admin to reset it for you.\n\nSigning ` +
    `in with a login ID instead, like sample-123456 -- those have no inbox ` +
    `behind them, so your teacher or your school admin is the only way ` +
    `back in.`
  )
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
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
      await alertDialog({ title: 'Check your inbox', message: resetRequestedMessage(email.trim()) })
      setEmail('')
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
            placeholder="e.g. sample.maria@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={authInputStyle}
          />
        </div>

        <SubmitButton type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? 'Sending…' : 'Send reset link'}
        </SubmitButton>

        <div style={{ textAlign: 'center', marginTop: 4, fontSize: 14, color: '#6A7A95' }}>
          <Link to="/login" className="transition hover:opacity-70" style={{ fontWeight: 700, color: navy }}>
            Back to sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
