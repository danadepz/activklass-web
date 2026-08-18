import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import AuthLayout, {
  SubmitButton,
  EyeToggle,
  AuthError,
  AuthNotice,
} from '@/components/AuthLayout'
import { authInputStyle, authLabelStyle } from '@/components/authStyles'
import { Check } from '@/components/icons'
import { navy, ink, gold, muted } from '@/theme'

const FRIENDLY_ERRORS = {
  'auth/email-already-in-use': 'That email is already in use. Try signing in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'That email address is not valid.',
}

const ROLES = [
  { value: 'teacher', label: 'Teacher', hint: 'Manage classes & grades' },
  { value: 'student', label: 'Student', hint: 'Take quizzes & track progress' },
]

// 0–3 heuristic strength score, mirrored by the three-segment meter.
function scorePassword(v = '') {
  if (!v) return 0
  let sc = 0
  if (v.length >= 6) sc++
  if (v.length >= 10 || (/[0-9]/.test(v) && /[a-zA-Z]/.test(v))) sc++
  if (/[^a-zA-Z0-9]/.test(v) && v.length >= 8) sc++
  return sc
}
const PW_LABELS = ['', 'Weak', 'Fair', 'Strong']
const pwColor = (score) => (score >= 3 ? '#1F8A5B' : score === 2 ? gold : '#E0794B')

function RoleCard({ role, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 14,
        borderRadius: 12,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        color: ink,
        ...(selected
          ? { background: 'rgba(14,42,92,0.05)', border: '1.5px solid #0E2A5C', boxShadow: '0 0 0 3px rgba(14,42,92,0.08)' }
          : { background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)' }),
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 15, fontWeight: 700 }}>{role.label}</span>
        <span
          style={
            selected
              ? { width: 20, height: 20, borderRadius: '50%', background: navy, color: gold, display: 'grid', placeItems: 'center' }
              : { width: 20, height: 20, borderRadius: '50%', border: '1.5px solid rgba(14,42,92,0.2)' }
          }
        >
          {selected && <Check className="h-3 w-3" />}
        </span>
      </div>
      <span style={{ fontSize: 12, color: muted, lineHeight: 1.35 }}>{role.hint}</span>
    </button>
  )
}

export default function Register() {
  const navigate = useNavigate()
  const { status, firebaseUser, refreshProfile, logout } = useAuth()
  // Signed in with Firebase but no ActivKlass profile yet — e.g. a registration
  // that failed halfway. Only the profile fields are needed to finish.
  const completing = status === 'not_registered' && firebaseUser !== null

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'teacher',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const pwScore = scorePassword(form.password)
  const pwStrength = pwColor(pwScore)
  const segIdle = 'rgba(14,42,92,0.1)'

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // 1. Firebase identity — skipped when completing an existing session.
      if (!auth.currentUser) {
        await createUserWithEmailAndPassword(auth, form.email, form.password)
      }
      // 2. ActivKlass profile doc in the Firestore 'users' collection.
      // Role drives routing; security rules block later role changes by
      // students/parents (escalation guard). Passwords stay in Firebase Auth.
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        first_name: form.firstName,
        last_name: form.lastName,
        email: auth.currentUser.email,
        role: form.role,
        created_at: serverTimestamp(),
      })
      await refreshProfile()
      navigate('/portal')
    } catch (err) {
      setError(FRIENDLY_ERRORS[err.code] ?? err.message ?? 'Registration failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title={completing ? 'One more step' : 'Create your account'}
      subtitle={
        completing
          ? 'Complete your profile to finish setting up your account.'
          : 'Start managing your class records in minutes.'
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {completing && (
          <AuthNotice>
            Signed in as <strong>{firebaseUser.email}</strong> — just complete your profile below.
          </AuthNotice>
        )}
        {error && <AuthError>{error}</AuthError>}

        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="reg-first" style={authLabelStyle}>First name</label>
            <input
              id="reg-first"
              className="ak-input"
              required
              autoComplete="given-name"
              placeholder="Juan"
              value={form.firstName}
              onChange={set('firstName')}
              style={authInputStyle}
            />
          </div>
          <div>
            <label htmlFor="reg-last" style={authLabelStyle}>Last name</label>
            <input
              id="reg-last"
              className="ak-input"
              required
              autoComplete="family-name"
              placeholder="Dela Cruz"
              value={form.lastName}
              onChange={set('lastName')}
              style={authInputStyle}
            />
          </div>
        </div>

        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={{ ...authLabelStyle, padding: 0 }}>I am a</legend>
          <div className="grid grid-cols-2 gap-3">
            {ROLES.map((role) => (
              <RoleCard
                key={role.value}
                role={role}
                selected={form.role === role.value}
                onSelect={() => setForm((f) => ({ ...f, role: role.value }))}
              />
            ))}
          </div>
        </fieldset>

        {!completing && (
          <>
            <div>
              <label htmlFor="reg-email" style={authLabelStyle}>Email</label>
              <input
                id="reg-email"
                className="ak-input"
                type="email"
                required
                autoComplete="email"
                placeholder="you@school.edu.ph"
                value={form.email}
                onChange={set('email')}
                style={authInputStyle}
              />
            </div>
            <div>
              <label htmlFor="reg-password" style={authLabelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="reg-password"
                  className="ak-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Create a password"
                  value={form.password}
                  onChange={set('password')}
                  style={{ ...authInputStyle, paddingRight: 46 }}
                />
                <EyeToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
              </div>
              <div className="flex items-center gap-1" style={{ marginTop: 10 }}>
                {[1, 2, 3].map((seg) => (
                  <span
                    key={seg}
                    style={{ flex: 1, height: 4, borderRadius: 2, background: pwScore >= seg ? pwStrength : segIdle, transition: 'background 0.25s' }}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between" style={{ fontSize: 12, color: '#9AA6BD', marginTop: 8 }}>
                <span>At least 6 characters.</span>
                {pwScore > 0 && <span style={{ fontWeight: 700, color: pwStrength }}>{PW_LABELS[pwScore]}</span>}
              </div>
            </div>
          </>
        )}

        <SubmitButton type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting
            ? completing
              ? 'Finishing…'
              : 'Creating account…'
            : completing
              ? 'Complete profile'
              : 'Create account'}
        </SubmitButton>

        {completing ? (
          <div style={{ textAlign: 'center', marginTop: 4, fontSize: 14, color: muted }}>
            Wrong account?{' '}
            <button
              type="button"
              onClick={logout}
              className="transition hover:opacity-70"
              style={{ fontWeight: 700, color: navy, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginTop: 4, fontSize: 14, color: muted }}>
            Already have an account?{' '}
            <Link to="/login" className="transition hover:opacity-70" style={{ fontWeight: 700, color: navy }}>
              Sign in
            </Link>
          </div>
        )}
      </form>
    </AuthLayout>
  )
}
