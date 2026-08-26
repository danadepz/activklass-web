import { Fragment, useState } from 'react'
import { parseCsv } from '@/lib/roster'
import { bulkCreateUsers } from '@/lib/admin'
import { issuedLoginId, DEFAULT_PASSWORD } from '@/lib/logins'
import { stampedName } from '@/lib/csv'
import { downloadXlsx, readXlsxRows } from '@/lib/xlsx'
import { navy, ink, muted, faint, green, red, line, mono } from '@/theme'
import { CREATABLE_ROLES, MIN_PASSWORD, card, btnPrimary, btnGhost, th } from './ui'
import Notice from './Notice'
import CardHead from './CardHead'
import RolePicker from './RolePicker'

const REQUIRED = ['first_name', 'last_name']
const OPTIONAL = [
  'role', 'email', 'middle_name', 'password', // blank password -> the default
  'student_number', 'lrn',                    // students: number always; LRN for Grade 12 & below
  'grade', 'section', 'birthdate',            // grade is stored as year_level
  'employee_number', 'department',            // teachers: number required per row
  'course', 'year_level',
]

/* One template per role, holding exactly the data gathered for that role —
   the download follows the role chosen above it. Students get one Grade 12 &
   below example (LRN + grade/section) and one college example (student
   number only, course, with the year in the grade column since grade is
   stored as year_level either way). */
const TEMPLATES = {
  student: {
    columns: ['first_name', 'middle_name', 'last_name', 'student_number', 'lrn',
              'grade', 'section', 'course', 'birthdate', 'password'],
    rows: [
      ['Ana', '', 'Bautista', '2024-00123', '136728190501', 'Grade 9', 'Rizal', '', '2010-03-14', ''],
      ['Juan', 'Reyes', 'Dela Cruz', '2022-04567', '', '3rd Year', '', 'BSIT', '2004-07-01', ''],
    ],
  },
  teacher: {
    columns: ['first_name', 'middle_name', 'last_name', 'employee_number', 'department', 'password'],
    rows: [
      ['Maria', '', 'Santos', 'T-2024-018', 'Mathematics', ''],
    ],
  },
}

// Admins are not bulk-uploaded: an admin row needs a real inbox, and there are
// never enough of them to be worth a spreadsheet. A `role` column can still
// carry one.
const BULK_ROLES = ['teacher', 'student']

/* What a row needs, per role. This lived in the card's subtitle as one 130-word
   paragraph covering both roles at once — most of a screen of prose before the
   first click, half of it about the role you were not uploading. Same rules, as
   a column/rule table, and only for the role that was picked. Keep it in step
   with rowProblem below. */
const ROW_SPEC = {
  student: [
    ['first_name · last_name', 'Required. middle_name is optional.'],
    ['student_number', 'Required on every student row.'],
    ['lrn', '12 digits for Grade 12 & below. College rows leave it blank — then the student number carries the 6+ digits instead.'],
    ['birthdate', 'Required, as YYYY-MM-DD. Parental access checks against it.'],
    ['grade · section · course', 'Optional. grade is stored as the year level, for school and college rows alike.'],
    ['password', `Optional. Blank starts them on ${DEFAULT_PASSWORD}, usable immediately — so have them change it.`],
  ],
  teacher: [
    ['first_name · last_name', 'Required. middle_name is optional.'],
    ['employee_number', 'Required, and needs at least 6 digits — the last six become the login.'],
    ['department', 'Optional.'],
    ['password', `Optional. Blank starts them on ${DEFAULT_PASSWORD}, usable immediately — so have them change it.`],
  ],
}

/** What stops a row from being accepted; mirrors _prepare_user in api/admin.py.
 *  Per the manuscript (Fig. 49-50): Grade 12 & below carry a 12-digit LRN
 *  alongside their student number; college learners have the number only, so
 *  a row without an LRN needs six digits in the student number instead. */
function rowProblem(row, prefix) {
  if (!row.first_name || !row.last_name) return 'missing name'
  if (row.password && row.password.length < MIN_PASSWORD) return 'password too short'
  if (!CREATABLE_ROLES.includes(row.role)) {
    return row.role === 'parent' ? 'parents self-register' : `bad role '${row.role}'`
  }
  if (row.role === 'student') {
    if (!row.student_number) return 'missing student_number'
    if (row.lrn && !/^\d{12}$/.test(row.lrn)) return 'LRN must be 12 digits'
    if (!row.lrn && (row.student_number ?? '').replace(/\D/g, '').length < 6) {
      return 'needs a 12-digit LRN or a student number with 6+ digits'
    }
    // Required: parental-access linking age-gates on it (api/admin.py agrees).
    if (!row.birthdate) return 'missing birthdate'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.birthdate)) return 'birthdate must be YYYY-MM-DD'
  }
  if (row.role === 'teacher' && !row.employee_number) return 'missing employee_number'
  if (!row.email) {
    if (row.role === 'admin') return 'admin rows need an email'
    if (!prefix) return 'no email, and no login prefix set'
    if (row.role === 'teacher' && !issuedLoginId(prefix, row.employee_number)) {
      return 'employee number needs 6 digits'
    }
  }
  return ''
}

/** The login this row will get: its own email, or one issued from the prefix. */
function rowLogin(row, prefix) {
  if (row.email) return row.email
  return issuedLoginId(prefix, row.role === 'student'
    ? (row.lrn || row.student_number)
    : row.employee_number)
}

/**
 * Bulk Upload Teachers / Bulk Upload Students.
 *
 * One component for both: the CSV is identical apart from the role, so a
 * default role is chosen here and a per-row `role` column overrides it. Two
 * near-identical screens would drift.
 *
 * The `email` column is optional: teacher and student rows without one get a
 * login issued from the school's prefix (see the Login prefix card), which is
 * the normal case — most students have no email of their own.
 */
export default function BulkUpload({ onDone, settings }) {
  const prefix = settings?.school?.login_prefix ?? ''
  // The role rows get when the file carries no `role` column. No preselected
  // role, same as the manual form: picking one is deliberate, and the
  // template download follows whatever is picked.
  const [uploadRole, setUploadRole] = useState('')
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

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
      const header = parsed[0].map((h) => h.trim().toLowerCase())
      const missing = REQUIRED.filter((c) => !header.includes(c))
      if (missing.length) throw new Error(`Missing column(s): ${missing.join(', ')}`)

      const known = new Set([...REQUIRED, ...OPTIONAL])
      const mapped = parsed.slice(1).map((cells) => {
        const row = {}
        header.forEach((h, i) => {
          if (known.has(h)) row[h] = (cells[i] ?? '').trim()
        })
        if (!row.role) row.role = uploadRole
        return row
      })
      setRows(mapped)
      setFileName(file.name)
    } catch (err) {
      setRows([])
      setFileName('')
      setParseError(err.message)
    }
    e.target.value = ''  // let the same file be re-picked after a fix
  }

  async function upload() {
    setBusy(true)
    setResult(null)
    try {
      // `grade` is the manuscript's column name (Fig. 50); it is stored on the
      // profile as year_level, the key the rest of the app already reads.
      const res = await bulkCreateUsers(rows.map(({ grade, ...r }) => ({
        ...r,
        ...(grade ? { year_level: grade } : {}),
        role: r.role || uploadRole,
      })))
      setResult(res)
      if (res.summary.created) onDone()
    } catch (err) {
      // A 400 with a body still carries per-row detail worth showing.
      setResult(err.body ?? { summary: { total: rows.length, created: 0, failed: rows.length },
                              failed: [{ row: 0, reason: err.message }], created: [] })
    } finally {
      setBusy(false)
    }
  }

  async function downloadTemplate() {
    // The example rows leave `password` empty on purpose: that is the normal
    // case — the login is issued from the school's prefix and the last six
    // digits of the LRN / student number / employee ID, and the password
    // falls back to the default. An .xlsx rather than a CSV because the
    // headers are bold, UPPERCASE and sized to their text, which CSV cannot
    // carry; the uploader reads .xlsx back directly.
    const template = TEMPLATES[uploadRole]
    if (!template) return
    await downloadXlsx(
      stampedName(`${uploadRole}-upload-template`).replace(/\.csv$/, '.xlsx'),
      template.columns,
      template.rows,
    )
  }

  return (
    <div style={{ ...card, padding: 22 }}>
      <CardHead
        icon="📄"
        tint="rgba(245,197,24,0.15)"
        title="Bulk upload"
        sub="Creates accounts from a spreadsheet — .xlsx or CSV. Pick a role, fill in the template it hands you, and upload it back."
        style={{ marginBottom: 18 }}
      />

      {/* Role first, as in Add a user. The template's columns and the meaning
          of every row follow it, and the rules below are half the reading when
          only the picked role's are shown. */}
      <div style={{ maxWidth: 360, margin: '0 auto' }}>
        <RolePicker
          value={uploadRole}
          options={BULK_ROLES}
          onChange={(r) => {
            // Switching roles switches templates, so a file parsed under the
            // old role no longer means what it says.
            setUploadRole(r)
            setRows([])
            setFileName('')
            setResult(null)
            setParseError('')
          }}
        />
      </div>

      {!uploadRole && (
        <p style={{
          fontSize: 13, color: muted, margin: '12px auto 0', lineHeight: 1.55,
          maxWidth: 440, textAlign: 'center',
        }}>
          Pick one and this card lists what that role&apos;s rows need, and hands you a template
          with exactly those columns.
        </p>
      )}

      {uploadRole && (
        <>
          <dl style={{
            display: 'grid', gridTemplateColumns: 'max-content minmax(0,1fr)',
            columnGap: 16, rowGap: 9, margin: '18px 0 0', padding: '15px 17px',
            fontSize: 13, background: 'rgba(14,42,92,0.025)',
            border: `1px solid ${line}`, borderRadius: 12,
          }}>
            <div style={{
              gridColumn: '1 / -1', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: muted, marginBottom: 2,
            }}>
              What a {uploadRole} row needs
            </div>
            {ROW_SPEC[uploadRole].map(([columns, rule]) => (
              <Fragment key={columns}>
                <dt style={{ ...mono, fontSize: 12, color: ink, lineHeight: 1.5 }}>{columns}</dt>
                <dd style={{ margin: 0, color: muted, lineHeight: 1.5 }}>{rule}</dd>
              </Fragment>
            ))}
          </dl>

          <p style={{ fontSize: 12.5, color: prefix ? faint : red, margin: '10px 2px 0', lineHeight: 1.55 }}>
            {prefix
              ? <>
                  Logins are issued as <code style={{ ...mono, fontSize: 12 }}>{prefix}-789012</code> — your
                  school&apos;s prefix and the last six digits of the{' '}
                  {uploadRole === 'student' ? 'LRN, or of the student number for college rows' : 'employee ID'}.
                  A <code style={{ ...mono, fontSize: 12 }}>role</code> column in the file overrides the
                  role above, row by row, so one file can mix teachers and students.
                </>
              : <>No login prefix is set for your school yet — set it in the Login prefix card above,
                  or these rows have nothing to issue a login from.</>}
          </p>

          {/* Same size on purpose — colour alone tells them apart: navy for the
              action this card exists for, outlined for the helper beside it. */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            <label style={{ ...btnPrimary, display: 'inline-block' }}>
              📂 Choose file…
              <input type="file"
                     accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                     onChange={onFile}
                     style={{ display: 'none' }} />
            </label>
            <button type="button"
                    style={{ ...btnGhost, padding: '10px 18px', fontSize: 14, fontWeight: 700, borderRadius: 10,
                             display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    onClick={downloadTemplate}>
              <span aria-hidden="true" style={{ fontSize: 17, fontWeight: 900, color: navy, lineHeight: 1 }}>⬇</span>
              Download template
            </button>
            {fileName && (
              <span style={{ ...mono, fontSize: 12, color: faint }}>
                {fileName} · {rows.length} row{rows.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </>
      )}

      {parseError && <div style={{ marginTop: 14 }}><Notice>{parseError}</Notice></div>}

      {rows.length > 0 && (
        <>
          <div style={{ border: `1px solid ${line}`, borderRadius: 12, overflowX: 'auto', margin: '14px 0' }}>
            <table style={{ width: '100%', minWidth: 460, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(14,42,92,0.03)' }}>
                  {['login', 'name', 'role', 'id number', 'password'].map((h) => (
                    <th key={h} style={{ ...th, color: muted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((r, i) => {
                  const problem = rowProblem(r, prefix)
                  const login = rowLogin(r, prefix)
                  const number = r.role === 'student' ? r.student_number : r.employee_number
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${line}`, color: problem ? red : ink }}>
                      <td style={{ padding: '8px 14px' }}>{login || <em>{problem || 'no login'}</em>}</td>
                      <td style={{ padding: '8px 14px' }}>{[r.first_name, r.last_name].filter(Boolean).join(' ') || <em>missing</em>}</td>
                      <td style={{ padding: '8px 14px' }}>{r.role}</td>
                      <td style={{ padding: '8px 14px' }}>
                        {number || (r.role === 'admin' ? '—' : <em>missing</em>)}
                        {r.role === 'student' && (
                          <span style={{ ...mono, fontSize: 11, marginLeft: 6,
                                         color: !r.lrn || /^\d{12}$/.test(r.lrn) ? faint : red }}>
                            {r.lrn ? `LRN ${r.lrn}` : 'no LRN (college)'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        {r.password
                          ? (r.password.length >= MIN_PASSWORD ? '••••••••' : <em>too short</em>)
                          : <span style={{ color: faint }}>default</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length > 8 && (
              <div style={{ padding: '8px 14px', fontSize: 12, color: faint, borderTop: `1px solid ${line}` }}>
                …and {rows.length - 8} more
              </div>
            )}
          </div>

          <button style={btnPrimary} onClick={upload} disabled={busy}>
            {busy ? 'Creating…' : `Create ${rows.length} account${rows.length === 1 ? '' : 's'}`}
          </button>
        </>
      )}

      {result && (
        <div style={{ marginTop: 16 }}>
          <Notice tone={result.summary.created ? 'ok' : 'error'}>
            {result.summary.created} created, {result.summary.failed} failed
            {result.summary.created > 0 && result.summary.failed > 0
              ? ' — the created accounts are live; fix the failed rows and upload just those.'
              : ''}
          </Notice>
          {result.failed?.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13, color: muted }}>
              {result.failed.map((f, i) => (
                <li key={i}>
                  <span style={{ ...mono, fontSize: 12 }}>row {f.row + 2}</span>{' '}
                  {f.email ? <strong>{f.email}</strong> : null} — {f.reason}
                </li>
              ))}
            </ul>
          )}
          {result.failed?.length > 0 && (
            <p style={{ fontSize: 12, color: faint, marginTop: 8 }}>
              Row numbers match the spreadsheet, counting the header as row 1.
            </p>
          )}
          {result.summary.created > 0 && (
            <p style={{ fontSize: 12.5, color: green, marginTop: 8 }}>
              Re-uploading a corrected file is safe — rows that already exist are reported, not duplicated.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
