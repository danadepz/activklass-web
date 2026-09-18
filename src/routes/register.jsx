import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { Timestamp, addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import {
  emailError,
  linkError,
  nameError,
  passwordError,
  phoneError,
  schoolAbbrError,
  schoolNameError,
  verificationIdError,
} from '@/lib/validation'
import {
  abbrConflictError,
  addSchoolToDirectory,
  fetchSchoolDirectory,
} from '@/lib/schoolDirectory'
import { useAuth } from '@/context/useAuth'
import { CALENDARS, estimateAnnual, estimateSolo, pesos, trialEndsFrom, MONTHS_PER_SCHOOL_YEAR, TRIAL_DAYS } from '@/lib/pricing'
import AuthLayout, {
  SubmitButton,
  EyeToggle,
  AuthError,
  AuthNotice,
} from '@/components/AuthLayout'
import { authInputStyle, authLabelStyle } from '@/components/authStyles'
import { navy, gold, goldDeep, muted, blue, blueText } from '@/theme'
import { BookOpen, Users, Check } from '@/components/icons'
import { ID_TYPES } from '@/routes/pending-verification'

const FRIENDLY_ERRORS = {
  // Only ever reached once signing in with the same password has also been
  // refused (createAccount below), so the address is not theirs to finish.
  'auth/email-already-in-use':
    'That email already has an account, and this password does not match it. Sign in with the right password, reset it from "Forgot your password?", or use a different email address.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'That email address is not valid.',
}

// Sentinel for "my school isn't listed" in the school dropdown. Firestore doc
// ids never look like this, so it cannot collide with a real directory entry.
const NEW_SCHOOL = '__add_new_school__'

// Gender, not pronouns: the list used to read He / She / Others, which is
// the pronoun wearing the wrong label (T-51). Custom reveals a text box for
// whatever the person wants to write, kept optional. Nothing in the product
// reads the stored value yet, so the values changed with the labels.
const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'custom', label: 'Custom' },
]
const SCHOOL_TYPES = [
  { value: 'private', label: 'Private school' },
  { value: 'public', label: 'Public school' },
]
const POSITIONS = [
  { value: 'faculty', label: 'Faculty' },
  { value: 'program_chair', label: 'Program chair / head' },
  { value: 'dean', label: 'Dean' },
  { value: 'admin', label: 'Admin' },
]
// The institution path exists to set the school up, and whoever walks it
// becomes its admin. Anyone below these is probably a teacher who picked the
// wrong card on step 1 (T-31, T-32) — the Position field says so, gently.
const LEADERSHIP_POSITIONS = new Set(['program_chair', 'dean', 'admin'])

// Which positions a path offers. A school admin is only ever made by the
// ActivKlass team when a school request is approved — a self-registered
// account is always a teacher, and the rules refuse 'admin' — so on the
// individual path "Admin" would record a position nothing reads and
// contradict what the account is (T-52). The institution path keeps all
// four: that is where the nudge above needs them. Exported for the test.
export function positionsFor(kind) {
  return kind === 'institution' ? POSITIONS : POSITIONS.filter((p) => p.value !== 'admin')
}

// A school picks how many seats it needs on two sliders, and the
// subscription follows from those numbers — there are no named plans. The
// floors are the smallest school we sell to; the student floor is also the
// solo-teacher cap, so a school never pays for less than one teacher gets.
// Students are sized PER TEACHER on both paths — a school's total is
// teachers × students-per-teacher (20 teachers at 120 each = 2,400), so the
// two sliders stay relative to each other instead of drifting apart. 120 is
// the solo trial cap, and a typical full load.
const SEATS = {
  teachers: { min: 20, max: 500, step: 5 },
  perTeacher: { min: 30, max: 300, step: 5 },
}

// The registration walk, per account type. Step 1 is the chooser; the last
// step is where the account (or the request) is actually created. A
// "completing" session already has its Firebase account, so it has no
// sign-in step — its last step is the school.
const STEPS = {
  individual: ['Account type', 'About you', 'Your school', 'Sign-in details', 'Verify identity', 'Students'],
  institution: ['Account type', 'About you', 'Your school', 'Sign-in details', 'Seats'],
}

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

const selectStyle = (hasValue) => ({
  ...authInputStyle,
  cursor: 'pointer',
  color: hasValue ? undefined : '#9AA6BD',
})

export default function Register() {
  const navigate = useNavigate()
  const { status, firebaseUser, refreshProfile, logout } = useAuth()
  // Signed in with Firebase but no ActivKlass profile yet — e.g. a registration
  // that failed halfway. Only the profile fields are needed to finish.
  const completing = status === 'not_registered' && firebaseUser !== null
  // A finished account is signed in on this browser. The form still works —
  // a teacher may well register a colleague from their own machine — but it
  // says so up front, and the submit refuses to hand that account back as if
  // it were the new one (T-56, signedInAsSomeoneElse).
  const signedIn = status === 'signed_in' && firebaseUser !== null
  // /register?type=institution -- the landing page's "registering a whole
  // school?" link -- skips the chooser and opens on the school path. Read
  // once, at mount: the chooser stays reachable with Back.
  const [searchParams] = useSearchParams()
  const preset = searchParams.get('type') === 'institution' && !completing ? 'institution' : null

  // First question, before any details: who is this account for? A solo
  // teacher goes on to create an account here. A school does not — its
  // subscription is arranged with the ActivKlass team, so that path ends in
  // a request for the team rather than an account.
  const [kind, setKind] = useState(completing ? 'individual' : preset)
  // Switching cards drops a position the new path does not offer, so Back
  // to the chooser and over to Individual cannot carry "Admin" through.
  function chooseKind(next) {
    setKind(next)
    setForm((f) => (positionsFor(next).some((p) => p.value === f.position) ? f : { ...f, position: '' }))
  }
  // 1 = chooser, 2…N = the steps in STEPS[kind], 'sent' = request confirmed.
  const [step, setStep] = useState(completing || preset ? 2 : 1)

  const [form, setForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    gender: '',
    genderCustom: '',
    phone: '',
    schoolId: '',
    newSchoolName: '',
    newSchoolAbbr: '',
    campus: '',
    schoolType: '',
    calendar: '',
    position: '',
    email: '',
    password: '',
    confirm: '',
    teacherSeats: SEATS.teachers.min,
    studentsPerTeacher: 120,
    soloStudents: 40,
    idType: ID_TYPES[0].value,
    idNumber: '',
    idLink: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  // Signing out from this page ends the other session and nothing else: the
  // form keeps every step, and the message that asked for it goes away.
  function signOutHere() {
    setError(null)
    return logout()
  }

  // The public directory behind "Select School" (see lib/schoolDirectory.js).
  // Readable signed-out, so it loads while the form is being filled in. On a
  // fetch error the dropdown degrades to just the "add my school" path.
  const queryClient = useQueryClient()
  const schoolsQuery = useQuery({
    queryKey: ['school-directory'],
    queryFn: fetchSchoolDirectory,
    staleTime: 60_000,
  })
  const schools = schoolsQuery.data ?? []
  const addingSchool = form.schoolId === NEW_SCHOOL

  const steps = STEPS[kind] ?? STEPS.individual
  const lastStep = completing ? 3 : steps.length
  const choosing = step === 1
  const sent = step === 'sent'

  const totalStudents = Number(form.teacherSeats) * Number(form.studentsPerTeacher)

  const pwScore = scorePassword(form.password)
  const pwStrength = pwColor(pwScore)
  const segIdle = 'rgba(14,42,92,0.1)'

  // Same rules as every other form that collects these fields, checked one
  // step at a time so the message points at what is on screen.
  function stepProblem(n) {
    if (n === 2) {
      return (
        nameError(form.firstName, { label: 'First name' }) ||
        nameError(form.middleName, { label: 'Middle name', required: false }) ||
        nameError(form.lastName, { label: 'Last name' }) ||
        (form.gender ? '' : 'Select your gender.') ||
        phoneError(form.phone)
      )
    }
    if (n === 3) {
      return (
        (!form.schoolId
          ? 'Select your school.'
          : addingSchool
            ? schoolNameError(form.newSchoolName) || schoolAbbrError(form.newSchoolAbbr)
            : '') ||
        (form.schoolType ? '' : 'Is it a private or a public school?') ||
        (form.calendar ? '' : 'How is the academic year divided?') ||
        (form.position ? '' : 'Select your position.')
      )
    }
    if (n === 4) {
      return (
        emailError(form.email) ||
        passwordError(form.password) ||
        (form.confirm === form.password ? '' : 'The two passwords do not match.')
      )
    }
    if (n === 5 && kind === 'individual') {
      return verificationIdError(form.idNumber, form.idType) || linkError(form.idLink, { label: 'The link to your ID' })
    }
    return '' // seats: the sliders cannot hold an invalid value
  }

  function back() {
    setError(null)
    setStep((s) => (typeof s === 'number' ? s - 1 : 1))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const problem = stepProblem(step)
    if (problem) { setError(problem); return }
    if (step < lastStep) { setStep(step + 1); return }
    setSubmitting(true)
    try {
      await createAccount()
    } catch (err) {
      // Raw exception text is not a message anyone should have to read, and
      // once step 1 has run the account exists: whatever failed after it, the
      // way back in is the SAME email and password, which now finishes the
      // half-made account instead of being refused as taken.
      console.error('[register] could not finish the account:', err.code ?? '', err)
      setError(
        FRIENDLY_ERRORS[err.code] ??
          (auth.currentUser
            ? 'Your account was created, but we could not finish setting it up. Try again with the same email address and password.'
            : 'We could not create your account. Check your connection and try again.'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Everything the person told us about themselves and their school — the
  // same shape whether it lands on a teacher profile or a school request.
  function details() {
    const school = addingSchool
      ? null
      : (schools.find((s) => s.id === form.schoolId) ?? null)
    return {
      first_name: form.firstName.trim(),
      ...(form.middleName.trim() && { middle_name: form.middleName.trim() }),
      last_name: form.lastName.trim(),
      gender: form.gender,
      ...(form.gender === 'custom' && form.genderCustom.trim() && { gender_custom: form.genderCustom.trim() }),
      phone: form.phone.trim(),
      school_name: addingSchool ? form.newSchoolName.trim() : (school?.name ?? ''),
      school_type: form.schoolType,
      academic_calendar: form.calendar,
      position: form.position,
      ...(form.campus.trim() && { campus: form.campus.trim() }),
    }
  }

  async function createAccount() {
    // "UCB is taken by another school" is a predictable rejection — check it
    // BEFORE creating the Firebase account so it cannot strand anyone in the
    // half-registered completing state. The directory is readable signed out.
    if (addingSchool) {
      const clash = await abbrConflictError(form.newSchoolAbbr, form.newSchoolName)
      if (clash) { setError(clash); return }
    }
    // 0. Someone else's session is not ours to finish. Stop here, before any
    // account or directory write, and leave the form as it is: Sign out (the
    // notice above the form, or the button beside this message) and the same
    // click then creates the account for real.
    const otherAccount = signedInAsSomeoneElse(auth.currentUser?.email, form.email)
    if (otherAccount) {
      setError(<>{otherAccount} <SignOutButton onClick={signOutHere} /></>)
      return
    }
    // 1. Firebase identity — skipped when resuming this person's own
    // half-made session (same email, no profile yet).
    let created = false
    if (!auth.currentUser) {
      try {
        // Trimmed, because sign-in trims too (lib/logins.js) — the address the
        // account is created under and the one typed later must agree.
        await createUserWithEmailAndPassword(auth, form.email.trim(), form.password)
        created = true
      } catch (err) {
        if (err.code !== 'auth/email-already-in-use') throw err
        // A run that failed at step 2 or 3 left the account behind. The
        // `completing` walk picks that up, but only while the session lives —
        // sign out, another browser, another machine, and the retry lands here
        // instead, where "already in use" used to be the end of the road: taken
        // on registration, and no profile to sign in with either. The same
        // email AND password is proof enough it is the same person, so sign
        // them in and finish the account they already own.
        try {
          await signInWithEmailAndPassword(auth, form.email.trim(), form.password)
        } catch {
          throw err // someone else's address, or not the password it was made with
        }
      }
    }
    // Whenever the account was already there — this session's half-made one, or
    // the one just signed into — it may be a FINISHED account, and step 3 does
    // not merge: it would rewrite that person's name, school and role with
    // whatever this form is holding. Only a missing profile is a registration
    // left to finish; a complete one just means they are signed in, so take
    // them in instead.
    if (!created) {
      const existing = await getDoc(doc(db, 'users', auth.currentUser.uid))
      if (existing.exists()) {
        await refreshProfile()
        navigate('/portal')
        return
      }
    }
    // 2. A newly declared school goes into the public directory first, so
    // the next teacher from that school finds it in the dropdown. Requires
    // the session that step 1 just created.
    const school = addingSchool
      ? await addSchoolToDirectory({ name: form.newSchoolName, abbreviation: form.newSchoolAbbr })
      : (schools.find((s) => s.id === form.schoolId) ?? null)
    if (addingSchool && school) {
      queryClient.invalidateQueries({ queryKey: ['school-directory'] })
    }
    const uid = auth.currentUser.uid

    // 3. Institution: write the request BEFORE the profile (T-61). A
    // request refused by the rules must not strand the account behind a
    // profile that already says "pending" — with no profile written yet, a
    // refusal here just leaves a bare Firebase account, and the next sign-in
    // lands in the existing `completing` walk, which re-collects everything
    // and tries again. The ActivKlass team picks the request up from here —
    // they provision the school on these seat counts and make this account
    // its admin, and the admin then issues every teacher and student login.
    if (kind === 'institution') {
      await addDoc(collection(db, 'subscription_requests'), {
        ...details(),
        uid,
        email: auth.currentUser.email,
        teacher_seats: Number(form.teacherSeats),
        students_per_teacher: Number(form.studentsPerTeacher),
        student_seats: totalStudents,
        status: 'pending',
        created_at: serverTimestamp(),
      })
    }

    // 4. ActivKlass profile doc in the Firestore 'users' collection.
    // Always a teacher, on both paths: a person may only ever give
    // themselves that role (the rules refuse 'admin' — escalation guard),
    // and students, admins and parents are provisioned by their school.
    // Someone registering FOR a school is a teacher with a pending request
    // until the ActivKlass team provisions the school and makes them its
    // admin. Passwords stay in Firebase Auth. teaching_school_* is
    // affiliation only — school_id stays the billing link and is never
    // written here (see lib/schoolDirectory.js).
    const { school_name: _unused, ...profile } = details()
    await setDoc(doc(db, 'users', uid), {
      ...profile,
      email: auth.currentUser.email,
      role: 'teacher',
      ...(school && { teaching_school_id: school.id, teaching_school_name: school.name }),
      // Both paths are on a 30-day trial from the moment the account exists
      // (the estimate step promises this on either card) -- only the
      // institution branch used to stamp it, so a self-registered solo
      // teacher's account never carried a trial at all: accountKind() read
      // them as 'none', describeSubscription() had nothing to show a day
      // count from, and there was no trial for T-68's Pay button to ever end.
      subscription_status: 'trial',
      trial_ends_at: Timestamp.fromDate(trialEndsFrom()),
      ...(kind === 'institution'
        ? { school_request_pending: true }
        : {
            student_seats: Number(form.soloStudents),
            // Nobody vouched for a self-registered teacher, so the account
            // opens only once a developer has checked the ID they linked
            // (components/ProtectedRoute → /pending-verification). The rules
            // let this be created as 'pending' and nothing else.
            verification_status: 'pending',
            verification_id_type: form.idType,
            verification_id_number: form.idNumber.trim(),
            verification_id_link: form.idLink.trim(),
            verification_submitted_at: serverTimestamp(),
          }),
      created_at: serverTimestamp(),
    })

    if (kind === 'individual') {
      await refreshProfile()
      navigate('/portal')
      return
    }

    // The request landed and the profile is written — nothing left for this
    // person to do inside until we act on the request, so they are signed
    // out and told to wait for us rather than dropped into an empty portal.
    await logout()
    setStep('sent')
  }

  const title = completing
    ? 'One more step'
    : sent
      ? 'Request sent'
      : 'Create your ActivKlass account'
  const subtitle = completing
    ? 'Complete your profile to finish setting up your account.'
    : sent
      ? null
      : choosing
        ? 'Who is this account for?'
        : kind === 'institution'
          ? 'Create your account, tell us about your school, and we set it up with you.'
          : 'For teachers signing up on their own. Start managing your class records in minutes.'

  return (
    <AuthLayout
      variant="card"
      title={title}
      titleSize={choosing ? 'clamp(34px, 7vw, 48px)' : undefined}
      subtitle={subtitle}
    >
      {sent ? (
        <div className="flex flex-col items-center gap-5" style={{ textAlign: 'center' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 64, height: 64, borderRadius: '50%', background: `${gold}33`, color: goldDeep }}>
            <Check className="h-8 w-8" />
          </span>
          <p style={{ fontSize: 15, color: muted, margin: 0, lineHeight: 1.55, maxWidth: 360 }}>
            Thanks, {form.firstName.trim()}. Your request for{' '}
            <strong style={{ color: navy }}>{details().school_name}</strong> is with the
            ActivKlass team — we'll reach you at{' '}
            <strong style={{ color: navy }}>{form.email.trim()}</strong> to set it up and make
            you its admin. Your sign-in already exists, but you're signed out for now, so sign
            in once you hear from us. Nothing to pay today — your quote comes with the setup.
          </p>
          <Link to="/" className="transition hover:opacity-70" style={{ fontWeight: 700, color: navy, fontSize: 14 }}>
            Back to home
          </Link>
        </div>
      ) : choosing ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3" role="group" aria-label="Subscription type">
            <ChoiceCard
              selected={kind === 'individual'}
              onClick={() => chooseKind('individual')}
              icon={BookOpen}
              tint={blue}
              tintText={blueText}
              heading="Individual"
              body="A teacher signing up alone — including at a school that isn’t on ActivKlass yet"
            />
            <ChoiceCard
              selected={kind === 'institution'}
              onClick={() => chooseKind('institution')}
              icon={Users}
              tint={gold}
              tintText={goldDeep}
              heading="Institution"
              body="Set up your school’s subscription — you’ll be its admin and issue every teacher’s and student’s login"
            />
          </div>
          <SubmitButton type="button" disabled={!kind} onClick={() => setStep(2)}>
            Continue
          </SubmitButton>

          <div style={{ textAlign: 'center', marginTop: 4, fontSize: 14, color: muted }}>
            Already have an account?{' '}
            <Link to="/login" className="transition hover:opacity-70" style={{ fontWeight: 700, color: navy }}>
              Sign in
            </Link>
          </div>
          <Progress steps={steps} current={1} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {completing && (
            <AuthNotice>
              Signed in as <strong>{firebaseUser.email}</strong> — just complete your profile below.
            </AuthNotice>
          )}
          {signedIn && (
            <AuthNotice>
              You’re signed in as <strong>{firebaseUser.email}</strong>. Sign out to create a
              different account — what you fill in below stays. <SignOutButton onClick={signOutHere} />
            </AuthNotice>
          )}
          {error && <AuthError>{error}</AuthError>}

          {step === 2 && (
            <>
              <div className="grid gap-3.5 md:grid-cols-2">
                <Field id="reg-first" label="First name">
                  <input id="reg-first" className="ak-input" required autoComplete="given-name" placeholder="Juan" value={form.firstName} onChange={set('firstName')} style={authInputStyle} />
                </Field>
                <Field id="reg-middle" label="Middle name" hint="optional">
                  <input id="reg-middle" className="ak-input" autoComplete="additional-name" placeholder="Santos" value={form.middleName} onChange={set('middleName')} style={authInputStyle} />
                </Field>
              </div>
              <div className="grid gap-3.5 md:grid-cols-2">
                <Field id="reg-last" label="Last name">
                  <input id="reg-last" className="ak-input" required autoComplete="family-name" placeholder="Dela Cruz" value={form.lastName} onChange={set('lastName')} style={authInputStyle} />
                </Field>
                <Field id="reg-phone" label="Phone number">
                  <input id="reg-phone" className="ak-input" type="tel" required autoComplete="tel" placeholder="0917 123 4567" value={form.phone} onChange={set('phone')} style={authInputStyle} />
                </Field>
              </div>
              <div className="grid gap-3.5 md:grid-cols-2">
                <Field id="reg-gender" label="Gender">
                  <select id="reg-gender" className="ak-input" required value={form.gender} onChange={set('gender')} style={selectStyle(form.gender)}>
                    <option value="" disabled>Select</option>
                    {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </Field>
                {form.gender === 'custom' && (
                  <Field id="reg-gender-custom" label="Your gender" hint="optional">
                    <input id="reg-gender-custom" className="ak-input" maxLength={40} placeholder="In your own words" value={form.genderCustom} onChange={set('genderCustom')} style={authInputStyle} />
                  </Field>
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Field id="reg-school" label="School">
                <select id="reg-school" className="ak-input" required value={form.schoolId} onChange={set('schoolId')} style={selectStyle(form.schoolId)}>
                  <option value="" disabled>
                    {schoolsQuery.isLoading ? 'Loading schools…' : 'Select your school'}
                  </option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.abbreviation})</option>
                  ))}
                  <option value={NEW_SCHOOL}>My school isn’t listed — add it</option>
                </select>
                {addingSchool && (
                  <div className="grid gap-3.5 md:grid-cols-[1fr_140px]" style={{ marginTop: 12 }}>
                    <Field id="reg-school-name" label="Full name of school">
                      <input id="reg-school-name" className="ak-input" required maxLength={120} placeholder="University of Cebu-Banilad" value={form.newSchoolName} onChange={set('newSchoolName')} style={authInputStyle} />
                    </Field>
                    <Field id="reg-school-abbr" label="Abbreviation">
                      <input id="reg-school-abbr" className="ak-input" required maxLength={12} placeholder="UCB" value={form.newSchoolAbbr} onChange={set('newSchoolAbbr')} style={{ ...authInputStyle, textTransform: 'uppercase' }} />
                    </Field>
                    <p className="md:col-span-2" style={{ fontSize: 12, color: '#9AA6BD', margin: 0, lineHeight: 1.5 }}>
                      Write the full official name without abbreviations, plus the short form
                      colleagues know it by. Both will appear in this list for the next person
                      from your school.
                    </p>
                  </div>
                )}
              </Field>
              <div className="grid gap-3.5 md:grid-cols-2">
                <Field id="reg-campus" label="Campus" hint="optional">
                  <input id="reg-campus" className="ak-input" maxLength={80} placeholder="Main campus" value={form.campus} onChange={set('campus')} style={authInputStyle} />
                </Field>
                <Field id="reg-school-type" label="Private or public">
                  <select id="reg-school-type" className="ak-input" required value={form.schoolType} onChange={set('schoolType')} style={selectStyle(form.schoolType)}>
                    <option value="" disabled>Select</option>
                    {SCHOOL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid gap-3.5 md:grid-cols-2">
                <Field id="reg-calendar" label="Academic calendar">
                  <select id="reg-calendar" className="ak-input" required value={form.calendar} onChange={set('calendar')} style={selectStyle(form.calendar)}>
                    <option value="" disabled>Select</option>
                    {CALENDARS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
                <Field id="reg-position" label="Position">
                  <select id="reg-position" className="ak-input" required value={form.position} onChange={set('position')} style={selectStyle(form.position)}>
                    <option value="" disabled>Select</option>
                    {positionsFor(kind).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <WrongPathNudge kind={kind} position={form.position} />
                </Field>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <Field id="reg-email" label="Email">
                <input id="reg-email" className="ak-input" type="email" required autoComplete="email" placeholder="you@school.edu.ph" value={form.email} onChange={set('email')} style={authInputStyle} />
              </Field>
              <div className="grid gap-3.5 md:grid-cols-2">
                <Field id="reg-password" label="Password">
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
                      <span key={seg} style={{ flex: 1, height: 4, borderRadius: 2, background: pwScore >= seg ? pwStrength : segIdle, transition: 'background 0.25s' }} />
                    ))}
                  </div>
                  <div className="flex items-center justify-between" style={{ fontSize: 12, color: '#9AA6BD', marginTop: 8 }}>
                    <span>At least 6 characters.</span>
                    {pwScore > 0 && <span style={{ fontWeight: 700, color: pwStrength }}>{PW_LABELS[pwScore]}</span>}
                  </div>
                </Field>
                <Field id="reg-confirm" label="Confirm password">
                  <input
                    id="reg-confirm"
                    className="ak-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="Type it again"
                    value={form.confirm}
                    onChange={set('confirm')}
                    style={{
                      ...authInputStyle,
                      ...(form.confirm && { borderColor: form.confirm === form.password ? '#1F8A5B' : '#E0794B' }),
                    }}
                  />
                  {form.confirm && (
                    form.confirm === form.password ? (
                      <div className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 700, color: '#1F8A5B', marginTop: 8 }}>
                        <Check className="h-3.5 w-3.5" /> Passwords match
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#E0794B', marginTop: 8 }}>Does not match yet.</div>
                    )
                  )}
                </Field>
              </div>
            </>
          )}

          {step === 6 && kind === 'individual' && (
            <>
              <SeatSlider
                id="reg-solo-students"
                label="Students you handle"
                value={form.soloStudents}
                onChange={set('soloStudents')}
                tint={blue}
                {...SEATS.perTeacher}
              />
              <div style={{ background: 'rgba(14,42,92,0.05)', border: '1px solid rgba(14,42,92,0.12)', borderRadius: 11, padding: '14px 16px' }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Your subscription</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: navy, marginTop: 2 }}>
                      You · {Number(form.soloStudents).toLocaleString()} students
                    </div>
                    <div style={{ fontSize: 12.5, color: muted, marginTop: 2 }}>
                      Across all your classes and sections.
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estimate</div>
                    <Estimate annual={estimateSolo(form.soloStudents)} />
                  </div>
                </div>
                <TrialLine />
                {/* Nothing here takes a card, and a tester asked why (T-54). Since
                    T-68, paying is self-serve -- a "Pay for this school year" button
                    on the Account page, whenever the teacher is ready -- so this says
                    that instead of promising an ask that never came. */}
                <div style={{ fontSize: 12.5, color: muted, marginTop: 6, lineHeight: 1.45 }}>
                  No card needed for the trial. Pay for the school year any time from your Account page.
                </div>
                <div style={{ fontSize: 12, color: '#9AA6BD', marginTop: 10, lineHeight: 1.45 }}>
                  Your seat carries the AI generation and your records; each student seat is
                  records only. You can change this number later as your load changes.
                </div>
              </div>
            </>
          )}

          {step === 5 && kind === 'individual' && (
            <>
              <AuthNotice>
                <strong>One check before your account opens.</strong> A member of the ActivKlass
                team looks at an ID that shows you teach — usually within a working day. Until
                then you can sign in, but not build a class.
              </AuthNotice>
              <div className="grid gap-3.5 md:grid-cols-2">
                <Field id="reg-id-type" label="ID type">
                  <select id="reg-id-type" className="ak-input" required value={form.idType} onChange={set('idType')} style={selectStyle(true)}>
                    {ID_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <Field id="reg-id-number" label="ID number">
                  <input id="reg-id-number" className="ak-input" required maxLength={40} placeholder="As printed on the ID" value={form.idNumber} onChange={set('idNumber')} style={authInputStyle} />
                </Field>
              </div>
              <Field id="reg-id-link" label="Link to a photo of the ID">
                <input id="reg-id-link" className="ak-input" type="url" required placeholder="https://drive.google.com/…" value={form.idLink} onChange={set('idLink')} style={authInputStyle} />
                <p style={{ fontSize: 12, color: '#9AA6BD', margin: '8px 0 0', lineHeight: 1.5 }}>
                  Upload the photo to Google Drive or OneDrive, share it with “anyone with the
                  link”, and paste the link here. Only the ActivKlass team opens it.
                </p>
              </Field>
            </>
          )}

          {step === 5 && kind === 'institution' && (
            <>
              <SeatSlider
                id="reg-teacher-seats"
                label="Teachers"
                value={form.teacherSeats}
                onChange={set('teacherSeats')}
                tint={blue}
                {...SEATS.teachers}
              />
              <SeatSlider
                id="reg-students-per-teacher"
                label="Students per teacher"
                value={form.studentsPerTeacher}
                onChange={set('studentsPerTeacher')}
                tint={gold}
                {...SEATS.perTeacher}
              />
              <div style={{ background: 'rgba(14,42,92,0.05)', border: '1px solid rgba(14,42,92,0.12)', borderRadius: 11, padding: '14px 16px' }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Your subscription</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: navy, marginTop: 2 }}>
                      {Number(form.teacherSeats).toLocaleString()} teachers · {totalStudents.toLocaleString()} students
                    </div>
                    <div style={{ fontSize: 12.5, color: muted, marginTop: 2 }}>
                      {Number(form.teacherSeats).toLocaleString()} × {Number(form.studentsPerTeacher).toLocaleString()} students each.
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estimate</div>
                    <Estimate annual={estimateAnnual(form.teacherSeats, totalStudents)} />
                  </div>
                </div>
                <TrialLine />
                <div style={{ fontSize: 12, color: '#9AA6BD', marginTop: 10, lineHeight: 1.45 }}>
                  Teacher seats carry the AI generation and records; student seats are records only.
                  Your final quote follows from these numbers and comes with your setup.
                </div>
              </div>
              <AuthNotice>
                <strong>Schools are onboarded by the ActivKlass team.</strong> We will contact you
                at {form.email.trim() || 'your email'} to set up {details().school_name || 'your school'} on
                these seats and make your account its admin; you then issue every teacher and
                student login.
              </AuthNotice>
            </>
          )}

          <div className="flex items-center gap-4" style={{ marginTop: 4 }}>
            {!(completing && step === 2) && (
              <button
                type="button"
                onClick={back}
                className="transition hover:opacity-70"
                style={{ flexShrink: 0, fontSize: 14, fontWeight: 700, color: navy, background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                ← Back
              </button>
            )}
            <SubmitButton type="submit" disabled={submitting} aria-busy={submitting} style={{ marginTop: 0 }}>
              {step < lastStep
                ? 'Next'
                : submitting
                  ? (kind === 'institution' ? 'Sending…' : completing ? 'Finishing…' : 'Creating account…')
                  : kind === 'institution'
                    ? 'Request access'
                    : completing
                      ? 'Complete profile'
                      : 'Start free trial'}
            </SubmitButton>
          </div>

          {completing ? (
            <div style={{ textAlign: 'center', marginTop: 4, fontSize: 14, color: muted }}>
              Wrong account? <SignOutButton onClick={signOutHere} />
            </div>
          ) : (
            <div className="flex flex-col gap-2" style={{ textAlign: 'center', marginTop: 4 }}>
              <div style={{ fontSize: 14, color: muted }}>
                Already have an account?{' '}
                <Link to="/login" className="transition hover:opacity-70" style={{ fontWeight: 700, color: navy }}>
                  Sign in
                </Link>
              </div>
              <p style={{ fontSize: 12.5, color: '#9AA6BD', margin: 0, lineHeight: 1.5 }}>
                A student? Your account is set up by your school or teacher — no sign-up
                needed. Just sign in with the login they gave you.
              </p>
            </div>
          )}
          <Progress steps={completing ? steps.slice(0, 3) : steps} current={step} />
        </form>
      )}
    </AuthLayout>
  )
}

// Whether the session already on this browser belongs to someone other than
// the person filling the form. A registration that finds a signed-in account
// is meant to RESUME it — a run that died between creating the login and
// writing the profile — and that is only ever the same email. A different
// email is a different person: the tester registered "asdasdasd" on a browser
// still signed in as Marites and was handed her dashboard, her name and her
// school with no error (T-56). Exported so the decision is testable without
// walking six steps; `''` means go ahead.
export function signedInAsSomeoneElse(sessionEmail, formEmail) {
  const session = String(sessionEmail ?? '').trim().toLowerCase()
  const typed = String(formEmail ?? '').trim().toLowerCase()
  if (!session || session === typed) return ''
  return `You’re signed in as ${session}. Sign out to create a different account.`
}

// Exported so the rule itself can be tested: the nudge renders three steps
// into a flow no static render reaches, and the person who needs it (T-31,
// T-32) is the one who never gets that far on purpose.
export function WrongPathNudge({ kind, position }) {
  if (kind !== 'institution' || !position || LEADERSHIP_POSITIONS.has(position)) return null
  return (
    <p style={{ fontSize: 12, color: '#9AA6BD', margin: '8px 0 0', lineHeight: 1.5 }}>
      Just here to teach? Individual is the faster path — go back a step.
    </p>
  )
}

// A link-shaped Sign out that sits inside a sentence. Signing out leaves the
// page and the form where they are; only the session goes.
function SignOutButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition hover:opacity-70"
      style={{ fontWeight: 700, color: navy, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', textDecoration: 'underline' }}
    >
      Sign out
    </button>
  )
}

function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} style={authLabelStyle}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: '#9AA6BD' }}> ({hint})</span>}
      </label>
      {children}
    </div>
  )
}

// One payment per school year on every calendar (owner's call, 2026-08-29);
// the calendar a school runs on is recorded, not billed by.
function Estimate({ annual }) {
  return (
    <>
      <div style={{ fontSize: 22, fontWeight: 700, color: navy, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {pesos(annual)}
      </div>
      <div style={{ fontSize: 12.5, color: muted, marginTop: 2 }}>
        per school year · {pesos(annual / MONTHS_PER_SCHOOL_YEAR)} / month
      </div>
    </>
  )
}

// "First 30 days free — then ₱X" sits under both estimates.
function TrialLine() {
  return (
    <div
      className="flex items-center gap-2"
      style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(14,42,92,0.08)', fontSize: 13, fontWeight: 700, color: '#1F8A5B' }}
    >
      <Check className="h-4 w-4" />
      First {TRIAL_DAYS} days free — nothing to pay today.
    </div>
  )
}

function SeatSlider({ id, label, value, onChange, tint, min, max, step }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 8 }}>
        <label htmlFor={id} style={{ ...authLabelStyle, marginBottom: 0 }}>{label}</label>
        <span style={{ fontSize: 20, fontWeight: 700, color: navy, fontVariantNumeric: 'tabular-nums' }}>
          {Number(value).toLocaleString()}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        style={{
          width: '100%',
          accentColor: tint,
          background: `linear-gradient(to right, ${tint} ${pct}%, rgba(14,42,92,0.1) ${pct}%)`,
          height: 6,
          borderRadius: 3,
          cursor: 'pointer',
        }}
      />
      <div className="flex justify-between" style={{ fontSize: 12, color: '#9AA6BD', marginTop: 6 }}>
        <span>{min.toLocaleString()} minimum</span>
        <span>{max.toLocaleString()}</span>
      </div>
    </div>
  )
}

function Progress({ steps, current }) {
  return (
    <div aria-label={`Step ${current} of ${steps.length}`} style={{ marginTop: 20 }}>
      <div className="flex items-center justify-between" style={{ fontSize: 12, color: muted, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, color: navy }}>{steps[current - 1]}</span>
        <span>Step {current} of {steps.length}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {steps.map((label, i) => (
          <span
            key={label}
            style={{ flex: 1, height: 5, borderRadius: 3, background: i < current ? gold : 'rgba(14,42,92,0.1)', transition: 'background 0.25s' }}
          />
        ))}
      </div>
    </div>
  )
}

function ChoiceCard({ selected, onClick, icon: Icon, tint, tintText, heading, body }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3FA9F5] focus-visible:ring-offset-2"
      style={{
        ...authInputStyle,
        textAlign: 'left',
        cursor: 'pointer',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        background: selected ? `${tint}14` : '#FFFFFF',
        borderColor: selected ? tint : 'rgba(14,42,92,0.14)',
        boxShadow: selected ? `0 0 0 3px ${tint}33` : 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{ display: 'inline-grid', placeItems: 'center', flexShrink: 0, width: 56, height: 56, borderRadius: 16, background: `${tint}22`, color: tintText }}
      >
        <Icon className="h-7 w-7" />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: navy, lineHeight: 1.3 }}>{heading}</span>
        <span style={{ fontSize: 13, color: muted, lineHeight: 1.4 }}>{body}</span>
      </span>
    </button>
  )
}
