import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { api } from '../lib/api'
import { useAuth } from '../context/useAuth'

const FRIENDLY_ERRORS = {
  'auth/email-already-in-use': 'That email is already in use. Try signing in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'That email address is not valid.',
}

export default function Register() {
  const navigate = useNavigate()
  const { status, firebaseUser, refreshProfile, logout } = useAuth()
  // Signed in with Firebase but no Activklass profile yet — e.g. a registration
  // that failed halfway. Only the profile fields are needed to finish.
  const completing = status === 'not_registered' && firebaseUser !== null

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'teacher',
  })
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // 1. Firebase identity — skipped when completing an existing session.
      if (!auth.currentUser) {
        await createUserWithEmailAndPassword(auth, form.email, form.password)
      }
      // 2. Activklass profile row (role lives server-side, never in Firebase).
      await api('/api/auth/register', {
        method: 'POST',
        body: { first_name: form.firstName, last_name: form.lastName, role: form.role },
      })
      await refreshProfile()
      navigate('/')
    } catch (err) {
      setError(FRIENDLY_ERRORS[err.code] ?? err.message ?? 'Registration failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-700">Activklass</h1>
          <p className="text-slate-500 mt-1">
            {completing ? 'One more step' : 'Create your account'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-4">
          {completing && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5 text-sm text-indigo-900">
              Signed in as <span className="font-semibold">{firebaseUser.email}</span> — just
              complete your profile to finish setting up your account.
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">First name</span>
              <input
                required
                value={form.firstName}
                onChange={set('firstName')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Last name</span>
              <input
                required
                value={form.lastName}
                onChange={set('lastName')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">I am a</span>
            <select
              value={form.role}
              onChange={set('role')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
            </select>
          </label>
          {!completing && (
            <>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Email</span>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={set('email')}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Password</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={set('password')}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            </>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 text-white font-medium py-2.5 hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting
              ? completing ? 'Finishing…' : 'Creating account…'
              : completing ? 'Complete profile' : 'Create account'}
          </button>
          {completing ? (
            <p className="text-sm text-slate-500 text-center">
              Wrong account?{' '}
              <button type="button" onClick={logout} className="text-indigo-600 font-medium hover:underline">
                Sign out
              </button>
            </p>
          ) : (
            <p className="text-sm text-slate-500 text-center">
              Already have an account?{' '}
              <Link to="/login" className="text-indigo-600 font-medium hover:underline">
                Sign in
              </Link>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
