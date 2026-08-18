import { useState } from 'react'
import { parseCsv } from '@/lib/roster'
import { bulkCreateUsers } from '@/lib/admin'
import { downloadCsv, stampedName } from '@/lib/csv'
import { ink, muted, faint, green, red, line, serif, mono } from '@/theme'
import { ROLES, MIN_PASSWORD, card, field, btnPrimary, btnGhost, th } from './ui'
import Notice from './Notice'

const REQUIRED = ['email', 'first_name', 'last_name', 'password']
const OPTIONAL = ['role', 'lrn', 'birthdate', 'student_number', 'course', 'year_level', 'middle_name']

/**
 * Bulk Upload Teachers / Bulk Upload Students.
 *
 * One component for both: the CSV is identical apart from the role, so a
 * default role is chosen here and a per-row `role` column overrides it. Two
 * near-identical screens would drift.
 */
export default function BulkUpload({ onDone }) {
  const [defaultRole, setDefaultRole] = useState('student')
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
      const parsed = parseCsv(await file.text())
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
        if (!row.role) row.role = defaultRole
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
      const res = await bulkCreateUsers(rows.map((r) => ({ ...r, role: r.role || defaultRole })))
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

  function downloadTemplate() {
    downloadCsv(stampedName('user-upload-template'), [
      [...REQUIRED, 'role'],
      ['juan.delacruz@school.edu.ph', 'Juan', 'Dela Cruz', 'changeme123', 'student'],
      ['maria.santos@school.edu.ph', 'Maria', 'Santos', 'changeme123', 'teacher'],
    ])
  }

  return (
    <div style={{ ...card, padding: 22 }}>
      <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 4px' }}>Bulk upload</h2>
      <p style={{ fontSize: 13, color: muted, margin: '0 0 16px', maxWidth: 640 }}>
        Creates accounts from a CSV. Every row needs a password — accounts are usable immediately,
        so give people a temporary one and have them change it. A <code style={{ ...mono, fontSize: 12 }}>role</code> column
        overrides the default below, which lets one file mix teachers and students.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          Default role
          <select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)}
                  style={{ ...field, marginTop: 6, width: 'auto', cursor: 'pointer' }}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label style={{ ...btnGhost, display: 'inline-block' }}>
          Choose CSV…
          <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
        </label>
        <button type="button" style={btnGhost} onClick={downloadTemplate}>Download template</button>
        {fileName && (
          <span style={{ ...mono, fontSize: 12, color: faint }}>
            {fileName} · {rows.length} row{rows.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <Notice>{parseError}</Notice>

      {rows.length > 0 && (
        <>
          <div style={{ border: `1px solid ${line}`, borderRadius: 12, overflow: 'hidden', margin: '14px 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(14,42,92,0.03)' }}>
                  {['email', 'name', 'role', 'password'].map((h) => (
                    <th key={h} style={{ ...th, color: muted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((r, i) => {
                  const bad = !r.email || !r.first_name || !r.last_name
                    || (r.password ?? '').length < MIN_PASSWORD || !ROLES.includes(r.role)
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${line}`, color: bad ? red : ink }}>
                      <td style={{ padding: '8px 14px' }}>{r.email || <em>missing</em>}</td>
                      <td style={{ padding: '8px 14px' }}>{[r.first_name, r.last_name].filter(Boolean).join(' ') || <em>missing</em>}</td>
                      <td style={{ padding: '8px 14px' }}>{r.role}</td>
                      <td style={{ padding: '8px 14px' }}>
                        {(r.password ?? '').length >= MIN_PASSWORD ? '••••••••' : <em>too short</em>}
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
