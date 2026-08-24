import { useState } from 'react'
// TEMPORARY dev helper — remove this import and the <DevQuickLogin /> below
// when the seeded test accounts are no longer needed.
import DevQuickLogin from '@/components/DevQuickLogin'
import { Link, useNavigate } from 'react-router-dom'
import {
  signInWithEmailAndPassword,
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

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your ActivKlass account.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <DevQuickLogin
          disabled={submitting}
          onPick={(a) => { setEmail(a.email); setPassword(a.password); setError(null); setNotice(null) }}
        />

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
            <Link
              to="/forgot-password"
              className="transition hover:opacity-70"
              style={{ fontSize: 12, fontWeight: 600, color: navy, textDecoration: 'none' }}
            >
              Forgot your password?
            </Link>
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
