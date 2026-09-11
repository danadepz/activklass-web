/**
 * Student accounts — the solo subscriber's slice of the admin console.
 *
 * A teacher on their own subscription has no school admin to issue logins,
 * reset passwords or deactivate a learner who left, so those three actions
 * live here, on their Students page. Rendered only when useMySubscription()
 * says the teacher is solo; a school-issued teacher's admin does all this in
 * Admin → Users and must not get a second, unscoped copy of it.
 *
 * Creating accounts goes through the same Flask endpoint the class roster's
 * "Create New Manually" tab uses (POST /api/classes/{id}/students/provision),
 * which now issues logins from the teacher's school prefix. Reset and
 * deactivate go through the staff endpoints in lib/admin.js, which scope a
 * teacher to students on their own rosters server-side (api/admin.py
 * require_staff + _roster_overlap).
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { api } from '@/lib/api'
import { useAuth } from '@/context/useAuth'
import { resetPassword, setAccountDisabled } from '@/lib/admin'
import { fetchUsersByIds, parseCsv } from '@/lib/roster'
import { downloadXlsx, readXlsxRows } from '@/lib/xlsx'
import { downloadCsv, stampedName } from '@/lib/csv'
import { issuedLoginId, DEFAULT_PASSWORD } from '@/lib/logins'
import { tempPasswordError, MIN_PASSWORD, nameError, lrnError, idNumberError, emailError } from '@/lib/validation'
import { confirmDialog, promptDialog } from '@/components/ui/dialogs'
import { toast } from '@/components/ui/toast'
import { navy, navyDeep, ink, muted, faint, green, red, goldDeep, line, serif, mono, sansFamily as sans } from '@/theme'

const REQUIRED = ['first_name', 'last_name', 'student_number']
const OPTIONAL = ['lrn', 'email', 'birthdate', 'grade_level', 'section', 'middle_name', 'course', 'year_level']
/* The template a solo teacher downloads: the columns the provision endpoint
   reads, in the order a person fills them. Headers only -- a sample row
   uploaded unedited would create that person (see admin/BulkUpload.jsx). */
const TEMPLATE_COLUMNS = ['first_name', 'middle_name', 'last_name', 'student_number', 'lrn',
                          'birthdate', 'grade_level', 'section', 'course', 'year_level', 'email']
const downloadTemplate = () =>
  downloadXlsx(stampedName('student-upload-template').replace(/\.csv$/, '.xlsx'), TEMPLATE_COLUMNS)

const btnGhost = {
  padding: '7px 12px', fontSize: 12.5, fontWeight: 700, fontFamily: sans, color: navy,
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.18)', borderRadius: 8, cursor: 'pointer',
}
const btnPrimary = {
  padding: '10px 18px', fontSize: 13.5, fontWeight: 700, fontFamily: sans, color: '#FAFAF6',
  background: navy, border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}`,
}
const panel = { background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, overflow: 'hidden' }
const th = { padding: '10px 14px', fontSize: 12, fontWeight: 800, color: ink, textAlign: 'left', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em' }
const td = { padding: '12px 14px', fontSize: 13.5, color: ink, verticalAlign: 'top' }

function Pill({ fg, bg, children }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', fontSize: 11, fontWeight: 700, borderRadius: 999, color: fg, background: bg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function rowProblem(row, prefix) {
  if (!row.first_name || !row.last_name) return 'missing name'
  if (!row.student_number) return 'missing student_number'
  if (row.lrn && !/^\d{12}$/.test(row.lrn)) return 'LRN must be 12 digits'
  if (row.birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(row.birthdate)) return 'birthdate must be YYYY-MM-DD'
  if (prefix && !issuedLoginId(prefix, row.lrn || row.student_number)) {
    return row.email ? '' : 'needs an LRN or student number with 6+ digits, or an email'
  }
  if (!prefix && !row.email) return 'needs an email (no school prefix to issue a login from)'
  return ''
}

/** What the login will be, as the row stands. */
function rowLogin(row, prefix) {
  return (prefix && issuedLoginId(prefix, row.lrn || row.student_number)) || row.email || '—'
}

/* ── Shared: one POST for both the file and the manual path ───────────── */

const classLabel = (c) =>
  c.subject_code ? `${c.subject_code} · ${c.section ?? ''}`.trim() : c.section || c.subject || c.name || 'Class'

/**
 * Creates the accounts and enrols them. Returns the endpoint's summary; the
 * logins toast is raised here so the file and the form announce the same way.
 */
async function provisionInto(classId, rows) {
  const res = await api(`/api/classes/${classId}/students/provision`, {
    method: 'POST',
    body: { students: rows.map((r) => ({ ...r, email: r.email || undefined })) },
  })
  const minted = (res.created ?? []).filter((c) => c.login_created)
  if (minted.length) {
    toast.success(
      `${minted.length} sign-in account${minted.length === 1 ? '' : 's'} created, all on the starting password ${minted[0].initial_password}. ` +
        'Nothing is emailed — download the list and hand each student their login.',
      {
        duration: 0,
        action: {
          label: 'Download logins',
          onClick: () => downloadCsv(stampedName('new-student-logins'), [
            ['last_name', 'first_name', 'login', 'password'],
            ...minted.map((c) => [c.last_name, c.first_name, c.login_id ?? c.email, c.initial_password]),
          ]),
        },
      },
    )
  }
  return res
}

/* ── Manual: one student at a time ────────────────────────────────────── */

const fieldStyle = { padding: '10px 12px', fontSize: 13, fontFamily: sans, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, width: '100%' }
const labelStyle = { display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: muted }
const optional = <span style={{ color: faint, fontWeight: 400 }}>(optional)</span>

/**
 * The admin's single-user form with the role fixed to student. Grade 12 and
 * below sign in by the last six digits of their LRN; college learners carry
 * no LRN, so theirs come from the student number. Same rules as
 * admin/UsersTab.jsx, all from lib/validation.
 */
function ManualCreate({ classes, prefix, onDone, fileOpen, onToggleFile }) {
  const blank = {
    classId: classes[0]?.id ?? '', firstName: '', middleName: '', lastName: '',
    studentNumber: '', lrn: '', birthdate: '', personalEmail: '',
  }
  const [form, setForm] = useState(blank)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)

  /* The spreadsheet writer is only fetched on the first download, so that
     click can sit for a second or two with nothing on screen moving. Without
     this the button looked dead and a second click handed over two files. */
  async function onDownloadTemplate() {
    if (preparing) return
    setPreparing(true)
    try {
      await downloadTemplate()
    } catch {
      setError('The template could not be prepared. Try that again in a moment.')
    } finally {
      setPreparing(false)
    }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // The class decides the level: the teacher picked Elementary / High School /
  // College when creating it (ClassFormModal), and its grade_level and section
  // are the student's too. Nothing here asks twice.
  const chosen = classes.find((c) => c.id === form.classId) ?? null
  const isG12 = chosen ? chosen.education_level !== 'College' : true
  const idSource = isG12 ? form.lrn : form.studentNumber
  const loginPreview = prefix ? issuedLoginId(prefix, idSource) : form.personalEmail.trim()

  async function submit(e) {
    e.preventDefault()
    setDone('')
    const problem =
      (!form.classId ? 'Create a class first — every student is enrolled into one as their account is made.' : '') ||
      nameError(form.firstName, { label: 'First name' }) ||
      nameError(form.middleName, { label: 'Middle name', required: false }) ||
      nameError(form.lastName, { label: 'Last name' }) ||
      idNumberError(form.studentNumber, { label: 'Student number' }) ||
      (isG12
        ? lrnError(form.lrn)
        : (String(form.studentNumber).replace(/\D/g, '').length < 6
            ? 'The student number needs at least 6 digits — the last six become their login.'
            : '')) ||
      (form.personalEmail.trim() ? emailError(form.personalEmail) : '') ||
      (!prefix && !form.personalEmail.trim()
        ? 'No school abbreviation is on your account, so this student needs an email to sign in with.'
        : '') ||
      // Parental-access linking age-gates on the birthdate.
      (!form.birthdate ? 'Birthdate is required — parental access checks depend on it.' : '')
    if (problem) return setError(problem)
    setError('')

    const level = String(chosen?.grade_level ?? '').trim()
    const section = String(chosen?.section ?? '').trim()
    const row = {
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      student_number: form.studentNumber.trim(),
      birthdate: form.birthdate,
      ...(form.middleName.trim() ? { middle_name: form.middleName.trim() } : {}),
      ...(isG12 && form.lrn.trim() ? { lrn: form.lrn.trim() } : {}),
      ...(form.personalEmail.trim() ? { email: form.personalEmail.trim() } : {}),
      ...(section ? { section } : {}),
      ...(level ? (isG12 ? { grade_level: level } : { year_level: level }) : {}),
    }

    /* An account is not an entry that can be taken back: the sign-in exists
       the moment this returns, and the only way out is to deactivate it. The
       login is quoted because it is derived, not typed -- the last six digits
       of the number above -- so this is the first place the teacher sees the
       thing they will be reading out. */
    if (!(await confirmDialog({
      title: `Create an account for ${form.firstName.trim()} ${form.lastName.trim()}?`,
      message: `They are enrolled in ${chosen ? classLabel(chosen) : 'the class'} and sign in as ${loginPreview}. An account cannot be deleted afterwards, only deactivated.`,
      confirmLabel: 'Create account',
    }))) return

    setBusy(true)
    try {
      const res = await provisionInto(form.classId, [row])
      const made = res.created?.[0]
      const skipped = res.skipped?.[0]
      const failed = res.failed?.[0]
      if (made) {
        setDone(made.login_created
          ? `Created. ${made.first_name} signs in as ${made.login_id ?? made.email} with the password “${made.initial_password}” — hand them both directly, nothing is emailed.`
          : `${made.first_name} already had an account and is now enrolled in the class.`)
        setForm({ ...blank, classId: form.classId })
        onDone()
      } else if (skipped) {
        setError(`${form.firstName.trim()} is already enrolled in that class.`)
      } else {
        setError(failed?.reason || 'The account could not be created. Check the details and try again.')
      }
    } catch (err) {
      setError(err.body?.failed?.[0]?.reason || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ padding: '18px 22px', borderTop: `1px solid ${line}` }}>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', width: '100%' }}>
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
          Into class
          {classes.length ? (
            <select value={form.classId} onChange={set('classId')} className="ak-input" style={{ ...fieldStyle, fontWeight: 700, cursor: 'pointer' }}>
              {classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
            </select>
          ) : (
            <span style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 6, color: muted, background: 'rgba(14,42,92,0.03)' }}>
              No class yet — <Link to="/teacher/classes" style={{ color: navy, fontWeight: 700 }}>create one</Link> to enrol students into.
            </span>
          )}
          {chosen && (
            <span style={{ fontSize: 12, fontWeight: 400, color: faint }}>
              {chosen.education_level || 'High School'}{chosen.grade_level ? ` · ${chosen.grade_level}` : ''}{chosen.section ? ` · ${chosen.section}` : ''} — taken from the class, so{' '}
              {isG12 ? 'the login comes from the LRN.' : 'no LRN is asked for; the login comes from the student number.'}
            </span>
          )}
        </label>
        <label style={labelStyle}>First name<input style={fieldStyle} value={form.firstName} onChange={set('firstName')} /></label>
        <label style={labelStyle}>Middle name {optional}<input style={fieldStyle} value={form.middleName} onChange={set('middleName')} /></label>
        <label style={labelStyle}>Last name<input style={fieldStyle} value={form.lastName} onChange={set('lastName')} /></label>
        <label style={labelStyle}>Student number<input style={fieldStyle} value={form.studentNumber} onChange={set('studentNumber')} /></label>
        {isG12 && (
          <label style={labelStyle}>LRN<input style={fieldStyle} value={form.lrn} onChange={set('lrn')} placeholder="12-digit LRN" inputMode="numeric" /></label>
        )}
        <label style={labelStyle}>Birthdate<input style={fieldStyle} type="date" value={form.birthdate} onChange={set('birthdate')} /></label>
        <label style={labelStyle}>
          Personal email <span style={{ color: faint, fontWeight: 400 }}>({prefix ? 'optional — their password recovery' : 'becomes their login'})</span>
          <input style={fieldStyle} type="email" value={form.personalEmail} onChange={set('personalEmail')} />
        </label>
      </div>

      {loginPreview ? (
        /* The one line the teacher must carry away from this form -- the exact
           string the student types to sign in, NOT their full LRN or student
           number. Same callout as Admin -> Users (Feedback Fixes pane). */
        <div style={{
          marginTop: 14, padding: '12px 16px', borderRadius: 10,
          background: 'rgba(14,42,92,0.05)', border: '1px solid rgba(14,42,92,0.18)',
          display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: ink }}>They will sign in as</span>
          <strong style={{ ...mono, fontSize: 19, fontWeight: 800, color: navy, letterSpacing: '0.03em' }}>{loginPreview}</strong>
          <span style={{ fontSize: 12.5, color: faint }}>
            — this exact form, not the full {isG12 ? 'LRN' : 'student number'} · starting password <span style={mono}>{DEFAULT_PASSWORD}</span>
          </span>
        </div>
      ) : (
        <p style={{ ...mono, fontSize: 12.5, color: prefix ? faint : red, margin: '12px 0 0' }}>
          {prefix
            ? `Their login will be ${prefix}-<last 6 digits of their ${isG12 ? 'LRN' : 'student number'}>`
            : 'No school abbreviation is on your account, so the personal email becomes the login.'}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2.5" style={{ marginTop: 12 }}>
        <button type="submit" style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }} disabled={busy}>
          {busy ? 'Adding…' : 'Add student'}
        </button>
        <button type="button" style={{ ...btnGhost, opacity: preparing ? 0.55 : 1 }} disabled={preparing}
                onClick={onDownloadTemplate} title="An .xlsx with the columns filled in below, headers only">
          {preparing ? 'Preparing…' : 'Download template'}
        </button>
        <button type="button" style={{ ...btnGhost, ...(fileOpen ? { background: 'rgba(14,42,92,0.08)' } : {}) }} onClick={onToggleFile}>
          {fileOpen ? 'Hide file upload' : 'Create accounts from a file'}
        </button>
      </div>
      {error && <p style={{ fontSize: 13, color: red, margin: '10px 0 0' }}>{error}</p>}
      {done && <p style={{ fontSize: 13, color: green, fontWeight: 600, margin: '10px 0 0' }}>{done}</p>}
    </form>
  )
}

/* ── Bulk upload ──────────────────────────────────────────────────────── */

function BulkCreate({ classes, prefix, onDone }) {
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null)
    setParseError('')
    try {
      const parsed = file.name.toLowerCase().endsWith('.xlsx')
        ? await readXlsxRows(file)
        : parseCsv(await file.text())
      if (parsed.length < 2) throw new Error('The file needs a header row and at least one data row.')
      const header = parsed[0].map((h) => String(h ?? '').trim().toLowerCase())
      const missing = REQUIRED.filter((c) => !header.includes(c))
      if (missing.length) throw new Error(`Missing column(s): ${missing.join(', ')}`)
      const known = new Set([...REQUIRED, ...OPTIONAL])
      setRows(parsed.slice(1).map((cells) => {
        const row = {}
        header.forEach((h, i) => { if (known.has(h)) row[h] = String(cells[i] ?? '').trim() })
        return row
      }).filter((r) => Object.values(r).some(Boolean)))
      setFileName(file.name)
    } catch (err) {
      setRows([]); setFileName(''); setParseError(err.message)
    }
    e.target.value = ''
  }

  const problems = rows.map((r) => rowProblem(r, prefix))
  const ready = rows.filter((_, i) => !problems[i])

  async function upload() {
    if (!classId || !ready.length) return
    /* Same one-shot request as the admin bulk upload: every row is created
       server-side in a single call, so this is the last point where backing
       out changes anything. The rows the file already lost to validation are
       named here rather than only in the list above it. */
    const dropped = rows.length - ready.length
    if (!(await confirmDialog({
      title: `Create ${ready.length} account${ready.length === 1 ? '' : 's'}?`,
      message:
        (dropped
          ? `${dropped} row${dropped === 1 ? ' is' : 's are'} incomplete and will be left out. `
          : '') +
        'Each remaining row becomes a separate account, enrolled and able to sign in straight away. Creating cannot be stopped once it starts.',
      confirmLabel: 'Create accounts',
    }))) return

    setBusy(true); setResult(null)
    try {
      const res = await provisionInto(classId, ready)
      setResult(res)
      if (res.summary?.created || res.summary?.skipped) onDone()
    } catch (err) {
      setResult(err.body ?? { created: [], skipped: [], failed: [{ email: '', reason: err.message }] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '18px 22px', borderTop: `1px solid ${line}` }}>
      {/* Named for what it does: this upload CREATES accounts and enrols them.
         The class page's "Bulk Upload Roster" only matches students who
         already have one -- a tester read the two as the same thing. */}
      <h4 style={{ ...serif, fontSize: 16, color: ink, margin: '0 0 10px' }}>Create accounts from a file</h4>
      <div className="flex flex-wrap items-end gap-3">
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: muted }}>
          Into class
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="ak-input"
                  style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, minWidth: 220 }}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{classLabel(c)}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: muted }}>
          File (.csv or .xlsx)
          <input type="file" accept=".csv,.xlsx" onChange={onFile} style={{ fontSize: 13 }} />
        </label>
        <button type="button" style={{ ...btnPrimary, opacity: !ready.length || busy ? 0.5 : 1 }} disabled={!ready.length || busy} onClick={upload}>
          {busy ? 'Creating…' : `Create ${ready.length || ''} account${ready.length === 1 ? '' : 's'}`.replace('  ', ' ')}
        </button>
      </div>
      <p style={{ fontSize: 12, color: faint, margin: '10px 0 0', maxWidth: 760 }}>
        Columns: <span style={mono}>first_name, last_name, student_number</span> — optional{' '}
        <span style={mono}>lrn, email, birthdate, grade_level, section</span>.{' '}
        {prefix
          ? <>Logins are issued as <span style={mono}>{prefix}-</span> plus the last six digits of the LRN (or student number); everyone starts on <span style={mono}>{DEFAULT_PASSWORD}</span> and is asked to change it.</>
          : <>No school abbreviation is on your account, so each row needs an <span style={mono}>email</span>, which becomes the login.</>}
      </p>
      {parseError && <p style={{ fontSize: 13, color: red, margin: '10px 0 0' }}>{parseError}</p>}

      {rows.length > 0 && !result && (
        <div style={{ marginTop: 14, overflowX: 'auto', border: `1px solid ${line}`, borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr style={{ background: 'rgba(14,42,92,0.03)' }}>
                <th style={th}>Student</th><th style={th}>ID / LRN</th><th style={th}>Login</th><th style={th}>Check</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${line}` }}>
                  <td style={td}>{r.last_name}, {r.first_name}</td>
                  <td style={{ ...td, ...mono, fontSize: 12.5 }}>{r.lrn || r.student_number}</td>
                  <td style={{ ...td, ...mono, fontSize: 12.5 }}>{problems[i] ? '—' : rowLogin(r, prefix)}</td>
                  <td style={{ ...td, fontSize: 12.5, color: problems[i] ? red : green }}>{problems[i] || 'ready'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '8px 14px', fontSize: 12, color: faint, borderTop: `1px solid ${line}` }}>
            {fileName} · {ready.length} of {rows.length} row{rows.length === 1 ? '' : 's'} ready
          </div>
        </div>
      )}

      {result && (() => {
        // The endpoint's "created" means "now on this roster": an account it
        // minted and one that already existed both land there, told apart by
        // login_created. Read that way, or a second-class upload of the same
        // list looks like it did nothing.
        const created = result.created ?? []
        const minted = created.filter((c) => c.login_created).length
        const reused = created.length - minted
        const inClass = result.skipped?.length ?? 0
        const failed = result.failed?.length ?? 0
        return (
        <div style={{ marginTop: 14, fontSize: 13, color: ink }}>
          <strong>{minted} account{minted === 1 ? '' : 's'} created</strong>
          {' · '}{reused} already had an account, added to this class
          {' · '}{inClass} already in this class
          {' · '}{failed} failed
          {(result.failed ?? []).length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: red, fontSize: 12.5 }}>
              {result.failed.map((f, i) => <li key={i}>{f.email || f.student_number || `row ${i + 1}`}: {f.reason}</li>)}
            </ul>
          )}
          <div style={{ marginTop: 10 }}>
            <button type="button" style={btnGhost} onClick={() => { setResult(null); setRows([]); setFileName('') }}>Upload another file</button>
          </div>
        </div>
        )
      })()}
    </div>
  )
}

/* ── Account rows ─────────────────────────────────────────────────────── */

/**
 * What Deactivate and Reactivate ask before they act (T-48).
 *
 * Deactivate is the account switch, not a class switch: it disables the
 * student's sign-in everywhere (lib/admin.js → the staff endpoint, which
 * only lets a teacher do it to a student on their own roster) and leaves
 * them on every roster, marked. The old confirm said "hidden from your
 * rosters", which is not what happens, and a tester read it the way it
 * was written — she expected one class to drop off the student's dashboard
 * and got a student who could not sign in at all. The thing she wanted
 * exists on the class page as Remove from the roster, so the confirm now
 * says which of the two this is and points at the other.
 */
export const signInConfirm = {
  off: (name) => ({
    title: `Turn off ${name}'s sign-in?`,
    message: `This stops ${name} signing in to ActivKlass at all, until you reactivate them. They stay on your rosters. To take them out of one class only, remove them from that class's roster on the class page instead.`,
    confirmLabel: 'Turn sign-in off',
    tone: 'danger',
  }),
  on: (name) => ({
    title: `Reactivate ${name}?`,
    message: `${name} can sign in again, with the password they already have.`,
    confirmLabel: 'Turn sign-in on',
  }),
}

/**
 * What Reset password says before and after (T-46).
 *
 * A password a teacher sets is a starting password again: the endpoint
 * stamps is_temp_password on every reset, and the student is held on the
 * new-password step at their next sign-in until they choose their own
 * (the owner's 2026-08-25 rule -- no account is worked on a password staff
 * issued). This dialog used to say "they should change it after signing
 * in", which reads as optional, so a teacher handed over a "final"
 * password and both sides read the forced change as a bug. The admin
 * console's copy of this dialog already says "will be asked" (T-16); this
 * is the same sentence.
 */
export const resetCopy = {
  prompt: (login) =>
    `This replaces the password for ${login} immediately. At least ${MIN_PASSWORD} characters — they will be asked to choose a new password the next time they sign in.`,
  done: (login) =>
    `Password set for ${login}. Pass it on in person — nothing is emailed. They'll pick their own the next time they sign in.`,
}

export function AccountRow({ user, classes, onChanged }) {
  // Membership is the class's student_ids array (DATA-MODEL: no join table).
  const enrolledIn = (classes ?? []).filter((c) => (c.student_ids ?? []).includes(user.id))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const active = (user.status ?? 'active') === 'active'

  async function run(label, fn) {
    setBusy(label); setError('')
    try { await fn(); onChanged() } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  async function toggleActive() {
    const name = `${user.first_name} ${user.last_name}`
    if (!(await confirmDialog(active ? signInConfirm.off(name) : signInConfirm.on(name)))) return
    // Both halves: status marks them on every roster, disabling stops the login.
    run('status', async () => {
      await updateDoc(doc(db, 'users', user.id), { status: active ? 'inactive' : 'active' })
      await setAccountDisabled(user.id, active)
    })
  }

  async function doReset() {
    const pw = await promptDialog({
      title: 'Set a new password',
      message: resetCopy.prompt(user.login_id ?? user.email),
      label: 'New password',
      placeholder: `e.g. ${DEFAULT_PASSWORD}`,
      confirmLabel: 'Set password',
      required: true,
      trim: false,
      validate: tempPasswordError,
    })
    if (pw == null) return
    run('password', async () => {
      await resetPassword(user.id, pw)
      toast.success(resetCopy.done(user.login_id ?? user.email))
    })
  }

  return (
    <tr style={{ borderTop: `1px solid ${line}` }}>
      <td style={td}>
        <div style={{ fontWeight: 500 }}>{user.last_name}, {user.first_name}</div>
        {error && <div style={{ fontSize: 12, color: red, marginTop: 4 }}>{error}</div>}
      </td>
      <td style={td}>
        {enrolledIn.length === 0
          ? <span style={{ color: faint }}>—</span>
          : (
            <div className="flex flex-wrap gap-1.5">
              {enrolledIn.map((c) => (
                <Link key={c.id} to={`/teacher/classes/${c.id}`} title="Open class"
                      style={{ padding: '2px 8px', fontSize: 11.5, fontWeight: 600, color: navy, background: 'rgba(14,42,92,0.06)', borderRadius: 999, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  {classLabel(c)}
                </Link>
              ))}
            </div>
          )}
      </td>
      <td style={{ ...td, ...mono, fontSize: 12.5 }}>{user.login_id ?? user.email ?? '—'}</td>
      <td style={td}>
        {/* "sign-in off", not "inactive": the list has to say the same thing
            the confirm said, and "inactive" reads as paused in a class. */}
        <Pill fg={active ? green : red} bg={active ? 'rgba(31,138,91,0.10)' : 'rgba(192,57,43,0.08)'}>{active ? 'active' : 'sign-in off'}</Pill>
        {user.is_temp_password && (
          <div style={{ marginTop: 5 }}><Pill fg={goldDeep} bg="rgba(245,197,24,0.16)">starting password</Pill></div>
        )}
      </td>
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button type="button" style={btnGhost} onClick={doReset} disabled={!!busy}>
          {busy === 'password' ? '…' : 'Reset password'}
        </button>
        <button
          type="button"
          style={{ ...btnGhost, marginLeft: 8, color: active ? red : green, borderColor: active ? 'rgba(192,57,43,0.3)' : 'rgba(31,138,91,0.3)' }}
          onClick={toggleActive}
          disabled={!!busy}
        >
          {busy === 'status' ? '…' : active ? 'Deactivate' : 'Reactivate'}
        </button>
      </td>
    </tr>
  )
}

/* ── The card ─────────────────────────────────────────────────────────── */

export default function StudentAccounts({ classes, rows }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  // Its own tab on the Students page now, so the list is always open.
  // The form is always there; the file upload unfolds under it on demand.
  const [fileOpen, setFileOpen] = useState(false)
  const [search, setSearch] = useState('')

  // The directory can hold one student several times (once per class); the
  // account is one thing, so this collapses to unique ids.
  const ids = useMemo(() => [...new Set((rows ?? []).map((r) => r.studentId))], [rows])
  const { data: users, isLoading } = useQuery({
    queryKey: ['fs-solo-student-accounts', profile?.id, ids.join(',')],
    queryFn: () => fetchUsersByIds(ids),
    enabled: ids.length > 0,
  })

  // school_directory ids are the lowercased abbreviation; that IS the prefix
  // the backend issues from (classes.provision_students / _login_prefix_for).
  const prefix = String(profile?.teaching_school_id ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)

  function refresh() {
    qc.invalidateQueries({ queryKey: ['fs-solo-student-accounts'] })
    qc.invalidateQueries({ queryKey: ['fs-student-directory'] })
    qc.invalidateQueries({ queryKey: ['fs-classes'] })
  }

  const shown = (users ?? [])
    .filter((u) => {
      const needle = search.trim().toLowerCase()
      if (!needle) return true
      return `${u.first_name} ${u.last_name} ${u.login_id ?? ''} ${u.email ?? ''}`.toLowerCase().includes(needle)
    })
    .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`))

  return (
    <div style={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ padding: '16px 22px' }}>
        <div>
          <h3 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>Student accounts</h3>
          <p style={{ fontSize: 12.5, color: muted, margin: '3px 0 0', maxWidth: 640 }}>
            On your own subscription you issue your students' logins, reset their passwords and deactivate
            anyone who leaves — there is no school admin in between.
            {prefix && <> Logins start with <span style={mono}>{prefix}-</span>.</>}
          </p>
        </div>
        <span style={{ ...mono, fontSize: 12, color: faint }}>{ids.length} account{ids.length === 1 ? '' : 's'}</span>
      </div>

      <ManualCreate classes={classes ?? []} prefix={prefix} onDone={refresh} fileOpen={fileOpen} onToggleFile={() => setFileOpen((v) => !v)} />
      {fileOpen && (classes?.length
        ? <BulkCreate classes={classes} prefix={prefix} onDone={refresh} />
        : <p style={{ padding: '0 22px 16px', fontSize: 13, color: muted, margin: 0 }}>Create a class first, then upload students into it.</p>)}

      {ids.length === 0 ? (
        <p style={{ padding: '0 22px 18px', fontSize: 13, color: muted, margin: 0 }}>
          No student accounts yet — add one with the form above, or download the template and upload a whole class at once.
        </p>
      ) : (
        <div style={{ borderTop: `1px solid ${line}` }}>
          <div style={{ padding: '12px 22px' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or login…"
              className="ak-input"
              style={{ width: '100%', maxWidth: 320, padding: '9px 12px', fontSize: 13, fontFamily: sans, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10 }}
            />
          </div>
          {isLoading ? (
            <p style={{ padding: '0 22px 16px', fontSize: 13, color: faint, margin: 0 }}>Loading accounts…</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'rgba(14,42,92,0.02)' }}>
                    <th style={th}>Student</th><th style={th}>Classes</th><th style={th}>Sign-in</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u) => <AccountRow key={u.id} user={u} classes={classes} onChanged={refresh} />)}
                  {shown.length === 0 && (
                    <tr><td colSpan={5} style={{ ...td, color: faint, textAlign: 'center' }}>No accounts match.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
