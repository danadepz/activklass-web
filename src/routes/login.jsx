import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import AuthLayout, {
  SubmitButton,
  EyeToggle,
  AuthError,
  AuthNotice,
} from '@/components/AuthLayout'
import { authInputStyle, authLabelStyle } from '@/components/authStyles'
import { navy, ink } from '@/theme'

const FRIENDLY_ERRORS = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/invalid-email': 'That email address is not valid.',
}

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      // "Keep me signed in" → persist across browser restarts; otherwise the
      // session is cleared when the tab/browser closes.
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
      await signInWithEmailAndPassword(auth, email, password)
      navigate('/portal')
    } catch (err) {
      setError(FRIENDLY_ERRORS[err.code] ?? 'Sign in failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Lightweight reset: emails a link to the address already typed above.
  async function handleForgot() {
    setError(null)
    setNotice(null)
    if (!email) {
      setNotice('Enter your email above first, then tap Forgot.')
      return
    }
    try {
      await sendPasswordResetEmail(auth, email)
      setNotice(`Password reset link sent to ${email}.`)
    } catch (err) {
      setError(FRIENDLY_ERRORS[err.code] ?? 'Could not send a reset link. Try again.')
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your ActivKlass account.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && <AuthError>{error}</AuthError>}
        {notice && <AuthNotice>{notice}</AuthNotice>}

        <div>
          <label htmlFor="login-email" style={authLabelStyle}>Email</label>
          <input
            id="login-email"
            className="ak-input"
            type="email"
            required
            autoComplete="email"
            placeholder="you@school.edu.ph"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={authInputStyle}
          />
        </div>

        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <label htmlFor="login-password" style={{ fontSize: 13, fontWeight: 600, color: ink }}>
              Password
            </label>
            <button
              type="button"
              onClick={handleForgot}
              className="transition hover:opacity-70"
              style={{ fontSize: 12, fontWeight: 600, color: navy, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Forgot?
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              id="login-password"
              className="ak-input"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...authInputStyle, paddingRight: 46 }}
            />
            <EyeToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 select-none" style={{ marginTop: -4 }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: navy, cursor: 'pointer', margin: 0 }}
          />
          <span style={{ fontSize: 13, color: '#3A4A6B', fontWeight: 500 }}>Keep me signed in on this device</span>
        </label>

        <SubmitButton type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </SubmitButton>

        <div style={{ textAlign: 'center', marginTop: 4, fontSize: 14, color: '#6A7A95' }}>
          No account yet?{' '}
          <Link to="/register" className="transition hover:opacity-70" style={{ fontWeight: 700, color: navy }}>
            Create one
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
