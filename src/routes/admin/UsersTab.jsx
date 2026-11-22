import { useTransientMessage } from '@/hooks/useTransientMessage'
import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/useAuth'
import { adminUsersKey, useAdminUsers, setUserStatus } from '@/hooks/useAdminUsers'
import { studentAccountsDestination } from '@/lib/studentAccountsNavigation'
import {
  createUser, resetPassword, setAccountDisabled,
  adminSchoolKey, fetchSchoolSettings, saveSchoolSettings,
} from '@/lib/admin'
import { issuedLoginId } from '@/lib/logins'
import { downloadCsv, stampedName } from '@/lib/csv'
import { navy, navyDeep, ink, muted, faint, green, red, line, mono, goldDeep, blueText, sansFamily as sans } from '@/theme'
import { School, CalendarCheck, UserPlus, Users, Key, UserX, UserCheck } from '@/components/icons'
import { ROLES, MIN_PASSWORD, card, field, btnPrimary, btnGhost, th } from './ui'
import {
  emailError, nameError, tempPasswordError,
  idNumberError, lrnError, schoolNameError, schoolAbbrError, birthdateError, BIRTHDATE_HINT,
} from '@/lib/validation'
import { accountsNamed, accountWithEmail, describeAccount } from './duplicates'
import Notice from './Notice'
import RolePicker from './RolePicker'
import CardHead from './CardHead'
import { confirmDialog, promptDialog } from '@/components/ui/dialogs'
import { PASSWORD_REQUIREMENTS } from '@/routes/login'
import BulkUpload from './BulkUpload'
import { SUPPORT_EMAIL } from './SubscriptionTab'
import { SkeletonTable } from '@/components/ui/Skeleton'

const ROLE_TINT = {
  admin: { fg: navy, bg: 'rgba(14,42,92,0.08)' },
  teacher: { fg: green, bg: 'rgba(31,138,91,0.10)' },
  student: { fg: '#1E6FB0', bg: 'rgba(30,111,176,0.10)' },
  parent: { fg: '#8B6A00', bg: 'rgba(245,197,24,0.18)' },
}

function Pill({ tint, style, children }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      color: tint.fg, background: tint.bg, borderRadius: 20, padding: '3px 10px',
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </span>
  )
}

/* ─────────────────────────── login prefix ─────────────────────────── */

/**
 * The school's identity: its full official name and the abbreviation used as
 * the login prefix. Teachers and students the admin creates need no email of
 * their own: their login is issued as <abbreviation>-<last 6 digits of LRN /
 * student number / employee ID>, e.g. ucb-789012 — no domain, since
 * ActivKlass has none. Changing the abbreviation only shapes logins issued
 * from that point on — existing accounts keep theirs.
 *
 * Four states, kept apart on purpose. `settings` is undefined both while the
 * request is in flight and after it fails, and this card used to read that as
 * "not linked to a school" and say so — a confident claim about the account,
 * made when the only true statement is that we have not heard back. An admin
 * whose school was linked all along was told to go fix a link that was not
 * broken, with the actual failure invisible.
 */
/* A locked School Name / Abbreviation (T-255) was readOnly but still took a
   click and Tab: it showed a focus ring and a caret, so it looked editable
   when it is not (owner, 2026-11-17). Locked now means disabled -- the only
   state a click on the wrapping <label> cannot focus either (readOnly plus
   pointer-events alone still let the label put a caret in it) -- no tab stop,
   and a grey "set, not editable" fill. The text keeps full ink instead of the
   browser's faded disabled grey (WebkitTextFillColor covers Safari/Chrome).
   Screen readers still read label and value; the support link says how to
   change it. */
const lockedField = {
  background: '#F2F4F7', borderColor: 'rgba(14,42,92,0.10)', color: ink,
  WebkitTextFillColor: ink, opacity: 1,
  pointerEvents: 'none', cursor: 'default', outline: 'none', boxShadow: 'none',
}

export function LoginPrefixCard({ settings, pending, error: loadError, onRetry, onSaved }) {
  const school = settings?.school
  // null = untouched, show the saved value
  const [name, setName] = useState(null)
  const [abbr, setAbbr] = useState(null)
  const [error, setError] = useTransientMessage('')
  const [done, setDone] = useState('')

  const mut = useMutation({
    mutationFn: saveSchoolSettings,
    onSuccess: (res) => {
      setName(null)
      setAbbr(null)
      setError('')
      setDone(`Saved. New teacher and student logins will start with “${res.login_prefix}-”.`)
      onSaved()
    },
    onError: (e) => { setError(e.message); setDone('') },
  })

  const shownName = name ?? school?.name ?? ''
  const shownAbbr = abbr ?? school?.login_prefix ?? ''
  // T-255 (owner decision 2026-11-14): once the school has its prefix -- set
  // at registration and carried through approval -- name and abbreviation
  // are view-only; a correction goes through support, since every issued
  // login is built from the prefix. A school with none yet (pre-T-169) still
  // sets it here once.
  const locked = !!school?.login_prefix

  function submit(e) {
    e.preventDefault()
    if (locked) return
    setDone('')
    const problem = schoolNameError(shownName) || schoolAbbrError(shownAbbr)
    if (problem) return setError(problem)
    setError('')
    mut.mutate({ name: shownName.trim(), prefix: shownAbbr.trim().toLowerCase() })
  }

  return (
    <form onSubmit={submit} style={{ ...card, padding: 22 }}>
      <CardHead
        icon={<School className="w-5 h-5" style={{ color: goldDeep }} />}
        tint="rgba(245,197,24,0.14)"
        title="School & Login Prefix"
        sub={
          loadError ? 'Your school’s details could not be loaded, so this card cannot show them yet. Nothing has been changed.'
            : pending ? 'Checking which school this account manages…'
            : locked ? 'Set when your school registered. Every issued login starts with this prefix, a dash, then the last six digits of the LRN (students) or employee ID (teachers).'
            : school ? 'Enter your school’s full name and the abbreviation used beside it — the abbreviation is the prefix of every issued login: prefix, a dash, then the last six digits of the LRN (students) or employee ID (teachers). Existing logins are never changed.'
            : 'This admin account is not linked to a school yet, so a login prefix cannot be set.'
        }
        style={{ marginBottom: school || loadError ? 16 : 0 }}
      />

      {loadError && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}><Notice>{loadError.message}</Notice></div>
          <button type="button" style={btnGhost} onClick={onRetry}>Try Again</button>
        </div>
      )}
      {school && (
        <div style={{ display: 'grid', gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: ink, display: 'flex', flexDirection: 'column', gap: 6 }}>
            School Name
            <input style={{ ...field, padding: '10px 14px', width: '100%', boxSizing: 'border-box', ...(locked ? lockedField : {}) }}
                   value={shownName} readOnly={locked} disabled={locked} tabIndex={locked ? -1 : undefined}
                   onChange={(e) => { setName(e.target.value); setDone('') }}
                   placeholder="e.g. University of Cebu-Banilad" />
          </label>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: ink, display: 'flex', flexDirection: 'column', gap: 6 }}>
              Abbreviation
              <input style={{ ...field, width: 150, padding: '10px 14px', ...(locked ? lockedField : {}) }}
                     value={shownAbbr} readOnly={locked} disabled={locked} tabIndex={locked ? -1 : undefined}
                     onChange={(e) => { setAbbr(e.target.value); setDone('') }}
                     placeholder="e.g. UCB" />
            </label>
            <span style={{ ...mono, fontSize: 12.5, color: faint, paddingBottom: 11 }}>
              → {(shownAbbr.trim().toLowerCase() || 'prefix')}-789012
            </span>
          </div>
          {locked ? (
            <span style={{ fontSize: 12.5, color: muted }}>
              Need to change either? <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: blueText }}>Contact ActivKlass support</a>.
            </span>
          ) : (
            <div>
              <button type="submit" style={btnPrimary} disabled={mut.isPending}>
                {mut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
          <div style={{ minWidth: 200 }}>
            <Notice>{error}</Notice>
            <Notice tone="ok">{done}</Notice>
          </div>
        </div>
      )}
    </form>
  )
}

/* ─────────────────────────── term dates ─────────────────────────── */

/**
 * T-138: Per-school term dates for automatic class archiving.
 *
 * Covers:
 *  - School year end (K-12 classes, where semester is null)
 *  - 1st Semester end (College classes)
 *  - 2nd Semester end (College classes)
 *  - Midyear / Summer end (College classes)
 *
 * Classes past their term end date archive automatically to keep teachers'
 * active classes uncluttered. A school with no dates set simply continues
 * manual archiving without warnings.
 */
export function TermDatesCard({ settings, pending, error: loadError, onRetry, onSaved }) {
  const school = settings?.school
  const savedDates = school?.term_dates ?? {}

  const [dates, setDates] = useState(null)
  const [error, setError] = useTransientMessage('')
  const [done, setDone] = useState('')

  const mut = useMutation({
    // T-163: this card owns term dates only. It used to resend the school's
    // name and abbreviation just to satisfy the endpoint's all-or-nothing
    // shape -- which meant a school with no abbreviation set yet could never
    // save term dates at all (the endpoint validated the sent prefix "" and
    // refused). The endpoint now validates only what it is given, so this
    // sends term_dates alone.
    mutationFn: (term_dates) => saveSchoolSettings({ term_dates }),
    onSuccess: () => {
      setDates(null)
      setError('')
      setDone('Saved. Classes past their term date will archive automatically.')
      onSaved()
    },
    onError: (e) => { setError(e.message); setDone('') },
  })

  const currentDates = dates ?? savedDates

  function updateField(key, val) {
    setDone('')
    setDates((prev) => ({ ...(prev ?? savedDates), [key]: val }))
  }

  function submit(e) {
    e.preventDefault()
    setDone('')
    setError('')
    mut.mutate(currentDates)
  }

  return (
    <form onSubmit={submit} style={{ ...card, padding: 22 }}>
      <CardHead
        icon={<CalendarCheck className="w-5 h-5" style={{ color: green }} />}
        tint="rgba(31,138,91,0.12)"
        title="Term End Dates & Automatic Archiving"
        sub={
          loadError ? 'Your school’s details could not be loaded, so term dates cannot be shown yet.'
            : pending ? 'Checking term dates…'
            : school ? 'Set when each term ends so completed classes archive automatically. Classes still in use with recent activity are kept active. If left blank, classes remain active until manually archived.'
            : 'This admin account is not linked to a school yet, so term dates cannot be set.'
        }
        style={{ marginBottom: school || loadError ? 16 : 0 }}
      />

      {loadError && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}><Notice>{loadError.message}</Notice></div>
          <button type="button" style={btnGhost} onClick={onRetry}>Try Again</button>
        </div>
      )}
      {school && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, alignItems: 'end' }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: ink, display: 'flex', flexDirection: 'column', gap: 6 }}>
            School Year End (K-12)
            <input
              type="date"
              style={{ ...field, padding: '9px 12px' }}
              value={currentDates.school_year_end ?? ''}
              onChange={(e) => updateField('school_year_end', e.target.value)}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: ink, display: 'flex', flexDirection: 'column', gap: 6 }}>
            1st Semester End
            <input
              type="date"
              style={{ ...field, padding: '9px 12px' }}
              value={currentDates.first_sem_end ?? ''}
              onChange={(e) => updateField('first_sem_end', e.target.value)}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: ink, display: 'flex', flexDirection: 'column', gap: 6 }}>
            2nd Semester End
            <input
              type="date"
              style={{ ...field, padding: '9px 12px' }}
              value={currentDates.second_sem_end ?? ''}
              onChange={(e) => updateField('second_sem_end', e.target.value)}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: ink, display: 'flex', flexDirection: 'column', gap: 6 }}>
            Midyear / Summer End
            <input
              type="date"
              style={{ ...field, padding: '9px 12px' }}
              value={currentDates.summer_end ?? ''}
              onChange={(e) => updateField('summer_end', e.target.value)}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, gridColumn: '1 / -1', marginTop: 4 }}>
            <button type="submit" style={btnPrimary} disabled={mut.isPending}>
              {mut.isPending ? 'Saving…' : 'Save Term Dates'}
            </button>
            <Notice>{error}</Notice>
            <Notice tone="ok">{done}</Notice>
          </div>
        </div>
      )}
    </form>
  )
}

/* ─────────────────────────── create user ─────────────────────────── */

const labelStyle = { fontSize: 13, fontWeight: 600, color: ink }
/** Red star after the label of a field the form will not accept blank. */
function Req() {
  return <span aria-hidden="true" style={{ color: red, marginLeft: 3 }}>*</span>
}
const helperStyle = { display: 'block', marginTop: 5, fontSize: 12, fontWeight: 400, color: faint, lineHeight: 1.4 }

/** A titled group of fields on the Add User form. */
function FormSection({ title, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 10px' }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: navy, whiteSpace: 'nowrap' }}>{title}</h4>
        <div aria-hidden="true" style={{ flex: 1, height: 1, background: 'rgba(14,42,92,0.3)' }} />
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
        {children}
      </div>
    </div>
  )
}

/* "Grade 9 - Rizal" -> ['Grade 9', 'Rizal']; "BSIT - 3rd Year" -> ['BSIT',
   '3rd Year']; no dash -> [text, '']. One field per the manuscript's Add
   user mockup (Figure 49), split for storage. */
function splitPair(text) {
  const [head, ...rest] = String(text ?? '').split('-')
  return [head.trim(), rest.join('-').trim()]
}

function CreateUserForm({ onCreated, settings, users, role }) {
  // No default role: an admin who never touched either segmented control in
  // AddUserSection could not reach this form at all -- there is nothing here
  // that silently picks a role on their behalf. Admin creation is gone
  // outright (owner, 2026-10-02: "creating an admin wont happen anymore,
  // only teacher and student now"), so `role` is always 'teacher' or
  // 'student' by the time this component mounts.
  const blank = {
    firstName: '', middleName: '', lastName: '', password: '',
    level: 'g12', studentNumber: '', gradeSection: '', courseYear: '',
    birthdate: '', employeeNumber: '', department: '', personalEmail: '',
  }
  const [form, setForm] = useState(blank)
  const [error, setError] = useTransientMessage('')
  const [done, setDone] = useState('')

  const prefix = settings?.school?.login_prefix ?? ''
  // Grade 12 & below sign in by the last six digits of their LRN; college
  // learners carry no LRN (manuscript Fig. 49-50) so theirs come from the
  // student number. Teachers use their employee ID.
  const isG12 = form.level === 'g12'
  const idSource = role === 'student' ? form.studentNumber : form.employeeNumber
  const loginPreview = issuedLoginId(prefix, idSource)

  const mut = useMutation({
    mutationFn: createUser,
    onSuccess: (res) => {
      const login = res.user.login_id ?? res.user.email
      // The server names the temporary password it used in `initial_password`
      // (T-267 revision: the school's standard one), so no client ever carries
      // the value itself. Falling back to the typed value covers an admin who
      // chose one, which the server deliberately does not echo back.
      const pw = res.user.initial_password ?? form.password
      // The password is temporary: is_temp_password and the server-side
      // must_change_password claim hold them on /change-password until they
      // pick their own, so the banner has to say that, not just the string.
      setDone(
        `Created. They sign in as ${login} with the password “${pw}” — give them both directly, nothing is emailed. `
        + 'They will be asked to choose a new password the first time they sign in.'
      )
      setForm(blank)
      setError('')
      onCreated({ role, user: res.user })
    },
    onError: (e) => { setError(e.message); setDone('') },
  })

  async function submit(e) {
    e.preventDefault()
    setDone('')
    const problem =
      nameError(form.firstName, { label: 'First name' }) ||
      nameError(form.middleName, { label: 'Middle name', required: false }) ||
      nameError(form.lastName, { label: 'Last name' }) ||
      // A contact address on file, not the sign-in — optional, but has to be
      // an email when given.
      (form.personalEmail.trim() ? emailError(form.personalEmail) : '') ||
      (role === 'student'
        ? idNumberError(form.studentNumber, { label: 'LRN/ID number' }) ||
          (isG12
            ? lrnError(form.studentNumber, { collegePath: 'set Level to College' })
            : (String(form.studentNumber).replace(/\D/g, '').length < 6
                ? 'The LRN/ID number needs at least 6 digits — the last six become their login.'
                : '')) ||
          // Parental-access linking age-gates on the birthdate, so a student
          // without one breaks guardian invites later (rule in lib/validation).
          birthdateError(form.birthdate)
        : '') ||
      (role === 'teacher'
        ? idNumberError(form.employeeNumber, { label: 'Employee number' }) ||
          (String(form.employeeNumber).replace(/\D/g, '').length < 6
            ? 'The employee number needs at least 6 digits — the last six become their login.'
            : '')
        : '') ||
      // Blank -> the server generates one for this account (T-267); a typed
      // one must meet the full rule. is_temp_password gates either way.
      tempPasswordError(form.password, { required: false })
    if (problem) return setError(problem)
    if (!prefix) {
      return setError('Set your school’s login prefix on the Home tab first — it is what their sign-in login is issued from.')
    }

    // Nothing else here notices that a person is already on file: an account
    // is keyed by the number it was issued from, so the same teacher entered
    // twice under two employee numbers used to become two live accounts in
    // silence. An address belongs to one person and is refused; a name is
    // only asked about, because two people really can share one.
    // Cleared before the dialog, not after it: the previous attempt's message
    // otherwise sits behind the question, answering something else.
    setError('')
    const typedEmail = form.personalEmail.trim()
    const taken = accountWithEmail(users, typedEmail)
    if (taken) {
      return setError(
        `${describeAccount(taken)} already uses ${typedEmail}. One address can only bring one account back, so this person needs their own.`,
      )
    }
    /* One question, always asked. The duplicate check below used to be the
       only dialog in this path, which meant the first account of a given name
       -- the ordinary case -- was created on a single click, and the tester
       reported exactly that twice (andecobs-26, -27). When there is a twin its
       wording wins, because it carries more: the plain version tells you what
       you are about to make, the twin version tells you it may already exist.
       Either way it names the login, which is derived rather than typed and
       is the thing the admin will be reading out afterwards. */
    const twins = accountsNamed(users, form.firstName, form.lastName)
    const who = `${form.firstName.trim()} ${form.lastName.trim()}`
    const signsIn = loginPreview
    const ok = await confirmDialog(twins.length
      ? {
        title: `${who} is already on file`,
        message: `${twins.map(describeAccount).join(', ')} — same name. Two people really can share one, so this is only a check: creating another makes a separate account with its own login${signsIn ? `, ${signsIn}` : ''}.`,
        confirmLabel: 'Create Anyway',
      }
      : {
        title: `Create a ${role} account for ${who}?`,
        message: `They sign in as ${signsIn} straight away, and are asked to choose their own password the first time. An account cannot be deleted afterwards, only deactivated.`,
        confirmLabel: 'Create Account',
      })
    if (!ok) return

    mut.mutate({
      // Teacher and student logins are issued server-side from the school's
      // prefix -- never a real inbox, which is what an admin account would
      // have needed. There is no admin path here any more to need one.
      email: '',
      password: form.password,
      role,
      firstName: form.firstName,
      lastName: form.lastName,
      extra: {
        ...(form.middleName.trim() ? { middle_name: form.middleName.trim() } : {}),
        ...(form.personalEmail.trim() ? { personal_email: form.personalEmail.trim() } : {}),
        ...(role === 'student' ? (() => {
          const [a, b] = splitPair(isG12 ? form.gradeSection : form.courseYear)
          return {
            student_level: isG12 ? 'k12' : 'college',
            student_number: form.studentNumber.trim(),
            ...(isG12 ? { lrn: form.studentNumber.trim() } : {}),
            birthdate: form.birthdate,
            ...(isG12
              ? { ...(a ? { year_level: a } : {}), ...(b ? { section: b } : {}) }
              : { ...(a ? { course: a } : {}), ...(b ? { year_level: b } : {}) }),
          }
        })() : {}),
        ...(role === 'teacher' ? {
          employee_number: form.employeeNumber.trim(),
          ...(form.department.trim() ? { department: form.department.trim() } : {}),
        } : {}),
      },
    })
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <form onSubmit={submit}>
      {/* No own heading or role picker here any more -- AddUserSection asks
          both questions (Bulk | Individual, then Teacher | Student) and does
          not mount this form until a role is chosen, so every field below is
          already role-shaped: a student is asked for an LRN, a teacher for
          an employee ID, nothing for an inbox (admin accounts are no longer
          made from this screen at all). */}
      {/* Three short sections, so each field sits under the question it
          answers and every helper line has a column wide enough to hold it in
          one or two lines. */}
      <FormSection title="Personal Details">
        <label style={labelStyle}>
          First Name<Req />
          <input style={{ ...field, marginTop: 6 }} value={form.firstName} onChange={set('firstName')} />
        </label>
        <label style={labelStyle}>
          Middle Name <span style={{ color: faint, fontWeight: 400 }}>(Optional)</span>
          <input style={{ ...field, marginTop: 6 }} value={form.middleName} onChange={set('middleName')} />
        </label>
        <label style={labelStyle}>
          Last Name<Req />
          <input style={{ ...field, marginTop: 6 }} value={form.lastName} onChange={set('lastName')} />
        </label>
        {role === 'student' && (
          <label style={labelStyle}>
            Birthdate<Req />
            <input style={{ ...field, marginTop: 6 }} type="date" value={form.birthdate} onChange={set('birthdate')} />
            <span style={helperStyle}>{BIRTHDATE_HINT}</span>
          </label>
        )}
      </FormSection>

      {role === 'student' && (
        <FormSection title="School ID & Grade">
          {/* Figure 49: Grade 12 & below carry an LRN alongside their
              student number; college learners have the student number only. */}
          <label style={labelStyle}>
            Level<Req />
            <select style={{ ...field, marginTop: 6, cursor: 'pointer' }} value={form.level} onChange={set('level')}>
              <option value="g12">Grade 12 &amp; below</option>
              <option value="college">College</option>
            </select>
          </label>
          <label style={labelStyle}>
            LRN/ID Number<Req />
            <input style={{ ...field, marginTop: 6 }} value={form.studentNumber}
                   onChange={set('studentNumber')}
                   inputMode={isG12 ? 'numeric' : undefined}
                   maxLength={isG12 ? 12 : undefined}
                   placeholder={isG12 ? '12-digit LRN' : 'e.g. 2024-00123'} />
            <span style={helperStyle}>
              {isG12
                ? 'DepEd LRN, 12 digits.'
                : 'Student ID, 6+ digits. The last six become their login.'}
            </span>
          </label>
          {isG12 ? (
            <label style={labelStyle}>
              Grade &amp; Section <span style={{ color: faint, fontWeight: 400 }}>(Optional)</span>
              <input style={{ ...field, marginTop: 6 }} value={form.gradeSection}
                     onChange={set('gradeSection')} placeholder="e.g. Grade 9 - Rizal" />
            </label>
          ) : (
            <label style={labelStyle}>
              Course &amp; Year <span style={{ color: faint, fontWeight: 400 }}>(Optional)</span>
              <input style={{ ...field, marginTop: 6 }} value={form.courseYear}
                     onChange={set('courseYear')} placeholder="e.g. BSIT - 3rd Year" />
            </label>
          )}
        </FormSection>
      )}

      {role === 'teacher' && (
        <FormSection title="Employee ID & Department">
          <label style={labelStyle}>
            Employee Number<Req />
            <input style={{ ...field, marginTop: 6 }} value={form.employeeNumber}
                   onChange={set('employeeNumber')} placeholder="e.g. T-2024-018" />
          </label>
          <label style={labelStyle}>
            Department <span style={{ color: faint, fontWeight: 400 }}>(Optional)</span>
            <input style={{ ...field, marginTop: 6 }} value={form.department}
                   onChange={set('department')} placeholder="e.g. Mathematics" />
          </label>
        </FormSection>
      )}

      <FormSection title="Email & Temporary Password">
        <label style={labelStyle}>
          Personal Email <span style={{ color: faint, fontWeight: 400 }}>(Optional)</span>
          <input style={{ ...field, marginTop: 6 }} type="email" value={form.personalEmail}
                 onChange={set('personalEmail')} placeholder="e.g. sample.maria@gmail.com" />
        </label>
        {/* Spans two columns so "Temporary Password (Optional)" stays on one
            line (T-173, andecobs-250) and its helper fits in two. */}
        <label style={{ ...labelStyle, gridColumn: 'span 2' }}>
          Temporary Password <span style={{ color: faint, fontWeight: 400 }}>(Optional)</span>
          <input style={{ ...field, marginTop: 6 }} type="text" value={form.password}
                 onChange={set('password')} />
          {/* The value itself stays server-side (audit F-03: it must not be in
              the public bundle); the success message shows it. */}
          <span style={helperStyle}>
            Leave blank to use the school’s standard temporary password, shown
            once the account is created. They must choose their own password at
            first sign-in.
          </span>
        </label>
      </FormSection>

      {loginPreview ? (
        /* The one line the admin must carry away from this form — the exact
           string this person types to sign in (NOT their full ID number,
           which is the mistake this callout exists to prevent). */
        <div style={{
          marginTop: 14, padding: '12px 16px', borderRadius: 10,
          background: 'rgba(14,42,92,0.05)', border: '1px solid rgba(14,42,92,0.18)',
          display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: ink }}>They will sign in as</span>
          <strong style={{ ...mono, fontSize: 19, fontWeight: 800, color: navy, letterSpacing: '0.03em' }}>
            {loginPreview}
          </strong>
        </div>
      ) : (
        <p style={{ ...mono, fontSize: 12.5, color: prefix ? faint : red, margin: '12px 0 0' }}>
          {prefix
            ? `Their login will be ${prefix}-<last 6 digits of their ${
                role === 'student' ? (isG12 ? 'LRN' : 'student number') : 'employee ID'}>`
            : 'No login prefix is set for your school yet — set it in School & Login Prefix on the Home tab.'}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="submit" style={btnPrimary} disabled={mut.isPending}>
          {mut.isPending ? 'Creating…' : `Create ${role === 'student' ? 'Student' : 'Teacher'}`}
        </button>
        {/* Ten seconds is normal here: making a sign-in account is several
            round trips to the identity service. Without a word about it, the
            disabled button reads as a dead one. */}
        {mut.isPending && (
          <span style={{ fontSize: 12.5, color: faint }}>Setting up the account — this takes a few seconds.</span>
        )}
      </div>

      {/* A successful create empties the per-person fields but keeps the
          role AddUserSection chose -- adding several of the same kind in a
          row does not need the segmented controls touched again. */}
      {(error || done) && (
        <div style={{ marginTop: 14 }}>
          <Notice>{error}</Notice>
          <Notice tone="ok">{done}</Notice>
        </div>
      )}
    </form>
  )
}

/* ─────────────────────────── add user ─────────────────────────── */

// One row of controls: Teacher | Student pick who is being added (Teacher by
// default), and Bulk is a separate on/off toggle at the end of the same row.
// Off = type one account in by hand; on = upload a spreadsheet for the picked
// role. Nothing about the row appears or disappears when either is clicked, so
// the controls never move. (T-113 started with Bulk | Individual, then
// Teacher | Student, neither defaulted; reworked to this single row.) Admin
// accounts are not created from this screen at all -- owner, 2026-10-02.
const ADD_USER_ROLES = ['teacher', 'student']

export function AddUserSection({ onCreated, settings, users }) {
  const [bulk, setBulk] = useState(false)
  const [role, setRole] = useState('teacher')

  return (
    <section style={{ ...card, padding: 22 }}>
      <CardHead
        icon={<UserPlus className="w-5 h-5" style={{ color: navy }} />}
        tint="rgba(14,42,92,0.07)"
        title="Add User"
        sub="Create one account at a time, or switch on Bulk to upload a spreadsheet for many at once. Parents are not added here — they register themselves and claim their student's invitation code."
        style={{ marginBottom: 18 }}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', maxWidth: 460, margin: '0 auto' }}>
        <div style={{ flex: 1 }}>
          <RolePicker
            value={role}
            options={ADD_USER_ROLES}
            ariaLabel="Role"
            onChange={(r) => setRole(r)}
          />
        </div>
        <button
          type="button"
          aria-pressed={bulk}
          onClick={() => setBulk((on) => !on)}
          className="transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]/40"
          style={{
            minWidth: 96, padding: '0 18px', fontSize: 14, fontWeight: 700, fontFamily: sans, cursor: 'pointer', borderRadius: 12,
            ...(bulk
              ? { color: '#FAFAF6', background: navy, border: `1.5px solid ${navy}`, boxShadow: `0 2px 0 ${navyDeep}` }
              : { color: muted, background: 'rgba(14,42,92,0.05)', border: '1.5px solid rgba(14,42,92,0.14)' }),
          }}
        >
          Bulk
        </button>
      </div>

      {/* Switching role inside Bulk remounts the uploader (key={role}), the
          same clean-slate the old per-card picker gave it -- a file parsed
          under the old role stops meaning what it says. Switching role
          on the manual form does not remount CreateUserForm: it keeps
          whatever name/etc. was already typed. */}
      {bulk ? (
        <div style={{ marginTop: 18 }}>
          <BulkUpload
            key={role}
            role={role}
            onDone={(created) => onCreated({ role: role === 'student' ? 'bulk-student' : 'bulk-teacher', created })}
            settings={settings}
            users={users}
          />
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <CreateUserForm role={role} onCreated={onCreated} settings={settings} users={users} />
        </div>
      )}
    </section>
  )
}

/* ─────────────────────────── user row ─────────────────────────── */

/**
 * The identifier a registrar has on paper: a student's number, a teacher's
 * employee number. The login_id is derived from it (the last six digits behind
 * the school prefix) and is not what people look someone up by -- T-30.
 */
function idNumberOf(u) {
  return u.student_number || u.employee_number || ''
}

/** What the Users search box matches against. */
function userSearchText(u) {
  return [u.first_name, u.last_name, u.email, u.login_id, u.student_number, u.lrn, u.employee_number]
    .map((v) => v ?? '').join(' ').toLowerCase()
}

// No Admin tab: admins are few and the signed-in one is on Home, so this table
// is for the teachers, students and parents being managed.
const ROLE_VIEWS = ['all', ...ROLES.filter((r) => r !== 'admin')]

/**
 * The Users roster, narrowed by the active role view and then by the search
 * box — the same combination this screen always used, now named so the view
 * switch (T-174, andecobs-255) can be pinned without a DOM library. Search
 * is never scoped away by the role view: an admin unsure whether someone is
 * a teacher starts on "All" and finds them regardless, same as before.
 */
export function filterUsers(users, roleView, search) {
  const q = search.trim().toLowerCase()
  return users.filter((u) => {
    if (roleView !== 'all' && u.role !== roleView) return false
    if (!q) return true
    return userSearchText(u).includes(q)
  })
}

export function resetPasswordPromptSpec(user) {
  return {
    title: 'Reset User Password',
    message: (
      <>
        <span>Set a temporary password for this user. They will be asked to create a new password when they sign in.</span>
        <span style={{ display: 'block', marginTop: 8, fontSize: 12.5, color: faint }}>
          Requirements: {PASSWORD_REQUIREMENTS.map((r) => r.label).join(', ')}
        </span>
      </>
    ),
    label: 'Temporary Password',
    placeholder: 'Enter a temporary password',
    confirmLabel: 'Reset Password',
    required: true,
    trim: false,
    validate: tempPasswordError,
  }
}

export function UserRow({ user, isSelf, onChanged }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useTransientMessage('')
  const active = (user.status ?? 'active') === 'active'
  const isParent = user.role === 'parent'
  const idNumber = idNumberOf(user)
  const tint = ROLE_TINT[user.role] ?? ROLE_TINT.student

  async function run(label, fn) {
    setBusy(label); setError('')
    try { await fn(); onChanged() } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  async function toggleActive() {
    const next = active ? 'inactive' : 'active'
    if (active && !(await confirmDialog({
      title: `Deactivate ${user.first_name} ${user.last_name}?`,
      message: 'They will be hidden from rosters and unable to sign in. You can reactivate them at any time.',
      confirmLabel: 'Deactivate',
      tone: 'danger',
    }))) return
    // Both halves: status hides them from the app, disabled stops the login.
    // Doing only the first leaves a working account.
    run('status', async () => {
      await setUserStatus(user.id, next)
      await setAccountDisabled(user.id, active)
    })
  }

  // The Sign-in cell's full value, shown on hover only when it is cut off.
  const [loginTip, setLoginTip] = useState(null)
  function showLoginTip(e) {
    const el = e.currentTarget
    if (el.scrollWidth <= el.clientWidth) return
    const r = el.getBoundingClientRect()
    setLoginTip({ left: r.left, top: r.bottom + 6 })
  }

  async function doReset() {
    const pw = await promptDialog(resetPasswordPromptSpec(user))
    if (pw == null) return
    run('password', () => resetPassword(user.id, pw))
  }

  return (
    <tr style={{ borderTop: `1px solid ${line}` }}>
      <td style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: ink }}>
          {user.last_name}, {user.first_name}
          {isSelf && <span style={{ ...mono, fontSize: 11, color: faint, marginLeft: 8 }}>you</span>}
        </div>
        {error && <div style={{ fontSize: 12, color: red, marginTop: 4 }}>{error}</div>}
      </td>

      <td style={{ padding: '12px 14px' }}>
        {/* Issued accounts show the login people actually type (snhs-789012);
            the email field holds the internal identifier and stays hidden.
            Admins and parents sign in with a real email, so that shows here. */}
        {/* One line, always: a long email used to break mid-address
            ("johnmichaelmendoza1234@gmai / l.com"). The column now fits a
            typical address in full; one that is still longer is cut with an
            ellipsis, and hovering it shows the whole value at once. Not the
            native `title` tooltip: it waits about a second and was missed. */}
        <span
          onMouseEnter={showLoginTip}
          onMouseLeave={() => setLoginTip(null)}
          style={{ ...mono, fontSize: 13, fontWeight: 400, color: ink, display: 'block',
                   whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {user.login_id ?? user.email}
        </span>
        {loginTip && (
          // position: fixed so the table's own scroll box cannot clip it.
          <span role="tooltip" style={{
            position: 'fixed', left: loginTip.left, top: loginTip.top, zIndex: 50,
            ...mono, fontSize: 12.5, color: '#FFFFFF', background: ink,
            padding: '6px 8px', borderRadius: 6, whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(10,23,51,0.18)', pointerEvents: 'none',
          }}>
            {user.login_id ?? user.email}
          </span>
        )}
      </td>

      <td style={{ padding: '12px 14px' }}>
        {/* The login is only the last six digits of the ID; the registrar has the
            full number on paper. Students carry student_number (and, in G12, an
            LRN), teachers employee_number. Admins and parents have neither, so
            the cell stays blank rather than showing a dash that reads as data. */}
        {idNumber && (
          <div style={{ ...mono, fontSize: 13, fontWeight: 400, color: ink, whiteSpace: 'nowrap' }}>{idNumber}</div>
        )}
        {user.lrn && (
          <div style={{ ...mono, fontSize: 11, color: faint, marginTop: idNumber ? 2 : 0, whiteSpace: 'nowrap' }}>LRN {user.lrn}</div>
        )}
      </td>

      <td style={{ padding: '12px 14px' }}>
        {/* A role is fixed for the life of the account, shown as a plain label
            for everyone. A student cannot become a teacher: their student
            number, LRN and class rosters would stay behind and the sign-in
            would still be built from the LRN. A person added in the wrong
            role is deactivated and added again in the right one. */}
        <Pill tint={tint}>{user.role}</Pill>
      </td>

      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Pill tint={active ? { fg: green, bg: 'rgba(31,138,91,0.10)' } : { fg: red, bg: 'rgba(192,57,43,0.08)' }}>
            {active ? 'active' : 'inactive'}
          </Pill>
          {/* Every account staff create starts on a password staff chose -- and
              an admin resetting one puts it back there. This says who has not
              replaced it yet, which is the question behind "can they log in?".
              The password is not stored anywhere readable; only this fact is. */}
          {user.is_temp_password && (
            <Pill
              tint={{ fg: goldDeep, bg: 'rgba(245,197,24,0.16)' }}
              style={{ fontSize: 10, padding: '2px 7px' }}
            >
              default password
            </Pill>
          )}
        </div>
      </td>

      <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        {/* Icon buttons, each named by its title and aria-label. Parents get neither action: they self-register with their own real
            email, so recovery is theirs (self-service reset), and their access
            is granted and revoked by their student's invitation link, not by
            the school. The API refuses both too (parent_protected). */}
        {!isParent && (
          <button style={iconBtn} onClick={doReset} disabled={!!busy}
                  title="Reset Password" aria-label={`Reset Password for ${user.first_name} ${user.last_name}`}>
            {busy === 'password' ? '…' : <Key className="h-4 w-4" />}
          </button>
        )}
        {isParent ? (
          <span style={{ fontSize: 12, color: faint, marginLeft: 8 }}
                title="A parent's access is controlled by their student's invitation link.">
            family-managed
          </span>
        ) : (
          <button
            style={{ ...iconBtn, marginLeft: 8, color: active ? red : green,
                     borderColor: active ? 'rgba(192,57,43,0.3)' : 'rgba(31,138,91,0.3)' }}
            onClick={toggleActive}
            disabled={!!busy || isSelf}
            title={isSelf ? 'You cannot deactivate your own account' : active ? 'Deactivate' : 'Reactivate'}
            aria-label={`${active ? 'Deactivate' : 'Reactivate'} ${user.first_name} ${user.last_name}`}
          >
            {busy === 'status' ? '…' : active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
          </button>
        )}
      </td>
    </tr>
  )
}

/** Square icon-only version of the row's ghost buttons. */
const iconBtn = { ...btnGhost, width: 38, height: 38, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle' }

/** Users shown per page: enough rows to keep the card one steady size. */
export const USERS_PER_PAGE = 20

/**
 * One page of an already-loaded list. The page is clamped, so a list that got
 * shorter (a filter, a search) never leaves you on a page that no longer exists.
 */
export function pageOf(rows, page, perPage = USERS_PER_PAGE) {
  const pages = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(Math.max(1, page), pages)
  const from = (current - 1) * perPage
  return { rows: rows.slice(from, from + perPage), page: current, pages, from: rows.length ? from + 1 : 0, to: Math.min(from + perPage, rows.length) }
}

export default function UsersTab() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: users = [], isLoading, isError, error } = useAdminUsers(profile.school_id)
  // Only the login prefix is read here (Add User); the school's own cards are on Home.
  const { data: settings } = useQuery({ queryKey: adminSchoolKey, queryFn: fetchSchoolSettings })
  const [roleFilter, setRoleFilter] = useState('all')
  const [search, setSearch] = useState('')
  const accountsRef = useRef(null)
  // The page belongs to the filter it was chosen under: change the tab or the
  // search and it falls back to page 1 without an effect to do it.
  const filterKey = `${roleFilter}|${search}`
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 })

  const refresh = () => qc.invalidateQueries({ queryKey: adminUsersKey })

  function onAccountCreated(result) {
    refresh()
    const destination = studentAccountsDestination(result)
    if (!destination) return
    setRoleFilter(destination.roleFilter)
    setSearch(destination.search)
    requestAnimationFrame(() => accountsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // The signed-in admin is on the Home tab, not in this list: a school can
  // have thousands of accounts and this table is for the people being managed.
  // `users` itself stays whole -- the duplicate checks in Add User still need
  // to see every account on file.
  const shown = useMemo(
    () => filterUsers(users.filter((u) => u.id !== profile.id), roleFilter, search),
    [users, roleFilter, search, profile.id],
  )

  const view = pageOf(shown, pageState.key === filterKey ? pageState.page : 1)
  const goToPage = (n) => setPageState({ key: filterKey, page: n })

  function exportCsv() {
    downloadCsv(stampedName('users'), [
      ['Last name', 'First name', 'Login', 'ID number', 'LRN', 'Role', 'Status'],
      ...shown.map((u) => [
        u.last_name, u.first_name, u.login_id ?? u.email, idNumberOf(u), u.lrn ?? '', u.role, u.status ?? 'active',
      ]),
    ])
  }

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <AddUserSection onCreated={onAccountCreated} settings={settings} users={users} />

      <section ref={accountsRef} data-testid="student-accounts-section" style={{ ...card, overflow: 'hidden', scrollMarginTop: 24 }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${line}` }}>
          <CardHead
            icon={<Users className="w-5 h-5" style={{ color: blueText }} />}
            tint="rgba(63,169,245,0.13)"
            title={roleFilter === 'student' ? 'Student Accounts' : 'Users'}
            count={shown.length}
            action={
              <div className="flex flex-wrap items-center gap-3">
                <input placeholder="Search name, email, login or ID" value={search}
                       onChange={(e) => setSearch(e.target.value)}
                       style={{ ...field, width: 220, padding: '8px 12px', fontSize: 13 }} />
                {/* A disabled button with no reason reads as a broken one -- which is
                    what a tester reported. Say which it is, the way the row's own
                    Deactivate button does. */}
                <button style={btnGhost} onClick={exportCsv} disabled={!shown.length}
                        title={shown.length ? `Download these ${shown.length} users as a CSV file`
                                            : 'Nothing to export — no users match this filter'}>
                  Export CSV
                </button>
              </div>
            }
          />
        </div>

        {/* The "All roles" filter already worked — a dropdown beside the search
            box — but a control someone has to notice and open is not the same
            as a visible split. Promoted to tabs here rather than left beside a
            second control (T-174, andecobs-255: "role-based separation...
            mixing all accounts makes tracking difficult" on a 100+/500+ roster).
            Search keeps working underneath whichever tab is active — it is not
            a second, competing filter, just a more visible version of the one
            that was already there. */}
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${line}`, background: 'rgba(14,42,92,0.015)' }}>
          <RolePicker value={roleFilter} onChange={setRoleFilter} options={ROLE_VIEWS}
                      ariaLabel="Filter users by role" />
        </div>

        {isLoading && <div style={{ padding: 16 }}><SkeletonTable rows={6} cols={6} label="Loading users" /></div>}
        {isError && <div style={{ padding: 20 }}><Notice>{error?.message ?? 'Could not load users.'}</Notice></div>}

        {!isLoading && !isError && (
          shown.length === 0 ? (
            <p style={{ padding: 28, textAlign: 'center', color: faint }}>No users match that filter.</p>
          ) : (
            // 20 users a page (see USERS_PER_PAGE below the table), and the rows
            // scroll inside a viewport-relative cap with the header row pinned
            // (T-174), so the column names stay in view while you read down a
            // page and the Previous / Next footer never leaves the screen. It
            // also scrolls sideways on a narrow window.
            <>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                {/* Fixed layout with explicit widths: left to size themselves from
                    their content, the nowrap Status and action columns squeezed
                    ID / LRN until "EMP-2026-004" broke over three lines while
                    Sign-in sat far too wide. Name takes whatever is left. */}
                {/* 2026-11-17: Sign-in 290 fits a ~32-character email in full on
                    one line (longer ones truncate, full value on hover); ID / LRN
                    140 and Role 120 still fit "LRN 136524240004" and the role
                    select; Status 210 -- just "Active" plus "Default password"
                    side by side (T-233), it was 240 and left a wide empty band on
                    every Active-only row; Actions 130 fits the two icon buttons with room to the
                    edge. There is no Last Active column. Name takes the rest. */}
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 1080 }}>
                  <colgroup>
                    <col />
                    <col style={{ width: 290 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 210 }} />
                    <col style={{ width: 130 }} />
                  </colgroup>
                  <thead>
                    {/* Solid, not the usual translucent tint -- sticky, it would
                        otherwise show scrolled-past rows bleeding through it. */}
                    <tr style={{ background: '#F7F8FA', position: 'sticky', top: 0, zIndex: 1 }}>
                      {['Name', 'Sign-in', 'ID / LRN', 'Role', 'Status', 'Actions'].map((h) => (
                        <th key={h} style={{ ...th, color: ink, fontWeight: 800, fontSize: 12, textAlign: h === 'Actions' ? 'center' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((u) => (
                      <UserRow key={u.id} user={u} isSelf={u.id === profile.id} onChanged={refresh} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 20 users to a page, so the card is the same size however big
                the school is; Previous / Next move through the rest. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 20px', borderTop: `1px solid ${line}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>
                Showing {view.from}–{view.to} of {shown.length}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" style={{ ...btnGhost, opacity: view.page <= 1 ? 0.5 : 1, cursor: view.page <= 1 ? 'not-allowed' : 'pointer' }}
                        disabled={view.page <= 1} onClick={() => goToPage(view.page - 1)}>
                  ‹ Previous
                </button>
                <span style={{ fontSize: 13, fontWeight: 700, color: ink, whiteSpace: 'nowrap' }}>
                  Page {view.page} of {view.pages}
                </span>
                <button type="button" style={{ ...btnPrimary, opacity: view.page >= view.pages ? 0.5 : 1, cursor: view.page >= view.pages ? 'not-allowed' : 'pointer' }}
                        disabled={view.page >= view.pages} onClick={() => goToPage(view.page + 1)}>
                  Next ›
                </button>
              </div>
            </div>
            </>
          )
        )}
      </section>
    </div>
  )
}
