import { useState } from 'react'
import { Link } from 'react-router-dom'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import AuthLayout, { SubmitButton, AuthError, AuthNotice } from '@/components/AuthLayout'
import { authInputStyle, authLabelStyle } from '@/components/authStyles'
import { emailError } from '@/lib/validation'
import { navy } from '@/theme'

/**
 * Forgot-password page. Pilot feedback asked for the standard "Forgot your
 * password?" link that goes to its own page, instead of the old inline
 * "Forgot?" button that reused whatever was typed in the login email field.
 *
 * The reset itself is Firebase's own emailed link; this page only collects
 * the address. Note the success message does not confirm the account exists
 * -- Firebase answers the same either way, and so do we, so this page cannot
 * be used to probe which emails are registered.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const problem = emailError(email)
    if (problem) { setError(problem); return }
    setSubmitting(true)
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setSent(true)
    } catch (err) {
      // user-not-found still shows the success screen (see the note above);
      // only a genuinely failed send is worth reporting.
      if (err.code === 'auth/user-not-found') setSent(true)
      else if (err.code === 'auth/invalid-email') setError('That email address is not valid.')
      else if (err.code === 'auth/too-many-requests') setError('Too many attempts. Try again in a few minutes.')
      else setError('Could not send a reset link. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your account email and we'll send you a link to set a new password."
    >
      {sent ? (
        <div className="flex flex-col gap-5">
          <AuthNotice>
            If an account exists for {email.trim()}, a password reset link is on its way.
            Check your inbox (and spam folder), then follow the link to choose a new password.
          </AuthNotice>
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
