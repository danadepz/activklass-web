import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/useAuth'
import { adminUsersKey, useAdminUsers, setUserRole, setUserStatus } from '@/hooks/useAdminUsers'
import {
  createUser, resetPassword, setAccountDisabled,
  adminSchoolKey, fetchSchoolSettings, saveSchoolSettings,
} from '@/lib/admin'
import { issuedLoginId, DEFAULT_PASSWORD } from '@/lib/logins'
import { downloadCsv, stampedName } from '@/lib/csv'
import { navy, ink, muted, faint, green, red, line, mono, goldDeep } from '@/theme'
import { ROLES, CREATABLE_ROLES, MIN_PASSWORD, card, field, btnPrimary, btnGhost, th } from './ui'
import {
  emailError, nameError, tempPasswordError,
  idNumberError, lrnError, schoolNameError, schoolAbbrError,
} from '@/lib/validation'
import Notice from './Notice'
import RolePicker from './RolePicker'
import CardHead from './CardHead'
import { confirmDialog, promptDialog } from '@/components/ui/dialogs'
import BulkUpload from './BulkUpload'
import { SkeletonTable } from '@/components/ui/Skeleton'

const ROLE_TINT = {
  admin: { fg: navy, bg: 'rgba(14,42,92,0.08)' },
  teacher: { fg: green, bg: 'rgba(31,138,91,0.10)' },
  student: { fg: '#1E6FB0', bg: 'rgba(30,111,176,0.10)' },
  parent: { fg: '#8B6A00', bg: 'rgba(245,197,24,0.18)' },
}

function Pill({ tint, children }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      color: tint.fg, background: tint.bg, borderRadius: 20, padding: '3px 10px',
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
function LoginPrefixCard({ settings, pending, error: loadError, onRetry, onSaved }) {
  const school = settings?.school
  // null = untouched, show the saved value
  const [name, setName] = useState(null)
  const [abbr, setAbbr] = useState(null)
  const [error, setError] = useState('')
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

  function submit(e) {
    e.preventDefault()
    setDone('')
    const problem = schoolNameError(shownName) || schoolAbbrError(shownAbbr)
    if (problem) return setError(problem)
    setError('')
    mut.mutate({ name: shownName.trim(), prefix: shownAbbr.trim().toLowerCase() })
  }

  return (
    <form onSubmit={submit} style={{ ...card, padding: 22 }}>
      <CardHead
        icon="🏫"
        tint="rgba(245,197,24,0.14)"
        title="School & login prefix"
        sub={
          loadError ? 'Your school’s details could not be loaded, so this card cannot show them yet. Nothing has been changed.'
            : pending ? 'Checking which school this account manages…'
            : school ? 'Enter your school’s full name and the abbreviation used beside it — the abbreviation is the prefix of every issued login: prefix, a dash, then the last six digits of the LRN (students) or employee ID (teachers). Existing logins are never changed.'
            : 'This admin account is not linked to a school yet, so a login prefix cannot be set.'
        }
        style={{ marginBottom: school || loadError ? 16 : 0 }}
      />

      {loadError && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}><Notice>{loadError.message}</Notice></div>
          <button type="button" style={btnGhost} onClick={onRetry}>Try again</button>
        </div>
      )}
      {school && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: ink, display: 'inline-flex', alignItems: 'center', gap: 10, flex: '1 1 320px' }}>
            School name
            <input style={{ ...field, padding: '10px 14px', flex: 1, minWidth: 200 }} value={shownName}
                   onChange={(e) => { setName(e.target.value); setDone('') }}
                   placeholder="e.g. University of Cebu-Banilad" />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: ink, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            Abbreviation
            <input style={{ ...field, width: 130, padding: '10px 14px' }} value={shownAbbr}
                   onChange={(e) => { setAbbr(e.target.value); setDone('') }}
                   placeholder="e.g. UCB" />
          </label>
          <span style={{ ...mono, fontSize: 12.5, color: faint }}>
            → {(shownAbbr.trim().toLowerCase() || 'prefix')}-789012
          </span>
          <button type="submit" style={btnPrimary} disabled={mut.isPending}>
            {mut.isPending ? 'Saving…' : 'Save'}
          </button>
          <div style={{ flex: '1 1 100%', minWidth: 200 }}>
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

/* "Grade 9 - Rizal" -> ['Grade 9', 'Rizal']; "BSIT - 3rd Year" -> ['BSIT',
   '3rd Year']; no dash -> [text, '']. One field per the manuscript's Add
   user mockup (Figure 49), split for storage. */
function splitPair(text) {
  const [head, ...rest] = String(text ?? '').split('-')
  return [head.trim(), rest.join('-').trim()]
}

function CreateUserForm({ onCreated, settings }) {
  // No default role: 'teacher' meant an admin who never touched the picker
  // silently created a teacher, which is the most privileged non-admin role
  // here. Picking one is now deliberate, and nothing else renders until it is.
  const blank = {
    role: '', firstName: '', middleName: '', lastName: '', email: '', password: '',
    level: 'g12', studentNumber: '', lrn: '', gradeSection: '', courseYear: '',
    birthdate: '', employeeNumber: '', department: '', personalEmail: '',
  }
  const [form, setForm] = useState(blank)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const prefix = settings?.school?.login_prefix ?? ''
  const role = form.role
  // Grade 12 & below sign in by the last six digits of their LRN; college
  // learners carry no LRN (manuscript Fig. 49-50) so theirs come from the
  // student number. Teachers use their employee ID.
  const isG12 = form.level === 'g12'
  const idSource = role === 'student'
    ? (isG12 ? form.lrn : form.studentNumber)
    : role === 'teacher' ? form.employeeNumber : ''
  const loginPreview = issuedLoginId(prefix, idSource)

  const mut = useMutation({
    mutationFn: createUser,
    onSuccess: (res) => {
      const login = res.user.login_id ?? res.user.email
      const pw = form.password || DEFAULT_PASSWORD
      setDone(`Created. They sign in as ${login} with the password “${pw}” — give them both directly, nothing is emailed.`)
      setForm(blank)
      setError('')
      onCreated()
    },
    onError: (e) => { setError(e.message); setDone('') },
  })

  function submit(e) {
    e.preventDefault()
    setDone('')
    if (!role) return setError('Pick a role for this user.')
    const problem =
      nameError(form.firstName, { label: 'First name' }) ||
      nameError(form.middleName, { label: 'Middle name', required: false }) ||
      nameError(form.lastName, { label: 'Last name' }) ||
      (role === 'admin' ? emailError(form.email) : '') ||
      // Their own inbox, kept for password recovery — optional, but has to be
      // an email when given.
      (role !== 'admin' && form.personalEmail.trim() ? emailError(form.personalEmail) : '') ||
      (role === 'student'
        ? idNumberError(form.studentNumber, { label: 'Student number' }) ||
          (isG12
            ? lrnError(form.lrn)
            : (String(form.studentNumber).replace(/\D/g, '').length < 6
                ? 'The student number needs at least 6 digits — the last six become their login.'
                : '')) ||
          // Parental-access linking age-gates on the birthdate, so a student
          // without one breaks guardian invites later.
          (!form.birthdate ? 'Birthdate is required — parental access checks depend on it.' : '')
        : '') ||
      (role === 'teacher'
        ? idNumberError(form.employeeNumber, { label: 'Employee number' }) ||
          (String(form.employeeNumber).replace(/\D/g, '').length < 6
            ? 'The employee number needs at least 6 digits — the last six become their login.'
            : '')
        : '') ||
      // Blank falls back to the default; is_temp_password gates either way.
      tempPasswordError(form.password, { required: false })
    if (problem) return setError(problem)
    if (role !== 'admin' && !prefix) {
      return setError('Set your school’s login prefix above first — it is what their sign-in login is issued from.')
    }
    setError('')
    mut.mutate({
      // Admins need a real inbox (password recovery goes there); teacher and
      // student logins are issued server-side from the school's prefix.
      email: role === 'admin' ? form.email : '',
      password: form.password,
      role,
      firstName: form.firstName,
      lastName: form.lastName,
      extra: {
        ...(form.middleName.trim() ? { middle_name: form.middleName.trim() } : {}),
        ...(role !== 'admin' && form.personalEmail.trim()
          ? { personal_email: form.personalEmail.trim() } : {}),
        ...(role === 'student' ? (() => {
          const [a, b] = splitPair(isG12 ? form.gradeSection : form.courseYear)
          return {
            student_number: form.studentNumber.trim(),
            ...(isG12 ? { lrn: form.lrn.trim() } : {}),
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
    <form onSubmit={submit} style={{ ...card, padding: 22 }}>
      <CardHead
        icon="👤"
        tint="rgba(14,42,92,0.07)"
        title="Add a user"
        sub="Pick the role first — the form follows. Creates the sign-in account and the profile together. Parents are not added here — they register themselves and claim their student's invitation code."
        style={{ marginBottom: 18 }}
      />

      {/* One question first, then the form. Every field below is role-shaped —
          a student is asked for an LRN, a teacher for an employee ID, an admin
          for an inbox — so showing them all up front showed most admins fields
          that did not apply to the account they were making. No visible label
          over it: the three words are the label, and `aria-label` on the
          radiogroup keeps it named for screen readers. */}
      <div style={{ maxWidth: 360, margin: '0 auto' }}>
        <RolePicker
          value={role}
          onChange={(r) => { setError(''); setDone(''); setForm((f) => ({ ...f, role: r })) }}
        />
      </div>

      {!role && (
        <p style={{
          fontSize: 13, color: muted, margin: '12px auto 0', lineHeight: 1.55,
          maxWidth: 420, textAlign: 'center',
        }}>
          Pick one and the rest of the form appears, asking for what that kind of account needs and nothing else.
        </p>
      )}

      {role && (<>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', marginTop: 14 }}>
        <label style={labelStyle}>
          First name
          <input style={{ ...field, marginTop: 6 }} value={form.firstName} onChange={set('firstName')} />
        </label>
        <label style={labelStyle}>
          Middle name <span style={{ color: faint, fontWeight: 400 }}>(optional)</span>
          <input style={{ ...field, marginTop: 6 }} value={form.middleName} onChange={set('middleName')} />
        </label>
        <label style={labelStyle}>
          Last name
          <input style={{ ...field, marginTop: 6 }} value={form.lastName} onChange={set('lastName')} />
        </label>

        {role === 'admin' && (
          <label style={labelStyle}>
            Email
            <input style={{ ...field, marginTop: 6 }} type="email" value={form.email} onChange={set('email')} />
          </label>
        )}

        {role === 'student' && (
          <>
            {/* Figure 49: Grade 12 & below carry an LRN alongside their
                student number; college learners have the student number only. */}
            <label style={labelStyle}>
              Level
              <select style={{ ...field, marginTop: 6, cursor: 'pointer' }} value={form.level} onChange={set('level')}>
                <option value="g12">Grade 12 &amp; below</option>
                <option value="college">College</option>
              </select>
            </label>
            <label style={labelStyle}>
              Student number
              <input style={{ ...field, marginTop: 6 }} value={form.studentNumber}
                     onChange={set('studentNumber')} placeholder="e.g. 2024-00123" />
            </label>
            {isG12 && (
              <label style={labelStyle}>
                LRN
                <input style={{ ...field, marginTop: 6 }} inputMode="numeric" maxLength={12}
                       value={form.lrn} onChange={set('lrn')} placeholder="12-digit LRN" />
              </label>
            )}
            {isG12 ? (
              <label style={labelStyle}>
                Grade &amp; section <span style={{ color: faint, fontWeight: 400 }}>(optional)</span>
                <input style={{ ...field, marginTop: 6 }} value={form.gradeSection}
                       onChange={set('gradeSection')} placeholder="e.g. Grade 9 - Rizal" />
              </label>
            ) : (
              <label style={labelStyle}>
                Course &amp; year <span style={{ color: faint, fontWeight: 400 }}>(optional)</span>
                <input style={{ ...field, marginTop: 6 }} value={form.courseYear}
                       onChange={set('courseYear')} placeholder="e.g. BSIT - 3rd Year" />
              </label>
            )}
            <label style={labelStyle}>
              Birthdate
              <input style={{ ...field, marginTop: 6 }} type="date" value={form.birthdate} onChange={set('birthdate')} />
            </label>
          </>
        )}

        {role === 'teacher' && (
          <>
            <label style={labelStyle}>
              Employee number
              <input style={{ ...field, marginTop: 6 }} value={form.employeeNumber}
                     onChange={set('employeeNumber')} placeholder="e.g. T-2024-018" />
            </label>
            <label style={labelStyle}>
              Department <span style={{ color: faint, fontWeight: 400 }}>(optional)</span>
              <input style={{ ...field, marginTop: 6 }} value={form.department}
                     onChange={set('department')} placeholder="e.g. Mathematics" />
            </label>
          </>
        )}

        {(role === 'teacher' || role === 'student') && (
          <label style={labelStyle}
                 title="Recorded here or nowhere: the account owner only confirms this address later — they cannot add one themselves. Without it, staff resets are their only way back in.">
            Personal email <span style={{ color: faint, fontWeight: 400 }}>(recommended — their password recovery)</span>
            {/* This form is the ONLY place an address gets on file (the
                owner's dashboard card just confirms it). Still optional —
                not everyone has an email — but skipping it leaves staff
                resets as the account's only recovery. */}
            <input style={{ ...field, marginTop: 6 }} type="email" value={form.personalEmail}
                   onChange={set('personalEmail')} placeholder="e.g. sample.maria@gmail.com" />
          </label>
        )}

        <label style={labelStyle}>
          Temporary password <span style={{ color: faint, fontWeight: 400 }}>(optional)</span>
          <input style={{ ...field, marginTop: 6 }} type="text" value={form.password}
                 onChange={set('password')} placeholder={`defaults to ${DEFAULT_PASSWORD}`} />
        </label>
      </div>

      {(role === 'teacher' || role === 'student') && (
        <p style={{ ...mono, fontSize: 12.5, color: prefix ? faint : red, margin: '12px 0 0' }}>
          {loginPreview
            ? <>They will sign in as <strong style={{ color: ink }}>{loginPreview}</strong></>
            : prefix
              ? `Their login will be ${prefix}-<last 6 digits of their ${
                  role === 'student' ? (isG12 ? 'LRN' : 'student number') : 'employee ID'}>`
              : 'No login prefix is set for your school yet — set it in the card above.'}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="submit" style={btnPrimary} disabled={mut.isPending}>
          {mut.isPending ? 'Creating…' : `Create ${role}`}
        </button>
        {/* Ten seconds is normal here: making a sign-in account is several
            round trips to the identity service. Without a word about it, the
            disabled button reads as a dead one. */}
        {mut.isPending && (
          <span style={{ fontSize: 12.5, color: faint }}>Setting up the account — this takes a few seconds.</span>
        )}
      </div>
      </>)}

      {/* Outside the role gate on purpose: a successful create empties the form
          back to the role step, and the line naming the login and the password
          they were given has to survive that. */}
      {(error || done) && (
        <div style={{ marginTop: 14 }}>
          <Notice>{error}</Notice>
          <Notice tone="ok">{done}</Notice>
        </div>
      )}
    </form>
  )
}

/* ─────────────────────────── user row ─────────────────────────── */

function UserRow({ user, isSelf, onChanged }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const active = (user.status ?? 'active') === 'active'
  const isParent = user.role === 'parent'
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

  async function changeRole(e) {
    const select = e.target
    const role = select.value
    if (!(await confirmDialog({
      title: `Change role to ${role}?`,
      message: `${user.first_name} ${user.last_name} will get the ${role} portal the next time they sign in.`,
      confirmLabel: 'Change role',
    }))) { select.value = user.role; return }
    run('role', () => setUserRole(user.id, role))
  }

  async function doReset() {
    // The length rule now blocks inside the dialog instead of failing after
    // it closes — the old prompt() sent you back to the row with an error and
    // an empty field, having thrown the typed password away.
    const pw = await promptDialog({
      title: 'Set a new password',
      message: `This replaces the password for ${user.login_id ?? user.email} immediately. At least ${MIN_PASSWORD} characters — they should change it after signing in.`,
      label: 'New password',
      placeholder: `e.g. ${DEFAULT_PASSWORD}`,
      confirmLabel: 'Set password',
      required: true,
      trim: false,
      validate: tempPasswordError,
    })
    if (pw == null) return
    run('password', () => resetPassword(user.id, pw))
  }

  return (
    <tr style={{ borderTop: `1px solid ${line}` }}>
      <td style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>
          {user.last_name}, {user.first_name}
          {isSelf && <span style={{ ...mono, fontSize: 11, color: faint, marginLeft: 8 }}>you</span>}
        </div>
        {/* Issued accounts show the login people actually type (snhs-789012);
            the email field holds the internal identifier and stays hidden. */}
        <div style={{ fontSize: 12.5, color: muted }}>{user.login_id ?? user.email}</div>
        {error && <div style={{ fontSize: 12, color: red, marginTop: 4 }}>{error}</div>}
      </td>

      <td style={{ padding: '12px 14px' }}>
        {/* Parents keep a fixed role: their account exists through their
            student's invitation link, and re-roling would orphan it. */}
        {isSelf || isParent ? (
          <Pill tint={tint}>{user.role}</Pill>
        ) : (
          <select value={user.role ?? 'student'} onChange={changeRole} disabled={!!busy}
                  style={{ ...field, padding: '6px 10px', fontSize: 13, cursor: 'pointer', width: 'auto' }}>
            {CREATABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </td>

      <td style={{ padding: '12px 14px' }}>
        <Pill tint={active ? { fg: green, bg: 'rgba(31,138,91,0.10)' } : { fg: red, bg: 'rgba(192,57,43,0.08)' }}>
          {active ? 'active' : 'inactive'}
        </Pill>
        {/* Every account staff create starts on a password staff chose -- and
            an admin resetting one puts it back there. This says who has not
            replaced it yet, which is the question behind "can they log in?".
            The password is not stored anywhere readable; only this fact is. */}
        {user.is_temp_password && (
          <div style={{ marginTop: 6 }}>
            <Pill tint={{ fg: goldDeep, bg: 'rgba(245,197,24,0.16)' }}>issued password</Pill>
          </div>
        )}
      </td>

      <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {/* Parents get neither action: they self-register with their own real
            email, so recovery is theirs (self-service reset), and their access
            is granted and revoked by their student's invitation link, not by
            the school. The API refuses both too (parent_protected). */}
        {!isParent && (
          <button style={btnGhost} onClick={doReset} disabled={!!busy}>
            {busy === 'password' ? '…' : 'Reset password'}
          </button>
        )}
        {isParent ? (
          <span style={{ fontSize: 12, color: faint, marginLeft: 8 }}
                title="A parent's access is controlled by their student's invitation link.">
            family-managed
          </span>
        ) : (
          <button
            style={{ ...btnGhost, marginLeft: 8, color: active ? red : green,
                     borderColor: active ? 'rgba(192,57,43,0.3)' : 'rgba(31,138,91,0.3)' }}
            onClick={toggleActive}
            disabled={!!busy || isSelf}
            title={isSelf ? 'You cannot deactivate your own account' : undefined}
          >
            {busy === 'status' ? '…' : active ? 'Deactivate' : 'Reactivate'}
          </button>
        )}
      </td>
    </tr>
  )
}

export default function UsersTab() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: users = [], isLoading, isError, error } = useAdminUsers()
  const {
    data: settings, isPending: schoolPending, error: schoolError, refetch: refetchSchool,
  } = useQuery({ queryKey: adminSchoolKey, queryFn: fetchSchoolSettings })
  const [roleFilter, setRoleFilter] = useState('all')
  const [search, setSearch] = useState('')

  const refresh = () => qc.invalidateQueries({ queryKey: adminUsersKey })
  const refreshSchool = () => qc.invalidateQueries({ queryKey: adminSchoolKey })

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (!q) return true
      return `${u.first_name ?? ''} ${u.last_name ?? ''} ${u.email ?? ''} ${u.login_id ?? ''}`.toLowerCase().includes(q)
    })
  }, [users, roleFilter, search])

  function exportCsv() {
    downloadCsv(stampedName('users'), [
      ['Last name', 'First name', 'Login', 'Role', 'Status'],
      ...shown.map((u) => [u.last_name, u.first_name, u.login_id ?? u.email, u.role, u.status ?? 'active']),
    ])
  }

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <LoginPrefixCard settings={settings} pending={schoolPending} error={schoolError}
                       onRetry={refetchSchool} onSaved={refreshSchool} />
      <BulkUpload onDone={refresh} settings={settings} />
      <CreateUserForm onCreated={refresh} settings={settings} />

      <section style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${line}` }}>
          <CardHead
            icon="👥"
            tint="rgba(63,169,245,0.13)"
            title="Users"
            count={shown.length}
            action={
              <div className="flex flex-wrap items-center gap-3">
                <input placeholder="Search name, email or login" value={search}
                       onChange={(e) => setSearch(e.target.value)}
                       style={{ ...field, width: 220, padding: '8px 12px', fontSize: 13 }} />
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
                        style={{ ...field, width: 'auto', padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
                  <option value="all">All roles</option>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button style={btnGhost} onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
              </div>
            }
          />
        </div>

        {isLoading && <div style={{ padding: 16 }}><SkeletonTable rows={6} cols={5} label="Loading users" /></div>}
        {isError && <div style={{ padding: 20 }}><Notice>{error?.message ?? 'Could not load users.'}</Notice></div>}

        {!isLoading && !isError && (
          shown.length === 0 ? (
            <p style={{ padding: 28, textAlign: 'center', color: faint }}>No users match that filter.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'rgba(14,42,92,0.03)' }}>
                    {['Name', 'Role', 'Status', ''].map((h, i) => (
                      <th key={h || i} style={{ ...th, color: muted, textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u) => (
                    <UserRow key={u.id} user={u} isSelf={u.id === profile.id} onChanged={refresh} />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  )
}
