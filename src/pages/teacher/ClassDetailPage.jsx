import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import {
  ENROLLMENT_STATUS_LABELS,
  REMARKS_OPTIONS,
  STATUS_LABELS,
  ageFromBirthdate,
  fetchUsersByIds,
  findStudentByEmail,
  parseCsv,
} from '../../lib/roster'
import { ArrowRight, Plus, FileText } from '../../components/icons'

// --- Overview (navy + gold) palette ---------------------------------------
const navy = '#0E2A5C'
const navyDeep = '#061840'
const ink = '#0A1733'
const gold = '#F5C518'
const muted = '#6A7A95'
const faint = '#9AA6BD'
const green = '#1F8A5B'
const blueText = '#1E6FB0'
const goldDeep = '#8B6A00'
const red = '#C0392B'
const line = 'rgba(14,42,92,0.08)'
const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }
const sans = "'Plus Jakarta Sans', sans-serif"

const ENROLL_PILL = {
  AC: { color: green, bg: 'rgba(31,138,91,0.10)' },
  IN: { color: muted, bg: 'rgba(14,42,92,0.06)' },
}
const STATUS_PILL = {
  active: { color: green, bg: 'rgba(31,138,91,0.10)' },
  needs_remediation: { color: goldDeep, bg: 'rgba(245,197,24,0.18)' },
  mastered: { color: blueText, bg: 'rgba(63,169,245,0.12)' },
}

function StatCard({ label, value, valueColor }) {
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginBottom: 12 }}>{label}</div>
      <div style={{ ...serif, fontSize: 40, lineHeight: 1, color: valueColor ?? ink }}>{value}</div>
    </div>
  )
}

// --- shared modal styling (Add / CSV / Edit roster dialogs) ---------------
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(14,23,51,0.55)',
  backdropFilter: 'blur(3px)',
  WebkitBackdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: 24,
}
const cardStyle = {
  width: '100%',
  background: '#FFFFFF',
  borderRadius: 20,
  boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '90vh',
}
const headerStyle = {
  padding: '24px 28px 20px',
  borderBottom: '1px solid rgba(14,42,92,0.07)',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexShrink: 0,
}
const iconSquare = {
  width: 36,
  height: 36,
  borderRadius: 10,
  background: navy,
  color: gold,
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
}
const bodyStyle = { padding: '24px 28px', overflowY: 'auto' }
const footerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 12,
  padding: '16px 28px',
  borderTop: '1px solid rgba(14,42,92,0.07)',
  background: 'rgba(14,42,92,0.02)',
  flexShrink: 0,
}
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: ink, marginBottom: 7 }
const fieldStyle = {
  width: '100%',
  padding: '12px 14px',
  fontSize: 14,
  fontFamily: sans,
  color: ink,
  background: '#FFFFFF',
  border: '1.5px solid rgba(14,42,92,0.14)',
  borderRadius: 10,
  transition: 'border-color 0.15s, box-shadow 0.15s',
}
const optTag = { color: faint, fontWeight: 500 }
const btnPrimary = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 9,
  padding: '12px 20px',
  fontSize: 14,
  fontWeight: 700,
  fontFamily: sans,
  color: '#FAFAF6',
  background: navy,
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  boxShadow: `0 3px 0 ${navyDeep}`,
}
const btnGhost = {
  padding: '12px 20px',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: sans,
  color: '#3A4A6B',
  background: '#FFFFFF',
  border: '1.5px solid rgba(14,42,92,0.14)',
  borderRadius: 10,
  cursor: 'pointer',
}
const btnDanger = {
  padding: '12px 20px',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: sans,
  color: red,
  background: '#FFFFFF',
  border: '1.5px solid rgba(192,57,43,0.3)',
  borderRadius: 10,
  cursor: 'pointer',
}

function GoldArrow() {
  return (
    <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: gold, color: navy }}>
      <ArrowRight className="h-3 w-3" />
    </span>
  )
}

function AlertBox({ tone = 'error', children }) {
  const t =
    tone === 'warn'
      ? { color: goldDeep, bg: 'rgba(245,197,24,0.12)', border: 'rgba(245,197,24,0.45)' }
      : { color: red, bg: 'rgba(192,57,43,0.07)', border: 'rgba(192,57,43,0.3)' }
  return (
    <div role="alert" style={{ fontSize: 13, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 12px' }}>
      {children}
    </div>
  )
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

/* Shared roster field inputs (ID Number, Middle Name, Course, Year, Remarks,
   enrollment status, LRN, birthdate). Last/first name come from the account. */
function StudentFields({ fields, setFields }) {
  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }))
  const selectStyle = { ...fieldStyle, cursor: 'pointer' }
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <label style={labelStyle}>ID Number</label>
          <input className="ak-input" placeholder="Student ID" value={fields.student_number} onChange={set('student_number')} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>
            Middle name <span style={optTag}>(opt)</span>
          </label>
          <input className="ak-input" value={fields.middle_name} onChange={set('middle_name')} style={fieldStyle} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <label style={labelStyle}>
            Course <span style={optTag}>(opt)</span>
          </label>
          <input className="ak-input" placeholder="e.g. BSIT" value={fields.course} onChange={set('course')} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Year</label>
          <input className="ak-input" placeholder="e.g. 1st Year / Grade 10" value={fields.year_level} onChange={set('year_level')} style={fieldStyle} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <label style={labelStyle}>
            Remarks <span style={optTag}>(opt)</span>
          </label>
          <select className="ak-input" value={fields.remarks} onChange={set('remarks')} style={selectStyle}>
            <option value="">—</option>
            {REMARKS_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Enrollment status</label>
          <select className="ak-input" value={fields.enrollment_status} onChange={set('enrollment_status')} style={selectStyle}>
            {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label} ({value})</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <label style={labelStyle}>
            DepEd LRN <span style={optTag}>(opt)</span>
          </label>
          <input className="ak-input" placeholder="12-digit LRN" value={fields.lrn} onChange={set('lrn')} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Birthdate</label>
          <input className="ak-input" type="date" value={fields.birthdate} onChange={set('birthdate')} style={fieldStyle} />
        </div>
      </div>
    </div>
  )
}

/* Add a registered student by email; lets the teacher fill in roster details. */
function AddStudentModal({ classId, enrolledIds, maxStudents, onClose, onDone }) {
  const [email, setEmail] = useState('')
  const [student, setStudent] = useState(null)
  const [fields, setFields] = useState(EMPTY_STUDENT_FIELDS)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const isFull = maxStudents > 0 && enrolledIds.length >= maxStudents

  async function lookup(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setStudent(null)
    try {
      const found = await findStudentByEmail(email)
      if (!found) {
        setError(
          'No registered student account with that email. Ask the student to sign up first (Register → "I am a Student"), then add them here.',
        )
      } else if (enrolledIds.includes(found.id)) {
        setError('That student is already in this class.')
      } else {
        setStudent(found)
        setFields({
          student_number: found.student_number ?? '',
          middle_name: found.middle_name ?? '',
          course: found.course ?? '',
          year_level: found.year_level ?? '',
          remarks: found.remarks ?? '',
          enrollment_status: found.enrollment_status ?? 'AC',
          lrn: found.lrn ?? '',
          birthdate: found.birthdate ?? '',
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function enroll() {
    if (isFull) {
      setError(`This class is full (max ${maxStudents} students).`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const patch = { status: student.status ?? 'active', ...rosterPatch(fields) }
      await updateDoc(doc(db, 'users', student.id), patch)
      await updateDoc(doc(db, 'classes', classId), { student_ids: arrayUnion(student.id) })
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, maxWidth: 540 }}>
        <div style={headerStyle}>
          <span style={iconSquare}>
            <Plus className="h-[18px] w-[18px]" />
          </span>
          <h2 style={{ ...serif, fontSize: 24, margin: 0, color: ink }}>Add Student</h2>
        </div>
        <div style={bodyStyle} className="flex flex-col gap-4">
          {isFull && <AlertBox tone="warn">This class has reached its maximum of {maxStudents} students.</AlertBox>}
          {error && <AlertBox>{error}</AlertBox>}
          <form onSubmit={lookup} className="flex gap-2.5">
            <input
              type="email"
              required
              placeholder="student@email.com"
              className="ak-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ ...fieldStyle, flex: 1 }}
            />
            <button
              type="submit"
              disabled={busy}
              className="transition hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ ...btnGhost, color: navy, whiteSpace: 'nowrap' }}
            >
              Find
            </button>
          </form>

          {student && (
            <div className="flex flex-col gap-3.5" style={{ border: `1px solid ${line}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>
                {student.last_name}, {student.first_name}
                <span style={{ fontWeight: 500, color: faint }}> · {student.email}</span>
              </div>
              <StudentFields fields={fields} setFields={setFields} />
              <button
                onClick={enroll}
                disabled={busy || isFull}
                className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ ...btnPrimary, width: '100%' }}
              >
                {busy ? 'Adding…' : 'Add to class'}
                <GoldArrow />
              </button>
            </div>
          )}
        </div>
        <div style={footerStyle}>
          <button onClick={onClose} className="transition hover:brightness-105" style={btnGhost}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/* Edit roster fields on one student (rules allow teachers to maintain these). */
function EditStudentModal({ student, classId, onClose, onDone }) {
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
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await updateDoc(doc(db, 'users', student.id), { status, ...rosterPatch(fields) })
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function removeFromClass() {
    if (!window.confirm(`Remove ${student.first_name} from this class?`)) return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'classes', classId), { student_ids: arrayRemove(student.id) })
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const initials = `${student.first_name?.[0] ?? ''}${student.last_name?.[0] ?? ''}`.toUpperCase()
  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, maxWidth: 540 }}>
        <div style={headerStyle}>
          <span style={{ ...iconSquare, fontSize: 13, fontWeight: 800 }}>{initials}</span>
          <h2 style={{ ...serif, fontSize: 24, margin: 0, color: ink }}>
            {student.last_name}, {student.first_name}
          </h2>
        </div>
        <div style={bodyStyle} className="flex flex-col gap-3.5">
          {error && <AlertBox>{error}</AlertBox>}
          <StudentFields fields={fields} setFields={setFields} />
          <div>
            <label style={labelStyle}>Academic progress</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="ak-input"
              style={{ ...fieldStyle, cursor: 'pointer' }}
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ ...footerStyle, justifyContent: 'space-between' }}>
          <button
            onClick={removeFromClass}
            disabled={busy}
            className="transition hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed"
            style={btnDanger}
          >
            Remove from class
          </button>
          <div className="flex gap-2.5">
            <button onClick={onClose} className="transition hover:brightness-105" style={btnGhost}>
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              style={btnPrimary}
            >
              {busy ? 'Saving…' : 'Save'}
              <GoldArrow />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* CSV import: header row first_name,last_name,email,lrn,birthdate plus the
   optional roster columns student_number,middle_name,course,year_level,remarks,
   enrollment_status. Matches registered students by email; preview first. */
function CsvUploadModal({ classId, enrolledIds, maxStudents, onClose, onDone }) {
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null) // { matched: [], unmatched: [] }
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file) {
    setBusy(true)
    setError(null)
    setPreview(null)
    try {
      const rows = parseCsv(await file.text())
      if (rows.length < 2) throw new Error('CSV needs a header row plus at least one student')
      const header = rows[0].map((h) => h.trim().toLowerCase())
      const col = (name) => header.indexOf(name)
      if (col('email') === -1) {
        throw new Error('CSV must have an "email" column (expected: first_name,last_name,email,lrn,birthdate)')
      }
      const matched = []
      const unmatched = []
      for (const row of rows.slice(1)) {
        const cell = (name) => (col(name) === -1 ? '' : row[col(name)]?.trim() ?? '')
        const entry = {
          first_name: cell('first_name'),
          last_name: cell('last_name'),
          email: row[col('email')]?.trim().toLowerCase() ?? '',
          lrn: cell('lrn'),
          birthdate: cell('birthdate'),
          student_number: cell('student_number'),
          middle_name: cell('middle_name'),
          course: cell('course'),
          year_level: cell('year_level'),
          remarks: cell('remarks'),
          enrollment_status: cell('enrollment_status'),
        }
        if (!entry.email) continue
        const student = await findStudentByEmail(entry.email)
        if (student) {
          matched.push({ ...entry, uid: student.id, already: enrolledIds.includes(student.id) })
        } else {
          unmatched.push(entry)
        }
      }
      setPreview({ matched, unmatched })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    setBusy(true)
    setError(null)
    try {
      const incoming = preview.matched.filter((m) => !m.already).length
      if (maxStudents > 0 && enrolledIds.length + incoming > maxStudents) {
        throw new Error(
          `Importing ${incoming} student${incoming === 1 ? '' : 's'} would exceed the class max of ${maxStudents}.`,
        )
      }
      const batch = writeBatch(db)
      const newIds = []
      for (const m of preview.matched) {
        const patch = {}
        for (const key of ['lrn', 'student_number', 'middle_name', 'course', 'year_level', 'remarks']) {
          if (m[key]) patch[key] = m[key]
        }
        if (m.enrollment_status) patch.enrollment_status = m.enrollment_status.toUpperCase()
        if (m.birthdate) {
          patch.birthdate = m.birthdate
          patch.age = ageFromBirthdate(m.birthdate)
        }
        if (Object.keys(patch).length) batch.update(doc(db, 'users', m.uid), patch)
        if (!m.already) newIds.push(m.uid)
      }
      if (newIds.length) {
        batch.update(doc(db, 'classes', classId), { student_ids: arrayUnion(...newIds) })
      }
      await batch.commit()
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const codeStyle = { ...mono, background: 'rgba(14,42,92,0.06)', padding: '2px 6px', borderRadius: 5, color: navy, fontSize: 12 }
  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, maxWidth: 540 }}>
        <div style={headerStyle}>
          <span style={iconSquare}>
            <FileText className="h-[18px] w-[18px]" />
          </span>
          <h2 style={{ ...serif, fontSize: 24, margin: 0, color: ink }}>Bulk Upload Roster (CSV)</h2>
        </div>
        <div style={bodyStyle} className="flex flex-col gap-4">
          <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, margin: 0 }}>
            Required header: <code style={codeStyle}>email</code>. Optional columns:{' '}
            <code style={codeStyle}>first_name,last_name,lrn,birthdate,student_number,middle_name,course,year_level,remarks,enrollment_status</code>.
            Students must already have Activklass accounts — rows are matched by email.
          </p>
          {error && <AlertBox>{error}</AlertBox>}

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="block w-full text-sm text-[#3A4A6B] file:mr-3 file:rounded-lg file:border-0 file:bg-[rgba(14,42,92,0.06)] file:px-4 file:py-2 file:font-semibold file:text-[#0E2A5C] hover:file:bg-[rgba(14,42,92,0.1)]"
          />
          {busy && !preview && <p style={{ fontSize: 13, color: faint, margin: 0 }}>Matching students…</p>}

          {preview && (
            <>
              <div style={{ border: `1px solid ${line}`, borderRadius: 10, overflow: 'hidden' }}>
                {preview.matched.map((m) => (
                  <div key={m.uid} className="flex justify-between" style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
                    <span style={{ color: '#3A4A6B' }}>
                      {m.last_name || m.first_name ? `${m.last_name}, ${m.first_name}` : m.email}
                    </span>
                    <span style={{ fontWeight: 600, color: m.already ? faint : green }}>
                      {m.already ? 'already enrolled — will update info' : 'will enroll'}
                    </span>
                  </div>
                ))}
                {preview.unmatched.map((u, i) => (
                  <div key={`u-${i}`} className="flex justify-between" style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
                    <span style={{ color: '#3A4A6B' }}>{u.email}</span>
                    <span style={{ fontWeight: 600, color: red }}>no account — skipped</span>
                  </div>
                ))}
              </div>
              {preview.unmatched.length > 0 && (
                <div style={{ fontSize: 12, color: goldDeep }}>
                  {preview.unmatched.length} student{preview.unmatched.length === 1 ? '' : 's'} have no Activklass
                  account yet — ask them to register, then re-upload.
                </div>
              )}
              <button
                onClick={commit}
                disabled={busy || preview.matched.length === 0}
                className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ ...btnPrimary, width: '100%' }}
              >
                {busy ? 'Importing…' : `Import ${preview.matched.length} student${preview.matched.length === 1 ? '' : 's'}`}
                <GoldArrow />
              </button>
            </>
          )}
        </div>
        <div style={footerStyle}>
          <button onClick={onClose} className="transition hover:brightness-105" style={btnGhost}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClassDetailPage() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [modal, setModal] = useState(null) // 'add' | 'csv' | student object
  const [error, setError] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fs-class', classId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'classes', classId))
      if (!snap.exists()) throw new Error('Class not found')
      const clazz = { id: snap.id, ...snap.data() }
      const students = clazz.student_ids?.length
        ? await fetchUsersByIds(clazz.student_ids)
        : []
      students.sort((a, b) =>
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
      )
      return { clazz, students }
    },
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['fs-class', classId] })
    queryClient.invalidateQueries({ queryKey: ['fs-classes'] })
    setModal(null)
  }

  async function deleteClass() {
    if (!window.confirm('Delete this class section? The roster list will be lost (student accounts are kept).')) return
    try {
      await deleteDoc(doc(db, 'classes', classId))
      navigate('/teacher/classes')
    } catch (err) {
      setError(err.message)
    }
  }

  if (isLoading) return <p className="text-slate-400">Loading roster…</p>
  if (isError || !data) return <p className="text-red-600">Class not found.</p>

  const { clazz, students } = data
  const acCount = students.filter((s) => (s.enrollment_status ?? 'AC') === 'AC').length

  return (
    <div>
      {/* Quick stats for this class */}
      <div className="grid grid-cols-2 gap-[18px] sm:grid-cols-4">
        <StatCard label="Students" value={students.length} />
        <StatCard label="Active (AC)" value={acCount} valueColor={green} />
        <StatCard label="Inactive (IN)" value={students.length - acCount} />
        <StatCard
          label="Capacity"
          value={
            clazz.max_students ? (
              <>
                {students.length} <span style={{ color: '#C3CCDB' }}>/ {clazz.max_students}</span>
              </>
            ) : (
              '—'
            )
          }
        />
      </div>

      {clazz.syllabus_file && (
        <a
          href={clazz.syllabus_file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 transition hover:brightness-105"
          style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 11, padding: '10px 16px', fontSize: 13, fontWeight: 600, color: navy, textDecoration: 'none' }}
        >
          📄 Syllabus file: {clazz.syllabus_file.name}
        </a>
      )}

      {error && (
        <p role="alert" className="mt-4" style={{ border: '1px solid rgba(192,57,43,0.3)', background: 'rgba(192,57,43,0.07)', color: red, borderRadius: 11, padding: '11px 14px', fontSize: 14, margin: '16px 0 0' }}>
          {error}
        </p>
      )}

      <div className="mt-6 overflow-hidden" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16 }}>
        <div className="flex flex-wrap items-center justify-between gap-3" style={{ padding: '20px 24px', borderBottom: '1px solid rgba(14,42,92,0.07)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: ink }}>
            Roster{' '}
            <span style={{ fontWeight: 500, color: faint, fontSize: 14 }}>
              · {students.length} student{students.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setModal('csv')}
              className="transition hover:brightness-105"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 15px', fontSize: 13, fontWeight: 600, fontFamily: sans, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer' }}
            >
              ⬆ Bulk Upload CSV
            </button>
            <button
              onClick={() => setModal('add')}
              className="transition hover:brightness-110"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 15px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: `0 2px 0 ${navyDeep}` }}
            >
              <span style={{ color: gold }}>+</span> Add Student
            </button>
            <button
              onClick={deleteClass}
              title="Delete class"
              className="transition hover:brightness-105"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 15px', fontSize: 13, fontWeight: 600, fontFamily: sans, color: red, background: '#FFFFFF', border: '1.5px solid rgba(192,57,43,0.3)', borderRadius: 10, cursor: 'pointer' }}
            >
              Delete
            </button>
          </div>
        </div>

        {students.length === 0 ? (
          <div style={{ padding: '56px 24px', textAlign: 'center', fontSize: 14, color: faint }}>
            No students yet. Add them by email or upload a CSV roster.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(14,42,92,0.03)', borderBottom: '1px solid rgba(14,42,92,0.07)' }}>
                  {['ID No.', 'Name', 'Course / Year', 'Remarks', 'Enrollment', 'Progress', ''].map((h, i) => (
                    <th
                      key={h || 'actions'}
                      style={{ padding: '13px 20px', textAlign: i === 4 ? 'center' : i === 6 ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const status = s.status ?? 'active'
                  const enrollment = s.enrollment_status ?? 'AC'
                  const courseYear = [s.course, s.year_level].filter(Boolean).join(' · ')
                  const ep = ENROLL_PILL[enrollment] ?? ENROLL_PILL.AC
                  const sp = STATUS_PILL[status] ?? STATUS_PILL.active
                  return (
                    <tr key={s.id} className="hover:bg-[rgba(14,42,92,0.02)]" style={{ borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
                      <td style={{ ...mono, padding: '14px 20px', color: '#3A4A6B', fontSize: 12 }}>{s.student_number ?? '—'}</td>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: ink, lineHeight: 1.2 }}>
                          {s.last_name}, {s.first_name}
                          {s.middle_name ? ` ${s.middle_name}` : ''}
                        </div>
                        <div style={{ fontSize: 12, color: faint, marginTop: 1 }}>{s.email}</div>
                      </td>
                      <td style={{ padding: '14px 20px', color: '#3A4A6B' }}>{courseYear || '—'}</td>
                      <td style={{ padding: '14px 20px', color: '#3A4A6B' }}>{s.remarks ?? '—'}</td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '4px 11px', fontSize: 12, fontWeight: 700, color: ep.color, background: ep.bg, borderRadius: 999 }}>
                          {enrollment}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ display: 'inline-block', padding: '4px 11px', fontSize: 12, fontWeight: 700, color: sp.color, background: sp.bg, borderRadius: 999 }}>
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <button
                          onClick={() => setModal(s)}
                          className="transition hover:opacity-70"
                          style={{ fontSize: 12, fontWeight: 700, color: navy, background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          Edit →
                        </button>
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
