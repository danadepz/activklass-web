import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { api } from '@/lib/api'
import { setAccountDisabled } from '@/lib/admin'
import { deleteClassSection } from '@/lib/classes'
import { downloadCsv, stampedName } from '@/lib/csv'
import { listMyGuardians, revokeGuardianLink } from '@/lib/guardianCodes'
import { emailError, nameError, yearLevelError } from '@/lib/validation'
import { ENROLLMENT_STATUS_LABELS, REMARKS_OPTIONS, STATUS_LABELS, ageFromBirthdate, fetchUsersByIds, findStudentByEmail, findStudentsByNumber, parseCsv, addToRoster, removeFromRoster } from '@/lib/roster'
import { useAuth } from '@/context/useAuth'
import { accountKind } from '@/lib/subscription'
import { Users, Check, Clock, Layers } from '@/components/icons'
import { MetricCard } from '@/components/ui/Card'
import { navy, navyDeep, ink, gold, goldDeep, muted, faint, green, blueText, red, line, serif, mono, sansFamily as sans } from '@/theme'
import { toast } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/dialogs'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { useAsyncAction } from '@/components/ui/useAsyncAction'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'

/* users/{uid}.status carries TWO meanings in this codebase, which is worth
   knowing before changing anything here. The backend treats it as account state
   -- middleware/auth.py rejects a request when it is not 'active', and the seat
   counters only count 'active' users. This roster also renders it through
   STATUS_LABELS as academic progress. Nothing ever writes the academic values,
   so in practice the column has always read "Active"; the account meaning is
   the real one, and the disable action below writes it. 'inactive' and
   'pending' are listed so a disabled account renders as itself instead of
   `undefined`. */
const STATUS_STYLE = {
  inactive: 'bg-slate-100 text-slate-500',
  pending: 'bg-amber-50 text-amber-700',
  active: 'bg-green-50 text-green-700',
  needs_remediation: 'bg-amber-50 text-amber-700',
  mastered: 'bg-indigo-50 text-indigo-700',
}

const ENROLLMENT_STYLE = {
  AC: 'bg-green-50 text-green-700',
  IN: 'bg-slate-100 text-slate-500',
}

/* Account-state labels, kept here rather than added to STATUS_LABELS in
   lib/roster.js — that file is the logic lane's, and its map is the academic
   one. See the note above STATUS_STYLE about the overloaded field. */
const ACCOUNT_STATUS_LABELS = {
  active: 'Active',
  inactive: 'Disabled',
  pending: 'Pending',
}

const inputCls =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E2A5C]/40'

/**
 * Coerce a stored enrollment status to one the form can actually show.
 *
 * The seed writes `enrollment_status: 'enrolled'` on demo students, and other
 * values have reached the field over time. The select only offers AC and IN,
 * so an unknown value leaves it displaying "Active (AC)" while state still
 * holds the old string -- and saving writes that string straight back through
 * provisioning, which uppercases it. That is how a roster row ended up reading
 * a bare "ENROLLED": no style, no label, and invisible to the AC filter the
 * teacher uses to count their class.
 */
function normalizeEnrollmentStatus(value) {
  const upper = String(value ?? '').trim().toUpperCase()
  return upper in ENROLLMENT_STATUS_LABELS ? upper : 'AC'
}

const EMPTY_STUDENT_FIELDS = {
  student_number: '',
  middle_name: '',
  course: '',
  year_level: '',
  remarks: '',
  enrollment_status: 'AC',
  lrn: '',
  birthdate: '',
}

/* Optional roster fields still have to hold sensible values when filled in.
   Returns the first problem, or '' -- pilot feedback: a middle name of "123"
   and a year level of anything at all were both accepted. */
function rosterFieldsError(fields) {
  return (
    nameError(fields.middle_name, { label: 'Middle name', required: false }) ||
    yearLevelError(fields.year_level, { required: false })
  )
}

/* Build a Firestore patch of roster fields from the modal form state.
   Optional fields are nulled when blank so they can be cleared. */
function rosterPatch(fields) {
  const patch = {
    student_number: fields.student_number.trim() || null,
    middle_name: fields.middle_name.trim() || null,
    course: fields.course.trim() || null,
    year_level: fields.year_level.trim() || null,
    remarks: fields.remarks || null,
    enrollment_status: fields.enrollment_status || 'AC',
    lrn: fields.lrn.trim() || null,
  }
  if (fields.birthdate) {
    patch.birthdate = fields.birthdate
    patch.age = ageFromBirthdate(fields.birthdate)
  }
  return patch
}

/* A birthdate cannot be in the future. `max` both blocks a later date and makes
   the picker open on the current month instead of wherever it last landed --
   testers reported it opening on advanced dates. Computed once at module load;
   a session left open across midnight is not worth a re-render for. */
const TODAY_ISO = new Date().toISOString().slice(0, 10)

/* Shared roster field inputs (ID Number, Middle Name, Course, Year, Remarks,
   enrollment status, LRN, birthdate). Last/first name come from the account. */
/**
 * Show a failure in the banner AND as a toast.
 *
 * This file has the most fail() sites in the codebase and three scroll
 * containers, and none of it toasted. Each banner renders at the top of its
 * modal while the button that triggers it sits below the fields, so a teacher
 * could press Add, watch the button return to its idle label, and never see
 * the reason -- it rendered somewhere they had already scrolled past.
 *
 * That is the shape behind two walkthrough reports: "cannot add a student
 * manually" and "can find a registered student but cannot add them". The
 * refusals were firing. They were not where anyone was looking.
 *
 * Toasting rather than moving the banner is deliberate. Relocating it only
 * moves the assumption about what fits on screen, and that assumption breaks
 * again the next time someone adds a field. A toast is viewport-independent
 * and stays correct without anyone reasoning about layout.
 *
 * null clears the banner without toasting: that is a reset, not a failure.
 */
function failWith(setError) {
  return (message) => {
    setError(message)
    if (message) toast.error(message)
  }
}

/**
 * What provisioning actually did, said out loud.
 *
 * The endpoint answers with created / skipped / failed and a 200 even when
 * every row failed, because a partial import is the normal outcome of a real
 * roster. Callers used to read `failed` only in the single-student flows and
 * not at all in the CSV one, so an upload where nothing was imported closed
 * the modal looking like success -- which is what "bulk upload not
 * functioning" was: rows quietly not arriving, with no error anywhere.
 */
function provisionOutcome(res) {
  return {
    created: res?.created ?? [],
    skipped: res?.skipped ?? [],
    failed: res?.failed ?? [],
  }
}

/**
 * Shown under a button while an account is being made.
 *
 * Creating a sign-in account is several round trips to the identity service and
 * takes closer to ten seconds than one. A disabled button reading "Creating…"
 * for that long is indistinguishable from a dead one, which is part of how a
 * working flow got reported as "can't add student" -- measured at 10s in the
 * browser, twice. Saying it takes a moment costs nothing, and stops the second
 * click that starts the whole thing again.
 */
function SlowHint({ show, children = 'Setting up their account — this takes a few seconds.' }) {
  return show ? <p className="text-xs text-slate-400 text-center pt-1">{children}</p> : null
}

/** The first reason, plus how many more there were. */
function firstReason(rows) {
  if (!rows.length) return ''
  const more = rows.length - 1
  return `${rows[0].reason ?? 'no reason given'}${more > 0 ? ` (and ${more} more row${more === 1 ? '' : 's'})` : ''}`
}

/**
 * Announce the accounts that were just minted.
 *
 * The initial password is the student's ID number and it is emailed to nobody,
 * so this response is the only place it exists -- the toast stays until it is
 * dismissed, and a roster-sized import gets the list as a CSV rather than a
 * wall of text in a toast.
 */
function announceLogins(created) {
  const logins = created.filter((c) => c.login_created && c.initial_password)
  if (!logins.length) return
  const password = logins[0].initial_password
  if (logins.length === 1) {
    const one = logins[0]
    const who = `${one.first_name ?? ''} ${one.last_name ?? ''}`.trim() || one.email
    toast.success(
      `Account created for ${who}. They sign in with ${one.email} and the password ` +
        `${password}. Nothing is emailed, so pass it on — and tell them to change it.`,
      { duration: 0 },
    )
    return
  }
  toast.success(
    `${logins.length} sign-in accounts created, all on the starting password ${password}. ` +
      'Nothing is emailed — download the list so you know who still has to change theirs.',
    {
      duration: 0,
      action: {
        label: 'Download logins',
        onClick: () =>
          downloadCsv(stampedName('new-student-logins'), [
            ['email', 'first_name', 'last_name', 'student_number', 'initial_password'],
            ...logins.map((l) => [l.email, l.first_name, l.last_name, l.student_number, l.initial_password]),
          ]),
      },
    },
  )
}

function StudentFields({ fields, setFields }) {
  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }))
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={labelStyle}>ID Number</label>
          <input className="ak-input" placeholder="Student ID" value={fields.student_number} onChange={set('student_number')} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Middle name <span style={optHint}>(opt)</span></label>
          <input className="ak-input" value={fields.middle_name} onChange={set('middle_name')} style={fieldStyle} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={labelStyle}>Program <span style={optHint}>(opt)</span></label>
          <input className="ak-input" placeholder="e.g. BSIT / JHS / Grade School" value={fields.course} onChange={set('course')} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Year</label>
          <input className="ak-input" placeholder="e.g. 1st Year / Grade 10" value={fields.year_level} onChange={set('year_level')} style={fieldStyle} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={labelStyle}>Remarks <span style={optHint}>(opt)</span></label>
          <select className="ak-input" value={fields.remarks} onChange={set('remarks')} style={{ ...fieldStyle, cursor: 'pointer' }}>
            <option value="">—</option>
            {REMARKS_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Enrollment status</label>
          <select className="ak-input" value={fields.enrollment_status} onChange={set('enrollment_status')} style={{ ...fieldStyle, cursor: 'pointer' }}>
            {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label} ({value})</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={labelStyle}>LRN <span style={optHint}>(basic ed, opt)</span></label>
          <input className="ak-input" placeholder="12-digit LRN" value={fields.lrn} onChange={set('lrn')} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Birthdate</label>
          <input className="ak-input" type="date" max={TODAY_ISO} value={fields.birthdate} onChange={set('birthdate')} style={{ ...fieldStyle, cursor: 'pointer' }} />
        </div>
      </div>
    </div>
  )
}

/**
 * Pick the account a roster ID refers to.
 *
 * findStudentsByNumber returns every match because a student number is only
 * unique within a school. The teacher's own school wins; a tie that survives
 * that filter is a real ambiguity for the admin to resolve, not something to
 * guess at — enrolling the wrong school's student puts this class on a
 * stranger's dashboard.
 */
function pickMatch(matches, schoolId) {
  if (matches.length <= 1) return { match: matches[0] ?? null, ambiguous: false }
  const scoped = schoolId ? matches.filter((m) => m.school_id === schoolId) : []
  if (scoped.length === 1) return { match: scoped[0], ambiguous: false }
  return { match: null, ambiguous: true }
}

/* Add a registered student by ID (or email), or create a new manual student record. */
function AddStudentModal({ classId, enrolledIds, maxStudents, onClose, onDone }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Add a student', closeOnBackdrop: false })
  const { profile, school } = useAuth()
  /* Who may create an account, not who may enrol one. A teacher issued by a
     school has an admin whose job this is, so they get the lookup only; a
     solo subscriber has nobody above them and keeps both. accountKind reads
     the profile alone -- useMySubscription().isSolo resolves through Flask,
     and a stopped Flask would take the tab away from the solo teacher who is
     the only person entitled to it. Client-side shaping: the provision
     endpoint still accepts any teacher who owns the class, so this is the UI
     telling one story, not a gate. */
  const schoolIssued = accountKind(profile) === 'school'
  const [tab, setTab] = useState('find') // 'find' | 'create' -- 'create' is solo-only
  const [error, setError] = useState(null)
  const fail = failWith(setError)
  const [busy, setBusy] = useState(false)
  const isFull = maxStudents > 0 && enrolledIds.length >= maxStudents

  // --- Find existing ---
  const [idInput, setIdInput] = useState('')
  const [student, setStudent] = useState(null)
  const [findFields, setFindFields] = useState(EMPTY_STUDENT_FIELDS)

  async function lookup(e) {
    e.preventDefault()
    setBusy(true)
    fail(null)
    setStudent(null)
    try {
      // The ID is the key the class list actually carries; email still works
      // for self-registered students, recognized by the '@' no ID can contain.
      const needle = idInput.trim()
      let found = null
      if (needle.includes('@')) {
        found = await findStudentByEmail(needle)
      } else {
        const picked = pickMatch(await findStudentsByNumber(needle), profile?.school_id)
        if (picked.ambiguous) {
          fail('More than one student account carries that ID. Ask your school admin which account is your student, then add them by email.')
          setBusy(false)
          return
        }
        found = picked.match
      }
      if (!found) {
        fail(
          schoolIssued
            ? `No student account matches that ID. Ask your school admin${adminSuffix(school)} to create the account, then add the student here.`
            : 'No student account matches that ID. Use "Create New Manually" to add them yourself.',
        )
      } else if (enrolledIds.includes(found.id)) {
        fail('That student is already in this class.')
      } else {
        setStudent(found)
        setFindFields({
          student_number: found.student_number ?? '',
          middle_name: found.middle_name ?? '',
          course: found.course ?? '',
          year_level: found.year_level ?? '',
          remarks: found.remarks ?? '',
          enrollment_status: normalizeEnrollmentStatus(found.enrollment_status),
          lrn: found.lrn ?? '',
          birthdate: found.birthdate ?? '',
        })
      }
    } catch (err) {
      fail(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function enroll() {
    if (isFull) { fail(`This class is full (max ${maxStudents} students).`); return }
    if (!findFields.student_number?.trim()) { fail('ID Number is required.'); return }
    const fieldProblem = rosterFieldsError(findFields)
    if (fieldProblem) { fail(fieldProblem); return }
    setBusy(true)
    fail(null)
    try {
      // The account already exists, so this is enrollment, not provisioning
      // (the provision endpoint used to mint a DUPLICATE account whenever the
      // email didn't match). Roster first, then the profile: the rules let a
      // teacher edit a student only once they handle them, and it is the
      // roster write that makes that true.
      await addToRoster(classId, [student.id])
      await updateDoc(doc(db, 'users', student.id), rosterPatch(findFields))
      onDone()
    } catch (err) {
      fail(err.message)
      setBusy(false)
    }
  }

  // --- Create new ---
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [createFields, setCreateFields] = useState(EMPTY_STUDENT_FIELDS)

  async function createStudent(e) {
    e.preventDefault()
    const problem =
      nameError(firstName, { label: 'First name' }) ||
      nameError(lastName, { label: 'Last name' }) ||
      emailError(newEmail) ||
      rosterFieldsError(createFields)
    if (problem) { fail(problem); return }
    if (!createFields.student_number?.trim()) { fail('ID Number is required.'); return }
    if (isFull) { fail(`This class is full (max ${maxStudents} students).`); return }
    setBusy(true)
    fail(null)
    try {
      // Client-side duplicate check before manual creation
      const existing = await findStudentByEmail(newEmail)
      if (existing) {
        fail('A student with this email is already registered. Please use the "Find Registered Student" tab to add them.')
        setBusy(false)
        return
      }

      const payload = {
        students: [
          {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: newEmail.trim().toLowerCase(),
            student_number: createFields.student_number.trim(),
            middle_name: createFields.middle_name?.trim() || '',
            course: createFields.course?.trim() || '',
            year_level: createFields.year_level?.trim() || '',
            remarks: createFields.remarks || '',
            enrollment_status: createFields.enrollment_status || 'AC',
            lrn: createFields.lrn?.trim() || '',
            birthdate: createFields.birthdate || '',
          }
        ]
      }
      const res = await api(`/api/classes/${classId}/students/provision`, {
        method: 'POST',
        body: payload
      })
      const { created, skipped, failed } = provisionOutcome(res)
      if (failed.length) throw new Error(firstReason(failed))
      if (!created.length && skipped.length) throw new Error(firstReason(skipped))
      announceLogins(created)
      onDone()
    } catch (err) {
      fail(err.message)
      setBusy(false)
    }
  }

  const tabBtn = (id, label) => (
    <button
      type="button"
      onClick={() => { setTab(id); fail(null); setStudent(null) }}
      style={{
        flex: 1,
        padding: '8px 0',
        fontSize: 13,
        fontWeight: 600,
        border: 'none',
        borderBottom: tab === id ? '2px solid #0E2A5C' : '2px solid transparent',
        background: 'transparent',
        color: tab === id ? '#0E2A5C' : '#6A7A95',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  const renderRosterFields = (f, setF) => {
    const handleSet = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }))
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>ID Number <span className="text-red-500">*</span></label>
            <input required className="ak-input" placeholder="Student ID" value={f.student_number} onChange={handleSet('student_number')} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Middle name <span style={optHint}>(opt)</span></label>
            <input className="ak-input" value={f.middle_name} onChange={handleSet('middle_name')} style={fieldStyle} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Program <span style={optHint}>(opt)</span></label>
            <input className="ak-input" placeholder="e.g. BSIT / JHS / Grade School" value={f.course} onChange={handleSet('course')} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Year</label>
            <input className="ak-input" placeholder="e.g. 1st Year / Grade 10" value={f.year_level} onChange={handleSet('year_level')} style={fieldStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Remarks <span style={optHint}>(opt)</span></label>
          <select className="ak-input" value={f.remarks} onChange={handleSet('remarks')} style={{ ...fieldStyle, cursor: 'pointer' }}>
            <option value="">—</option>
            {REMARKS_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div style={{ borderTop: '1px solid rgba(14,42,92,0.1)', margin: '16px 0' }} />

        <div>
          <label style={labelStyle}>Enrollment status</label>
          <select className="ak-input" value={f.enrollment_status} onChange={handleSet('enrollment_status')} style={{ ...fieldStyle, cursor: 'pointer' }}>
            {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label} ({value})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>LRN <span style={optHint}>(basic ed, opt)</span></label>
            <input className="ak-input" placeholder="12-digit LRN" value={f.lrn} onChange={handleSet('lrn')} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Birthdate</label>
            <input className="ak-input" type="date" max={TODAY_ISO} value={f.birthdate} onChange={handleSet('birthdate')} style={{ ...fieldStyle, cursor: 'pointer' }} />
          </div>
        </div>
      </>
    )
  }

  return (
    <div {...overlayProps} className="fixed inset-0 bg-slate-900/50 z-200 overflow-y-auto">
      <div {...panelProps} className="flex min-h-full items-center justify-center p-4 py-8">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">Add Student</h3>

        {/* Tab switcher -- one tab is no choice, so a school-issued teacher
            sees no switcher at all rather than a lone disabled-looking tab. */}
        {!schoolIssued && (
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(14,42,92,0.1)' }}>
            {tabBtn('find', 'Find Registered Student')}
            {tabBtn('create', 'Create New Manually')}
          </div>
        )}

        {isFull && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            This class has reached its maximum of {maxStudents} students.
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {tab === 'find' ? (
          <div className="space-y-4">
            <form onSubmit={lookup} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Student ID or LRN"
                value={idInput}
                onChange={(e) => setIdInput(e.target.value)}
                className={`${inputCls} flex-1`}
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-medium transition hover:brightness-110 disabled:opacity-50"
                style={{ background: '#0E2A5C', color: '#FAFAF6', border: 'none', cursor: 'pointer', borderRadius: 9 }}
              >
                Find
              </button>
            </form>
            {student && (
              <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                <p className="font-medium text-slate-800">
                  {student.last_name}, {student.first_name}
                  <span className="text-slate-400 font-normal"> · {student.login_id ?? student.email}</span>
                </p>
                {renderRosterFields(findFields, setFindFields)}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={enroll}
                    disabled={busy || isFull}
                    className="w-full rounded-lg px-4 py-2 font-medium transition hover:brightness-110 disabled:opacity-50"
                    style={{ background: '#0E2A5C', color: '#FAFAF6', border: 'none', cursor: 'pointer', borderRadius: 9 }}
                  >
                    {busy ? 'Adding…' : 'Add to class'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
            {!student && (
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={createStudent} className="space-y-4">
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              Creates the student's sign-in account and adds them to this class. They start on the password <code className="bg-slate-100 px-1 rounded text-[11px]">pass1234</code> — nothing is emailed, so pass it on yourself and have them change it.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>First name <span className="text-red-500">*</span></label>
                <input required className="ak-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Last name <span className="text-red-500">*</span></label>
                <input required className="ak-input" value={lastName} onChange={(e) => setLastName(e.target.value)} style={fieldStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Email <span className="text-red-500">*</span></label>
              <input required type="email" className="ak-input" placeholder="student@email.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={fieldStyle} />
            </div>

            {renderRosterFields(createFields, setCreateFields)}

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="submit"
                disabled={busy || isFull}
                className="w-full rounded-lg px-4 py-2 font-medium transition hover:brightness-110 disabled:opacity-50"
                style={{ background: '#0E2A5C', color: '#FAFAF6', border: 'none', cursor: 'pointer', borderRadius: 9 }}
              >
                {busy ? 'Creating…' : 'Create'}
              </button>
              <SlowHint show={busy} />
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </form>
        )}
      </div>
      </div>
    </div>
  )
}

/* The guardians linked to one student, with a way to remove one.
   Codes are minted by the student and redeemed in the parent app, so the
   teacher's part is oversight: see who is attached and cut a link that should
   not be there. Teachers may read and delete guardian_links and may mark the
   code's revoked list (firestore.rules), which is what revokeGuardianLink
   does -- a removed guardian cannot re-link with the same six characters. */
function GuardiansSection({ student }) {
  const queryClient = useQueryClient()
  const queryKey = ['fs-guardians', student.id]
  const { data: links, isLoading, isError } = useQuery({ queryKey, queryFn: () => listMyGuardians(student.id) })
  const [busyId, setBusyId] = useState(null)

  async function revoke(link) {
    const who = link.guardian_name ?? link.guardian_email ?? 'this guardian'
    if (!(await confirmDialog({
      title: `Remove ${who} as ${student.first_name}'s guardian?`,
      message: `They lose access to ${student.first_name}'s records at once and cannot re-link with the same code. The student can issue a new code later if that changes.`,
      confirmLabel: 'Remove guardian',
      tone: 'danger',
    }))) return
    setBusyId(link.link_id)
    try {
      await revokeGuardianLink(link.link_id)
      toast.success(`${who} no longer has access to ${student.first_name}'s records.`)
      queryClient.invalidateQueries({ queryKey })
    } catch {
      toast.error('The guardian could not be removed. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Linked guardians</span>
        {links && <span className="text-xs text-slate-500">{links.length}</span>}
      </div>
      {isLoading ? (
        <p className="mt-2 text-xs text-slate-500">Loading…</p>
      ) : isError ? (
        <p className="mt-2 text-xs text-red-600">Guardians could not be loaded right now.</p>
      ) : links.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          No guardian is linked. The student shares a code from their Parental Access panel, and the parent redeems it in the ActivKlass app.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {links.map((l) => (
            <li key={l.link_id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm text-slate-800">
                  {l.guardian_name ?? l.guardian_email ?? 'Guardian'}
                  {l.relationship_type && <span className="text-slate-500"> · {l.relationship_type}</span>}
                </div>
                <div className="text-xs text-slate-500">
                  {l.status === 'approved' ? 'Approved' : "Pending the student's approval"}
                  {l.guardian_email && l.guardian_name ? ` · ${l.guardian_email}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => revoke(l)}
                disabled={busyId === l.link_id}
                className="shrink-0 rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {busyId === l.link_id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* Edit roster fields on one student (rules allow teachers to maintain these). */
// 2026-06-20: Added first_name and last_name fields so teachers can correct student names
function EditStudentModal({ student, classId, onClose, onDone }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Edit student', closeOnBackdrop: false })
  // 2026-06-20: Name state — editable first and last name
  const [firstName, setFirstName] = useState(student.first_name ?? '')
  const [lastName, setLastName] = useState(student.last_name ?? '')
  const [fields, setFields] = useState({
    student_number: student.student_number ?? '',
    middle_name: student.middle_name ?? '',
    course: student.course ?? '',
    year_level: student.year_level ?? '',
    remarks: student.remarks ?? '',
    enrollment_status: student.enrollment_status ?? 'AC',
    lrn: student.lrn ?? '',
    birthdate: student.birthdate ?? '',
  })
  const [status, setStatus] = useState(student.status ?? 'active')
  const [error, setError] = useState(null)
  const fail = failWith(setError)
  const [busy, setBusy] = useState(false)

  async function save() {
    // 2026-06-20: Validate and save edited name alongside all other roster fields
    const problem =
      nameError(firstName, { label: 'First name' }) ||
      nameError(lastName, { label: 'Last name' }) ||
      rosterFieldsError(fields)
    if (problem) {
      fail(problem)
      return
    }
    setBusy(true)
    fail(null)
    try {
      await updateDoc(doc(db, 'users', student.id), {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        status,
        ...rosterPatch(fields),
      })
      onDone()
    } catch (err) {
      fail(err.message)
      setBusy(false)
    }
  }

  async function removeFromClass() {
    if (!(await confirmDialog({
      title: `Remove ${student.first_name} from this class?`,
      message: 'Their account is kept, along with their work in every other class. Only this roster changes.',
      confirmLabel: 'Remove',
      tone: 'danger',
    }))) return
    setBusy(true)
    try {
      await removeFromRoster(classId, student.id)
      onDone()
    } catch (err) {
      fail(err.message)
      setBusy(false)
    }
  }

  return (
    <div {...overlayProps} className="fixed inset-0 bg-slate-900/50 z-200 overflow-y-auto">
      <div {...panelProps} className="flex min-h-full items-center justify-center p-4 py-8">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">Edit Student</h3>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        {/* 2026-06-20: Name fields — teachers can now correct first and last name */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">First name <span className="text-red-400">*</span></span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={`${inputCls} w-full mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Last name <span className="text-red-400">*</span></span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={`${inputCls} w-full mt-1`}
            />
          </label>
        </div>
        <StudentFields fields={fields} setFields={setFields} />
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Academic progress</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={`${inputCls} w-full mt-1 bg-white`}
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <GuardiansSection student={student} />
        <div className="flex gap-3 justify-between pt-2">
          <button
            onClick={removeFromClass}
            disabled={busy}
            className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-sm hover:bg-red-50 disabled:opacity-50"
          >
            Remove from class
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="rounded-lg px-4 py-2 font-medium transition hover:brightness-110 disabled:opacity-50"
              style={{ background: '#0E2A5C', color: '#FAFAF6', border: 'none', cursor: 'pointer' }}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

/* The school's contact address, in parentheses, when the school document
   carries one -- so "ask your school admin" names someone reachable rather
   than an office the teacher has to go find. Empty string when it does not,
   which is every solo teacher and any school seeded before the field. */
function adminSuffix(school) {
  return school?.contact_email ? ` (${school.contact_email})` : ''
}

/* CSV roster: matches each row against an EXISTING student account by
   student_number, then lrn, then email, and enrolls the matches. Never
   creates accounts — under the issued-login scheme the admin makes accounts,
   and a typo'd ID must surface as "no account", not become a duplicate
   student nobody can sign in as. Preview first, with unmatched rows named. */
function CsvUploadModal({ classId, enrolledIds, maxStudents, onClose, onDone }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Upload a roster CSV', closeOnBackdrop: false })
  const { profile, school } = useAuth()
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null) // { matched: [], already: [], unmatched: [] }
  const [error, setError] = useState(null)
  const fail = failWith(setError)
  const [busy, setBusy] = useState(false)

  async function handleFile(file) {
    setBusy(true)
    fail(null)
    setPreview(null)
    try {
      const rows = parseCsv(await file.text())
      if (rows.length < 2) throw new Error('CSV needs a header row plus at least one student')
      const header = rows[0].map((h) => h.trim().toLowerCase())
      const col = (name) => header.indexOf(name)
      if (col('student_number') === -1 && col('lrn') === -1) {
        throw new Error('CSV must have a "student_number" or "lrn" column — that ID is how each row is matched to a student account')
      }
      const entries = []
      for (const row of rows.slice(1)) {
        const cell = (name) => (col(name) === -1 ? '' : row[col(name)]?.trim() ?? '')
        const entry = {
          student_number: cell('student_number'),
          lrn: cell('lrn'),
          email: cell('email').toLowerCase(),
          first_name: cell('first_name'),
          last_name: cell('last_name'),
        }
        if (entry.student_number || entry.lrn || entry.email) entries.push(entry)
      }
      if (!entries.length) throw new Error('No rows with a student ID found under the header')

      const matched = []
      const already = []
      const unmatched = []
      const seen = new Set()
      // Sequential on purpose: a class roster is tens of rows, and each match
      // is one or two indexed equality reads. Parallel adds nothing but load.
      for (const entry of entries) {
        const label =
          `${entry.last_name}, ${entry.first_name}`.replace(/^, |, $/g, '').trim() ||
          entry.student_number || entry.lrn || entry.email
        const id = entry.student_number || entry.lrn
        let account = null
        let ambiguous = false
        if (id) {
          const picked = pickMatch(await findStudentsByNumber(id), profile?.school_id)
          account = picked.match
          ambiguous = picked.ambiguous
        }
        if (!account && !ambiguous && entry.email) {
          account = await findStudentByEmail(entry.email)
        }
        if (ambiguous) {
          unmatched.push({ label, id, reason: 'more than one account carries this ID' })
        } else if (!account) {
          unmatched.push({ label, id: id || entry.email, reason: 'no student account' })
        } else if (enrolledIds.includes(account.id) || seen.has(account.id)) {
          already.push({ label, account })
        } else {
          seen.add(account.id)
          matched.push({ label, account })
        }
      }
      setPreview({ matched, already, unmatched })
    } catch (err) {
      fail(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    const uids = preview.matched.map((m) => m.account.id)
    if (maxStudents > 0 && enrolledIds.length + uids.length > maxStudents) {
      fail(`This would put the class over its maximum of ${maxStudents} students. Remove some rows or raise the limit in class settings.`)
      return
    }
    setBusy(true)
    fail(null)
    try {
      // One request: the server puts the whole batch on the roster and
      // rewrites each student's teacher_ids, so they show up for this
      // teacher and on their own dashboards on the next load.
      await addToRoster(classId, uids)
      toast.success(`${uids.length} student${uids.length === 1 ? '' : 's'} added to the class.`)
      if (preview.unmatched.length) {
        toast.info(
          `${preview.unmatched.length} row${preview.unmatched.length === 1 ? ' was' : 's were'} not added — ` +
            `no matching account. Ask your school admin${adminSuffix(school)} to create those accounts, then upload again.`,
          { duration: 0 },
        )
      }
      onDone()
    } catch (err) {
      fail(err.message)
      setBusy(false)
    }
  }

  return (
    <div {...overlayProps} className="fixed inset-0 bg-slate-900/50 z-200 overflow-y-auto">
      <div {...panelProps} className="flex min-h-full items-center justify-center p-4 py-8">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">Bulk Upload Roster</h3>
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">Prepare your CSV file with these columns:</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-500">
            <li><code className="bg-slate-100 px-1 rounded text-xs">student_number</code> or <code className="bg-slate-100 px-1 rounded text-xs">lrn</code> — required, matches each row to the student's account</li>
            <li><code className="bg-slate-100 px-1 rounded text-xs">first_name</code>, <code className="bg-slate-100 px-1 rounded text-xs">last_name</code> — so unmatched rows are readable in the preview</li>
            <li><code className="bg-slate-100 px-1 rounded text-xs">email</code> — optional fallback for students who signed up themselves</li>
          </ul>
          <p className="text-xs text-slate-400">
            This upload only enrolls students who already have an account — it never creates one.
            Rows with no matching account are listed so you can ask your school admin to add them.
          </p>
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500">
                  <th className="px-3 py-2 font-medium border-b border-r border-slate-200">student_number</th>
                  <th className="px-3 py-2 font-medium border-b border-r border-slate-200">first_name</th>
                  <th className="px-3 py-2 font-medium border-b border-r border-slate-200">last_name</th>
                  <th className="px-3 py-2 font-medium border-b border-slate-200">lrn</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-slate-600">
                  <td className="px-3 py-1.5 border-r border-slate-200">2024-00187</td>
                  <td className="px-3 py-1.5 border-r border-slate-200">Juan</td>
                  <td className="px-3 py-1.5 border-r border-slate-200">Dela Cruz</td>
                  <td className="px-3 py-1.5">123456789012</td>
                </tr>
                <tr className="text-slate-600 bg-slate-50/60">
                  <td className="px-3 py-1.5 border-r border-slate-200">2024-00212</td>
                  <td className="px-3 py-1.5 border-r border-slate-200">Maria</td>
                  <td className="px-3 py-1.5 border-r border-slate-200">Santos</td>
                  <td className="px-3 py-1.5">987654321098</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-white file:px-4 file:py-2 file:font-medium hover:file:opacity-90 cursor-pointer"
        />
        {busy && !preview && <p className="text-sm text-slate-400">Matching students…</p>}

          {preview && (
            <>
              <div style={{ border: `1px solid ${line}`, borderRadius: 12, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
              {preview.matched.map((m, idx) => (
                <div key={`m${idx}`} className="flex justify-between" style={{ padding: '10px 14px', borderBottom: `1px solid ${line}`, fontSize: 13 }}>
                  <span style={{ color: ink }}>
                    {m.account.last_name}, {m.account.first_name}
                    <span style={{ color: faint }}> · {m.account.login_id ?? m.account.email}</span>
                  </span>
                  <span style={{ color: blueText, fontWeight: 600 }}>will be added</span>
                </div>
              ))}
              {preview.already.map((a, idx) => (
                <div key={`a${idx}`} className="flex justify-between" style={{ padding: '10px 14px', borderBottom: `1px solid ${line}`, fontSize: 13 }}>
                  <span style={{ color: muted }}>{a.label}</span>
                  <span style={{ color: muted, fontWeight: 600 }}>already in class</span>
                </div>
              ))}
              {preview.unmatched.map((u, idx) => (
                <div key={`u${idx}`} className="flex justify-between" style={{ padding: '10px 14px', borderBottom: `1px solid ${line}`, fontSize: 13 }}>
                  <span style={{ color: ink }}>
                    {u.label}
                    {u.id ? <span style={{ color: faint }}> · {u.id}</span> : null}
                  </span>
                  <span style={{ color: red, fontWeight: 600 }}>{u.reason}</span>
                </div>
              ))}
            </div>
            {preview.unmatched.length > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {preview.unmatched.length} row{preview.unmatched.length === 1 ? ' has' : 's have'} no
                matching student account and will not be added. Ask your school admin to create those
                accounts, then upload this file again.
              </p>
            )}
            <button
              onClick={commit}
              disabled={busy || preview.matched.length === 0}
              className="w-full rounded-lg px-4 py-2 font-medium transition hover:brightness-110 disabled:opacity-40"
              style={{ background: '#0E2A5C', color: '#FAFAF6', border: 'none', cursor: 'pointer' }}
            >
              {busy ? 'Adding…' : `Add ${preview.matched.length} student${preview.matched.length === 1 ? '' : 's'} to class`}
            </button>
          </>
        )}

        <button onClick={onClose} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50">
          Close
        </button>
      </div>
      </div>
    </div>
  )
}

// --- navy+gold Overview surface (matches the DC mock: stat cards + roster) ---

// Shared modal chrome for the roster dialogs (navy+gold, matches PostModal).
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }
const cardStyle = { width: '100%', maxWidth: 560, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }
const modalHeaderStyle = { padding: '22px 28px 18px', borderBottom: '1px solid rgba(14,42,92,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }
const iconSquare = { width: 36, height: 36, borderRadius: 10, background: navy, color: gold, display: 'grid', placeItems: 'center', flexShrink: 0 }
const modalTitle = { ...serif, fontSize: 24, margin: 0, color: ink, flex: 1 }
const closeBtn = { display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, background: 'transparent', border: 'none', color: faint, cursor: 'pointer' }
const modalBodyStyle = { padding: '22px 28px', overflowY: 'auto' }
const modalFooterStyle = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)', flexShrink: 0 }
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: ink, marginBottom: 7 }
const optHint = { color: faint, fontWeight: 400 }
const fieldStyle = { width: '100%', padding: '11px 13px', fontSize: 14, fontFamily: sans, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, transition: 'border-color 0.15s, box-shadow 0.15s' }
const alertStyle = { fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }
const codeStyle = { ...mono, background: 'rgba(14,42,92,0.06)', padding: '1px 5px', borderRadius: 5, fontSize: 12, color: navy }
const btnModalPrimary = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 22px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}` }
const btnModalGhost = { padding: '12px 22px', fontSize: 14, fontWeight: 600, fontFamily: sans, color: '#3A4A6B', background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer' }

const th = { padding: '12px 18px', fontSize: 11, fontWeight: 700, color: muted, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }
const td = { padding: '14px 18px', fontSize: 14, color: ink, verticalAlign: 'middle' }
const btnGhost = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 15px', fontSize: 13, fontWeight: 600, fontFamily: sans, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer' }
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 15px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: `0 2px 0 ${navyDeep}` }
const btnDanger = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 15px', fontSize: 13, fontWeight: 600, fontFamily: sans, color: red, background: '#FFFFFF', border: '1.5px solid rgba(192,57,43,0.3)', borderRadius: 10, cursor: 'pointer' }

const PILL_TONES = {
  green: { fg: green, bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.4)' },
  gray: { fg: muted, bg: 'rgba(14,42,92,0.06)', border: 'rgba(14,42,92,0.15)' },
  gold: { fg: goldDeep, bg: 'rgba(245,197,24,0.18)', border: 'rgba(245,197,24,0.55)' },
  blue: { fg: blueText, bg: 'rgba(63,169,245,0.12)', border: 'rgba(63,169,245,0.45)' },
}
function pillStyle(tone) {
  const m = PILL_TONES[tone] ?? PILL_TONES.gray
  return { display: 'inline-block', padding: '4px 11px', fontSize: 11, fontWeight: 700, borderRadius: 999, color: m.fg, background: m.bg, border: `1px solid ${m.border}`, whiteSpace: 'nowrap' }
}
const statusTone = (status) => (status === 'mastered' ? 'blue' : status === 'needs_remediation' ? 'gold' : 'green')

export default function ClassDetailPage() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [modal, setModal] = useState(null) // 'add' | 'csv' | student object
  const [error, setError] = useState(null)
  const fail = failWith(setError)
  const [rosterSearch, setRosterSearch] = useState('')
  const [rosterFilter, setRosterFilter] = useState('all')
  const [rosterSort, setRosterSort] = useState('az')
  const [accountBusy, setAccountBusy] = useState(null)
  const [notice, setNotice] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['class-detail', classId],
    queryFn: async () => {
      // Firestore-primary: read the class doc + roster (student fields live on
      // the users docs, written by the Add/Edit roster modals). No backend.
      const snap = await getDoc(doc(db, 'classes', classId))
      if (!snap.exists()) throw new Error('Class not found')
      const clazz = { id: snap.id, ...snap.data() }
      const ids = clazz.student_ids ?? []
      const users = ids.length ? await fetchUsersByIds(ids) : []
      const students = users
        .map((u) => ({
          ...u,
          student_id: u.id,
          enrollment_status: u.enrollment_status ?? 'AC',
          status: u.status ?? 'active',
        }))
        .sort((a, b) =>
          `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
        )
      return { clazz, students, summary: { total: students.length } }
    },
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['class-detail', classId] })
    setModal(null)
  }

  const [removeClass, removingClass] = useAsyncAction(deleteClass)

  async function deleteClass() {
    if (!(await confirmDialog({
      title: 'Delete this class section?',
      message: 'The roster list is lost. Student accounts are kept, and so is their work in other classes. This cannot be undone.',
      confirmLabel: 'Delete section',
      tone: 'danger',
      typeToConfirm: 'DELETE',
    }))) return
    try {
      await deleteClassSection(classId)
      navigate('/teacher/classes')
    } catch (err) {
      fail(err.message)
    }
  }

  // 2026-06-20: Quick remove from table row — does not open the edit modal
  async function handleRemoveStudent(s) {
    if (!(await confirmDialog({
      title: `Remove ${s.first_name} ${s.last_name} from this class?`,
      message: 'Their student account is kept - they simply stop appearing on this roster.',
      confirmLabel: 'Remove',
      tone: 'danger',
    }))) return
    try {
      await removeFromRoster(classId, s.id)
      queryClient.invalidateQueries({ queryKey: ['class-detail', classId] })
      queryClient.invalidateQueries({ queryKey: ['fs-classes'] })
    } catch (err) {
      fail(err.message)
    }
  }

  /**
   * Enable or disable a student's account from the roster.
   *
   * Both halves are required. users/{uid}.status keeps them out of the app --
   * the backend rejects any request from a non-active user -- but Firebase Auth
   * still accepts their password, so status alone leaves a working login.
   * setAccountDisabled is what actually closes it, and it revokes live sessions
   * rather than waiting for the token to expire.
   *
   * The order is chosen so a half-completed change fails CLOSED:
   *   disabling -> Auth first, so a failure after it leaves them locked out but
   *                still shown as active (safe, and visibly wrong)
   *   enabling  -> status first, so a failure after it leaves them still unable
   *                to sign in rather than signed in with no access
   */
  async function handleToggleAccount(s) {
    const currentlyActive = (s.status ?? 'active') === 'active'
    const who = `${s.first_name} ${s.last_name}`.trim()
    const ask = currentlyActive
      ? {
          title: `Disable ${who}'s account?`,
          message: 'They are signed out immediately and cannot log in until you re-enable it. They stay on this roster.',
          confirmLabel: 'Disable account',
          tone: 'danger',
        }
      : {
          title: `Re-enable ${who}'s account?`,
          message: 'They will be able to sign in again straight away.',
          confirmLabel: 'Re-enable',
        }
    if (!(await confirmDialog(ask))) return

    setAccountBusy(s.id)
    fail(null)
    setNotice(null)
    try {
      let result
      if (currentlyActive) {
        result = await setAccountDisabled(s.id, true)
        await updateDoc(doc(db, 'users', s.id), { status: 'inactive' })
      } else {
        await updateDoc(doc(db, 'users', s.id), { status: 'active' })
        result = await setAccountDisabled(s.id, false)
      }
      queryClient.invalidateQueries({ queryKey: ['class-detail', classId] })

      /* Disabling is an ACCOUNT action, not a class one: it signs them out of
         the whole platform. The backend reports how many other teachers' classes
         they are in so we can say so rather than letting it surprise someone. */
      if (currentlyActive && result?.also_enrolled_elsewhere > 0) {
        setNotice(
          `${who} is also enrolled in ${result.also_enrolled_elsewhere} class(es) taught by ` +
            'someone else. Disabling the account signs them out of those too.',
        )
      }
    } catch (err) {
      /* The Firestore write and the Auth call are separate, so say which half
         failed -- one of them may already have gone through. */
      if (err.code === 'not_on_your_roster') {
        fail(`${who} is not in any of your classes, so you cannot change their login.`)
      } else if (err.status === 403) {
        fail(
          `Could not change ${who}'s login: ${err.message}. Their roster status was not changed.`,
        )
      } else if (err.code === 'no_auth_account') {
        fail(
          `${who} has no sign-in account yet — they were added to the roster but have never ` +
            'signed up, so there is no login to disable.',
        )
      } else {
        fail(err.message)
      }
      queryClient.invalidateQueries({ queryKey: ['class-detail', classId] })
    } finally {
      setAccountBusy(null)
    }
  }

  if (isLoading) return <SkeletonTable rows={8} cols={6} label="Loading roster" />
  if (isError || !data) return <p className="text-red-600">Class not found.</p>

  const { clazz, students } = data
  const maxStudents = clazz.max_students ?? 0
  const activeCount = students.filter((s) => (s.enrollment_status ?? 'AC') === 'AC').length
  const inactiveCount = students.length - activeCount

  const filteredStudents = students
    .filter((s) => {
      const name = `${s.last_name ?? ''} ${s.first_name ?? ''}`.toLowerCase()
      const matchSearch = !rosterSearch ||
        name.includes(rosterSearch.toLowerCase()) ||
        (s.email ?? '').toLowerCase().includes(rosterSearch.toLowerCase())
      const enroll = s.enrollment_status ?? 'AC'
      const prog = s.status ?? 'active'
      const matchFilter =
        rosterFilter === 'all' ||
        (rosterFilter === 'AC' && enroll === 'AC') ||
        (rosterFilter === 'IN' && enroll === 'IN') ||
        (rosterFilter === 'needs_remediation' && prog === 'needs_remediation') ||
        (rosterFilter === 'mastered' && prog === 'mastered')
      return matchSearch && matchFilter
    })
    .sort((a, b) => {
      const nameA = `${a.last_name ?? ''} ${a.first_name ?? ''}`.toLowerCase()
      const nameB = `${b.last_name ?? ''} ${b.first_name ?? ''}`.toLowerCase()
      return rosterSort === 'az' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
    })

  return (
    <div>
      {/* Stat cards (matches the DC mock's Overview) */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <MetricCard label="Students" value={students.length} Icon={Users} tint="rgba(14,42,92,0.07)" iconColor={navy} />
        <MetricCard label="Active (AC)" value={activeCount} valueColor={green} Icon={Check} tint="rgba(31,138,91,0.1)" iconColor={green} />
        <MetricCard label="Inactive (IN)" value={inactiveCount} Icon={Clock} tint="rgba(245,197,24,0.15)" iconColor={goldDeep} />
        <MetricCard
          label="Capacity"
          value={
            <>
              {students.length} <span style={{ color: '#9AA6BD' }}>/ {maxStudents || '—'}</span>
            </>
          }
          sub="students enrolled"
          Icon={Layers}
          tint="rgba(63,169,245,0.13)"
          iconColor={blueText}
        />
      </div>

      {clazz.syllabus_file && (
        <a
          href={clazz.syllabus_file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:border-slate-300"
          style={{ color: '#0E2A5C' }}
        >
          📄 Syllabus file: {clazz.syllabus_file.name}
        </a>
      )}

      {error && (
        <p role="alert" className="mt-4" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>{error}</p>
      )}

      {notice && (
        <p role="status" className="mt-4" style={{ fontSize: 13, color: goldDeep, background: 'rgba(212,160,23,0.10)', border: '1px solid rgba(212,160,23,0.35)', borderRadius: 10, padding: '10px 12px' }}>{notice}</p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 mt-6 overflow-x-auto">
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-semibold text-slate-800">
              Roster <span className="text-sm font-normal text-slate-400">· {students.length} student{students.length === 1 ? '' : 's'}</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setModal('csv')}
                className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-slate-50" style={{ borderColor: 'rgba(14,42,92,0.2)', color: '#0E2A5C' }}
              >
                Bulk Upload
              </button>
              <button
                onClick={() => setModal('add')}
                className="rounded-lg px-4 py-2 text-sm font-medium transition hover:brightness-110" style={{ background: '#0E2A5C', color: '#FAFAF6', border: 'none', cursor: 'pointer' }}
              >
                Add Student
              </button>
              <button
                onClick={removeClass}
                disabled={removingClass}
                title="Delete class"
                className="rounded-lg border border-red-200 text-red-600 px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-40"
              >
                {removingClass ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search by name or email…"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              className="flex-1 min-w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E2A5C]/40"
            />
            <select
              value={rosterFilter}
              onChange={(e) => setRosterFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0E2A5C]/40"
            >
              <option value="all">All students</option>
              <option value="AC">Active (AC)</option>
              <option value="IN">Inactive (IN)</option>
              <option value="needs_remediation">Needs Remediation</option>
              <option value="mastered">Mastered</option>
            </select>
            <select
              value={rosterSort}
              onChange={(e) => setRosterSort(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0E2A5C]/40"
            >
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
          </div>
        </div>
        {students.length === 0 ? (
          <div style={{ padding: '56px 24px', textAlign: 'center', color: faint, fontSize: 14 }}>
            No students yet. Add them by ID or email, or upload a CSV roster.
          </div>
        ) : filteredStudents.length === 0 ? (
          <p className="p-8 text-center text-slate-400">No students match your search or filter.</p>
        ) : (
          /* min-w so the columns keep their widths and scroll, rather than
             crushing into each other on a phone. */
          <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="text-left text-slate-700 border-b border-slate-100">
                <th className="px-5 py-2.5 font-semibold">ID No.</th>
                <th className="px-5 py-2.5 font-semibold">Name</th>
                <th className="px-5 py-2.5 font-semibold">Program / Year</th>
                <th className="px-5 py-2.5 font-semibold">Remarks</th>
                <th className="px-5 py-2.5 font-semibold text-center">Enrollment</th>
                <th className="px-5 py-2.5 font-semibold">Progress</th>
                {/* 2026-06-20: Actions column header — Edit and Remove per row */}
                <th className="px-5 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((s) => {
                const status = s.status ?? 'active'
                const enrollment = s.enrollment_status ?? 'AC'
                const courseYear = [s.course, s.year_level].filter(Boolean).join(' · ')
                return (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3 text-slate-600 font-mono text-xs">{s.student_number ?? '—'}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-700">
                        {s.last_name}, {s.first_name}
                        {s.middle_name ? ` ${s.middle_name}` : ''}
                      </p>
                      <p className="text-xs text-slate-400">{s.email}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{courseYear || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{s.remarks ?? '—'}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ENROLLMENT_STYLE[enrollment]}`}>
                        {enrollment}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
                        {/* Falls back for the account values ('inactive',
                            'pending') that STATUS_LABELS does not carry —
                            otherwise a disabled student rendered as blank. */}
                        {STATUS_LABELS[status] ?? ACCOUNT_STATUS_LABELS[status] ?? status}
                      </span>
                    </td>
                    {/* 2026-06-20: Edit opens modal with name + roster fields; Remove immediately removes from class */}
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => setModal(s)}
                          className="text-xs font-medium hover:underline"
                          style={{ color: '#0E2A5C' }}
                        >
                          Edit
                        </button>
                        {/* Enable/Disable the login itself. Writes users.status
                            AND toggles the Auth account -- status alone leaves
                            a working password. */}
                        <button
                          onClick={() => handleToggleAccount(s)}
                          disabled={accountBusy === s.id}
                          className="text-xs font-medium hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ color: status === 'active' ? goldDeep : green }}
                        >
                          {accountBusy === s.id
                            ? 'Working…'
                            : status === 'active'
                              ? 'Disable'
                              : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleRemoveStudent(s)}
                          className="text-xs font-medium hover:underline text-red-500"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {modal === 'add' && (
        <AddStudentModal
          classId={classId}
          enrolledIds={clazz.student_ids ?? []}
          maxStudents={clazz.max_students ?? 0}
          onClose={() => setModal(null)}
          onDone={refresh}
        />
      )}
      {modal === 'csv' && (
        <CsvUploadModal
          classId={classId}
          enrolledIds={clazz.student_ids ?? []}
          maxStudents={clazz.max_students ?? 0}
          onClose={() => setModal(null)}
          onDone={refresh}
        />
      )}
      {modal && typeof modal === 'object' && (
        <EditStudentModal
          student={modal}
          classId={classId}
          onClose={() => setModal(null)}
          onDone={refresh}
        />
      )}
    </div>
  )
}
