import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { emailError, nameError, passwordError, schoolAbbrError, schoolNameError } from '@/lib/validation'
import {
  abbrConflictError,
  addSchoolToDirectory,
  fetchSchoolDirectory,
} from '@/lib/schoolDirectory'
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

// Sentinel for "my school isn't listed" in the school dropdown. Firestore doc
// ids never look like this, so it cannot collide with a real directory entry.
const NEW_SCHOOL = '__add_new_school__'

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
    schoolId: '',
    newSchoolName: '',
    newSchoolAbbr: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  // The public directory behind "Select School" (see lib/schoolDirectory.js).
  // Readable signed-out, so it loads while the form is being filled in. On a
  // fetch error the dropdown degrades to just the "add my school" path.
  const queryClient = useQueryClient()
  const schoolsQuery = useQuery({
    queryKey: ['school-directory'],
    queryFn: fetchSchoolDirectory,
    enabled: form.role === 'teacher',
    staleTime: 60_000,
  })
  const schools = schoolsQuery.data ?? []
  const addingSchool = form.schoolId === NEW_SCHOOL

  const pwScore = scorePassword(form.password)
  const pwStrength = pwColor(pwScore)
  const segIdle = 'rgba(14,42,92,0.1)'

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    // Same rules as every other form that collects these fields. A teacher
    // must name a school (existing entry, or a new full name + abbreviation);
    // email and password only exist when this is not a completing session.
    const problem =
      nameError(form.firstName, { label: 'First name' }) ||
      nameError(form.lastName, { label: 'Last name' }) ||
      (form.role === 'teacher'
        ? !form.schoolId
          ? 'Select the school you teach at.'
          : addingSchool
            ? schoolNameError(form.newSchoolName) || schoolAbbrError(form.newSchoolAbbr)
            : ''
        : '') ||
      (auth.currentUser ? '' : emailError(form.email) || passwordError(form.password))
    if (problem) { setError(problem); return }
    setSubmitting(true)
    try {
      // "UCB is taken by another school" is a predictable rejection — check it
      // BEFORE creating the Firebase account so it cannot strand anyone in the
      // half-registered completing state. The directory is readable signed out.
      if (form.role === 'teacher' && addingSchool) {
        const clash = await abbrConflictError(form.newSchoolAbbr, form.newSchoolName)
        if (clash) { setError(clash); return }
      }
      // 1. Firebase identity — skipped when completing an existing session.
      if (!auth.currentUser) {
        await createUserWithEmailAndPassword(auth, form.email, form.password)
      }
      // 2. A newly declared school goes into the public directory first, so
      // the next teacher from that school finds it in the dropdown. Requires
      // the session that step 1 just created.
      let school = null
      if (form.role === 'teacher') {
        school = addingSchool
          ? await addSchoolToDirectory({ name: form.newSchoolName, abbreviation: form.newSchoolAbbr })
          : (schools.find((s) => s.id === form.schoolId) ?? null)
      }
      if (addingSchool && school) {
        queryClient.invalidateQueries({ queryKey: ['school-directory'] })
      }
      // 3. ActivKlass profile doc in the Firestore 'users' collection.
      // Role drives routing; security rules block later role changes by
      // students/parents (escalation guard). Passwords stay in Firebase Auth.
      // teaching_school_* is affiliation only — school_id stays the billing
      // link and is never written here (see lib/schoolDirectory.js).
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: auth.currentUser.email,
        role: form.role,
        ...(school && { teaching_school_id: school.id, teaching_school_name: school.name }),
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

        {form.role === 'teacher' && (
          <div>
            <label htmlFor="reg-school" style={authLabelStyle}>School</label>
            <select
              id="reg-school"
              className="ak-input"
              required
              value={form.schoolId}
              onChange={set('schoolId')}
              style={{ ...authInputStyle, cursor: 'pointer', color: form.schoolId ? undefined : '#9AA6BD' }}
            >
              <option value="" disabled>
                {schoolsQuery.isLoading ? 'Loading schools…' : 'Select the school you teach at'}
              </option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.abbreviation})
                </option>
              ))}
              <option value={NEW_SCHOOL}>My school isn’t listed — add it</option>
            </select>

            {addingSchool && (
              <div className="flex flex-col gap-3.5" style={{ marginTop: 12 }}>
                <div>
                  <label htmlFor="reg-school-name" style={authLabelStyle}>Full name of school</label>
                  <input
                    id="reg-school-name"
                    className="ak-input"
                    required
                    maxLength={120}
                    placeholder="University of Cebu-Banilad"
                    value={form.newSchoolName}
                    onChange={set('newSchoolName')}
                    style={authInputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="reg-school-abbr" style={authLabelStyle}>Abbreviation</label>
                  <input
                    id="reg-school-abbr"
                    className="ak-input"
                    required
                    maxLength={12}
                    placeholder="UCB"
                    value={form.newSchoolAbbr}
                    onChange={set('newSchoolAbbr')}
                    style={{ ...authInputStyle, textTransform: 'uppercase' }}
                  />
                </div>
                <p style={{ fontSize: 12, color: '#9AA6BD', margin: 0, lineHeight: 1.5 }}>
                  Write the full official name without abbreviations, plus the short form
                  colleagues know it by. Both will appear in this list for the next teacher
                  from your school.
                </p>
              </div>
            )}
          </div>
        )}

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
