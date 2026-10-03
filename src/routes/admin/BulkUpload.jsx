import { Fragment, useMemo, useState } from 'react'
import { parseCsv } from '@/lib/roster'
import { emailError } from '@/lib/validation'
import { bulkCreateUsers } from '@/lib/admin'
import { issuedLoginId, DEFAULT_PASSWORD } from '@/lib/logins'
import { stampedName } from '@/lib/csv'
import { downloadXlsx, readXlsxRows } from '@/lib/xlsx'
import { navy, ink, muted, faint, green, red, line, mono, goldDeep } from '@/theme'
import { confirmDialog } from '@/components/ui/dialogs'
import { CREATABLE_ROLES, MIN_PASSWORD, btnPrimary, btnGhost, th } from './ui'
import { accountsNamed, accountWithEmail, accountWithLogin, accountName, describeAccount } from './duplicates'
import { summarizeFailures } from './bulkFailures'
import Notice from './Notice'

const REQUIRED = ['first_name', 'last_name']
const OPTIONAL = [
  'role', 'email', 'middle_name', 'password', // blank password -> the default
  'personal_email',                           // a contact address on file, never the sign-in
  'student_number', 'lrn',                    // students: number always; LRN for Grade 12 & below
  'grade', 'section', 'birthdate',            // grade is stored as year_level
  'employee_number', 'department',            // teachers: number required per row
  'course', 'year_level',
]

/* One template per role, holding exactly the columns gathered for that role —
   the download follows the role chosen above it. Headers only: an earlier
   version shipped sample rows (Ana Bautista, Maria Santos…) to show the
   format, and a downloaded template read as if it already held someone's
   data — and uploaded unedited, it would have created those people. The
   per-column rules live in the ROW_SPEC table on the card instead. */
const TEMPLATES = {
  student: {
    columns: ['first_name', 'middle_name', 'last_name', 'student_number', 'lrn',
              'grade', 'section', 'course', 'birthdate', 'personal_email', 'password'],
  },
  teacher: {
    columns: ['first_name', 'middle_name', 'last_name', 'employee_number', 'department',
              'personal_email', 'password'],
  },
}

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
    ['personal_email', 'Recommended — their own inbox, like sample.juan@gmail.com, as a contact on file. This upload is the only place it gets on file (they can only confirm it later, not add it). Never the sign-in: they sign in with the issued login, and a staff reset from this console is how they get back in.'],
    ['password', `Optional. Blank starts them on ${DEFAULT_PASSWORD}, usable immediately — so have them change it.`],
  ],
  teacher: [
    ['first_name · last_name', 'Required. middle_name is optional.'],
    ['employee_number', 'Required, and needs at least 6 digits — the last six become the login.'],
    ['department', 'Optional.'],
    ['personal_email', 'Recommended — their own inbox, like sample.maria@gmail.com, as a contact on file. This upload is the only place it gets on file (they can only confirm it later, not add it). Never the sign-in: they sign in with the issued login, and a staff reset from this console is how they get back in.'],
    ['password', `Optional. Blank starts them on ${DEFAULT_PASSWORD}, usable immediately — so have them change it.`],
  ],
}

/** What stops a row from being accepted; mirrors _prepare_user in api/admin.py.
 *  Per the manuscript (Fig. 49-50): Grade 12 & below carry a 12-digit LRN
 *  alongside their student number; college learners have the number only, so
 *  a row without an LRN needs six digits in the student number instead. */
export function rowProblem(row, prefix) {
  if (!row.first_name || !row.last_name) return 'missing name'
  if (row.password && row.password.length < MIN_PASSWORD) return 'password too short'
  if (!CREATABLE_ROLES.includes(row.role)) {
    if (row.role === 'parent') return 'parents self-register'
    // Admin is excluded from CREATABLE_ROLES on purpose (2026-10-03, owner:
    // "a school admin shouldn't be able to create another admin") -- a
    // `role` column saying 'admin' used to reach a dedicated branch below
    // that only asked for an email. It is refused here instead, the same as
    // any other role this screen does not hand out.
    return row.role === 'admin' ? 'admin accounts are not created here' : `bad role '${row.role}'`
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
  // Teachers and students always sign in with the issued login; an email on
  // their row is a personal contact address, not a login.
  const personal = row.personal_email || row.email
  if (personal && emailError(personal)) return 'personal_email is not an email'
  if (!prefix) return 'no login prefix set'
  if (row.role === 'teacher' && !issuedLoginId(prefix, row.employee_number)) {
    return 'employee number needs 6 digits'
  }
  return ''
}

/** The login this row will get, issued from the prefix. A row whose `role`
 *  column is not 'teacher' or 'student' (admin included) has no issued
 *  login to preview -- rowProblem refuses it before it can be created, so
 *  this is display-only for the table, not a path to one. */
export function rowLogin(row, prefix) {
  if (!CREATABLE_ROLES.includes(row.role)) return undefined
  return issuedLoginId(prefix, row.role === 'student'
    ? (row.lrn || row.student_number)
    : row.employee_number)
}

/**
 * Whether this row is someone the school already has, said in the preview
 * rather than found afterwards in the users table. A row is checked against
 * the directory *and* against the rows above it, since one sheet listing the
 * same person twice is the commoner mistake of the two.
 *
 * `rows` is the file with each row given its `login_id` and spreadsheet
 * `line` (see `withLogins`), so it carries the same `first_name` /
 * `last_name` / `personal_email` / `login_id` keys a profile does and the
 * earlier rows go through the same three calls the directory does.
 *
 * The login comes first: it is the prefix plus the last six digits of the
 * number, so two different people whose LRNs end alike are issued the same
 * login, and the server refuses the second as "already exists" — the one
 * duplicate that actually blocks creation was the one this never mentioned
 * (andecobs-45). `kind` says which check bit, for the counts under the
 * table. `tone: 'error'` is a taken login or a reused address, each of which
 * belongs to one person; `'warn'` is a shared name, which is allowed and
 * merely worth seeing.
 */
function rowDuplicate(row, index, rows, users) {
  const earlier = rows.slice(0, index)
  const holder = accountWithLogin(users, row.login_id)
  if (holder) {
    return { tone: 'error', kind: 'login', note: `${row.login_id} already belongs to ${accountName(holder)}` }
  }
  const above = accountWithLogin(earlier, row.login_id)
  if (above) {
    return { tone: 'error', kind: 'login', note: `same login as ${accountName(above)} (row ${above.line}) — ${row.login_id}` }
  }
  const email = row.personal_email || row.email
  const owner = accountWithEmail(users, email)
  if (owner) return { tone: 'error', kind: 'email', note: `${email} is already ${describeAccount(owner)}’s` }
  if (accountWithEmail(earlier, email)) return { tone: 'error', kind: 'email', note: `${email} is on an earlier row` }
  const onFile = accountsNamed(users, row.first_name, row.last_name)
  if (onFile.length) return { tone: 'warn', kind: 'name', note: `same name as ${onFile.map(describeAccount).join(', ')}` }
  if (accountsNamed(earlier, row.first_name, row.last_name).length) {
    return { tone: 'warn', kind: 'name', note: 'same name as an earlier row' }
  }
  return null
}

/**
 * Bulk Upload Teachers / Bulk Upload Students.
 *
 * One component for both: the CSV is identical apart from the role, so the
 * caller passes which one this upload is for and a per-row `role` column can
 * still override it. Two near-identical screens would drift.
 *
 * `role` is chosen one level up, by AddUserSection's Teacher | Student
 * control (T-113) — this component no longer picks its own, and is not
 * mounted until a role is set, same as before. The caller remounts it (keyed
 * by role) when the admin switches roles, so a file parsed under the old
 * role does not carry over.
 *
 * Teacher and student rows always get their login issued from the school's
 * prefix (see the Login prefix card). A `personal_email` column — their own
 * inbox, like sample.maria@gmail.com — is stored on the profile for password
 * recovery, because not everyone has a school email; it is never the login.
 *
 * A `role` column in the file can still independently say 'teacher' or
 * 'student' to override this screen's own choice (one teacher re-using a
 * mixed roster file, say) — but not 'admin': that used to slip through as a
 * CSV-only bypass of the create form's own rule (T-113 removed the Admin
 * option from the form, not from this column), closed 2026-10-03 alongside
 * the re-role dropdown on the Users table and firestore.rules itself. A
 * `role: 'admin'` row is refused the same as any other role this screen does
 * not hand out — see `rowProblem` below.
 */
export default function BulkUpload({ role, onDone, settings, users }) {
  const prefix = settings?.school?.login_prefix ?? ''
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)

  // Each row with the login it will be issued and its spreadsheet line, so a
  // row can be checked against the rows above it with the calls that check
  // it against the directory, and a failure can be named after the click.
  const withLogins = useMemo(
    () => rows.map((r, i) => ({ ...r, login_id: rowLogin(r, prefix), line: i + 2 })),
    [rows, prefix],
  )
  // Every row, not the eight the preview shows — the line under the table is
  // the only place a repeat on row 40 ever gets mentioned.
  const dupes = useMemo(
    () => withLogins.map((r, i) => rowDuplicate(r, i, withLogins, users)),
    [withLogins, users],
  )
  // What came back failed, grouped by reason and naming the login and person
  // on each failed row — see bulkFailures.js.
  const failures = useMemo(
    () => summarizeFailures(result?.failed, withLogins.map((r) => [r.login_id, accountName(r)].filter(Boolean).join(' '))),
    [result, withLogins],
  )
  const takenLogins = dupes.filter((d) => d?.kind === 'login').length
  const reusedEmails = dupes.filter((d) => d?.kind === 'email').length
  const sharedNames = dupes.filter((d) => d?.kind === 'name').length
  const blocking = takenLogins + reusedEmails

  /* One sentence for both places that say it: the red notice under the table,
     and the confirm the Create button now goes through. Written once so the
     dialog quotes what is already on screen rather than paraphrasing it. */
  const concerns = [
    takenLogins && `${takenLogins} row${takenLogins === 1 ? '' : 's'} would get a login that is already taken`,
    reusedEmails && `${reusedEmails} row${reusedEmails === 1 ? '' : 's'} reuse${reusedEmails === 1 ? 's' : ''} an email that already belongs to someone`,
    sharedNames && `${sharedNames} row${sharedNames === 1 ? '' : 's'} repeat${sharedNames === 1 ? 's' : ''} a name already on file`,
  ].filter(Boolean).join(', and ')

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
        if (!row.role) row.role = role
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
    /* The only moment this can still be stopped. Once it is away it is a
       single request that creates every row server-side, so there is nothing
       to cancel half-way -- a Cancel button beside "Creating…" could only
       abandon the browser's wait while the accounts were made anyway, which
       is worse than no button at all. So the counts already computed above
       get quoted back here, where backing out still changes the outcome. */
    const ok = await confirmDialog({
      title: `Create ${rows.length} account${rows.length === 1 ? '' : 's'}?`,
      message: concerns
        ? `${concerns} — each becomes a separate account. Creating cannot be stopped once it starts.`
        : 'Each row becomes a separate account, able to sign in straight away. Creating cannot be stopped once it starts.',
      confirmLabel: 'Create accounts',
      tone: blocking ? 'danger' : 'primary',
    })
    if (!ok) return

    setBusy(true)
    setResult(null)
    try {
      // `grade` is the manuscript's column name (Fig. 50); it is stored on the
      // profile as year_level, the key the rest of the app already reads.
      const res = await bulkCreateUsers(rows.map(({ grade, ...r }) => ({
        ...r,
        ...(grade ? { year_level: grade } : {}),
        role: r.role || role,
      })))
      setResult(res)
      if (res.summary.created) onDone()
    } catch (err) {
      // A 400 with a body still carries per-row detail worth showing.
      // No `row`: the request itself fell over, so no one row failed — the
      // panel says the reason plainly instead of pointing at row 2.
      setResult(err.body ?? { summary: { total: rows.length, created: 0, failed: rows.length },
                              failed: [{ reason: err.message }], created: [] })
    } finally {
      setBusy(false)
    }
  }

  async function downloadTemplate() {
    // An .xlsx rather than a CSV because the headers are bold, UPPERCASE and
    // sized to their text, which CSV cannot carry; the uploader reads .xlsx
    // back directly.
    const template = TEMPLATES[role]
    if (!template || preparing) return
    // The spreadsheet writer is only fetched on the first download, so that
    // click can sit for a second or two with nothing on screen moving — the
    // tester read that as a dead button and clicked again, getting two files.
    setPreparing(true)
    try {
      await downloadXlsx(
        stampedName(`${role}-upload-template`).replace(/\.csv$/, '.xlsx'),
        template.columns,
      )
    } catch {
      setParseError('The template could not be prepared. Try that again in a moment.')
    } finally {
      setPreparing(false)
    }
  }

  return (
    <div>
      {/* No own heading or role picker here any more -- AddUserSection asks
          Bulk | Individual, then Teacher | Student, and this component is
          not mounted until a role is chosen, so what follows is already
          role-shaped. */}
      <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, maxWidth: 640, margin: '0 0 16px' }}>
        Creates accounts from a spreadsheet — .xlsx or CSV. Fill in the template below and upload it back.
      </p>

      <dl style={{
        display: 'grid', gridTemplateColumns: 'max-content minmax(0,1fr)',
        columnGap: 16, rowGap: 9, margin: 0, padding: '15px 17px',
        fontSize: 13, background: 'rgba(14,42,92,0.025)',
        border: `1px solid ${line}`, borderRadius: 12,
      }}>
        <div style={{
          gridColumn: '1 / -1', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: muted, marginBottom: 2,
        }}>
          What a {role} row needs
        </div>
        {ROW_SPEC[role].map(([columns, rule]) => (
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
              {role === 'student' ? 'LRN, or of the student number for college rows' : 'employee ID'}.
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
                         display: 'inline-flex', alignItems: 'center', gap: 8,
                         opacity: preparing ? 0.55 : 1, cursor: preparing ? 'default' : 'pointer' }}
                disabled={preparing}
                onClick={downloadTemplate}>
          <span aria-hidden="true" style={{ fontSize: 17, fontWeight: 900, color: navy, lineHeight: 1 }}>⬇</span>
          {preparing ? 'Preparing…' : 'Download template'}
        </button>
        {fileName && (
          <span style={{ ...mono, fontSize: 12, color: faint }}>
            {fileName} · {rows.length} row{rows.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

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
                  const dup = dupes[i]
                  const number = r.role === 'student' ? r.student_number : r.employee_number
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${line}`, color: problem ? red : ink }}>
                      <td style={{ padding: '8px 14px', color: dup?.kind === 'login' ? red : undefined }}>
                        {login || <em>{problem || 'no login'}</em>}
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        {[r.first_name, r.last_name].filter(Boolean).join(' ') || <em>missing</em>}
                        {dup && (
                          <div style={{ fontSize: 11.5, marginTop: 2, color: dup.tone === 'error' ? red : goldDeep }}>
                            {dup.note}
                          </div>
                        )}
                      </td>
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

          {/* Said once, over the whole file: the table shows eight rows, and
              the repeat is as likely to be on row 40. Not a block — an
              address can be a typo and a shared name can be two real people,
              and only the person holding the list knows which. */}
          {(blocking > 0 || sharedNames > 0) && (
            <div style={{ marginBottom: 12 }}>
              <Notice tone={blocking ? 'error' : 'warn'}>
                {concerns} — check them before creating, or each becomes a separate account.
              </Notice>
            </div>
          )}

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
          {/* One line per reason, not per row. A hundred rows failing the
              same check used to print a hundred all-but-identical lines and
              bury the one thing they said (andecobs-30). Each line names the
              login and person refused, not just the row: "row 5" sent an
              admin to search for an account that was never made (andecobs-45). */}
          {failures.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13, color: muted }}>
              {failures.map((f) => (
                <li key={f.reason} style={{ marginTop: 3 }}>
                  {f.rows
                    ? <>
                        <strong>{f.count} row{f.count === 1 ? '' : 's'}</strong> — {f.reason}
                        <span style={{ ...mono, fontSize: 12, color: faint }}>
                          {' '}· {f.who || `row${f.count === 1 ? '' : 's'} ${f.rows}`}
                        </span>
                      </>
                    : f.reason}
                </li>
              ))}
            </ul>
          )}
          {failures.some((f) => f.rows) && (
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
