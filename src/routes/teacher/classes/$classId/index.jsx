import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { arrayRemove, arrayUnion, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { api } from '@/lib/api'
import {
  ENROLLMENT_STATUS_LABELS,
  REMARKS_OPTIONS,
  STATUS_LABELS,
  ageFromBirthdate,
  fetchUsersByIds,
  findStudentByEmail,
  parseCsv,
} from '@/lib/roster'
import { X, Users, FileText } from '@/components/icons'

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
          <label style={labelStyle}>Course <span style={optHint}>(opt)</span></label>
          <input className="ak-input" placeholder="e.g. BSIT" value={fields.course} onChange={set('course')} style={fieldStyle} />
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
          <label style={labelStyle}>DepEd LRN <span style={optHint}>(opt)</span></label>
          <input className="ak-input" placeholder="12-digit LRN" value={fields.lrn} onChange={set('lrn')} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Birthdate</label>
          <input className="ak-input" type="date" value={fields.birthdate} onChange={set('birthdate')} style={{ ...fieldStyle, cursor: 'pointer' }} />
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
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={cardStyle}>
        <div style={modalHeaderStyle}>
          <span style={iconSquare}><Users className="h-[18px] w-[18px]" /></span>
          <h2 style={modalTitle}>Add Student</h2>
          <button onClick={onClose} className="transition hover:text-[#0A1733]" style={closeBtn}><X className="h-[18px] w-[18px]" /></button>
        </div>
        <div style={modalBodyStyle} className="flex flex-col gap-4">
          {isFull && (
            <div style={{ ...alertStyle, color: goldDeep, background: 'rgba(245,197,24,0.12)', border: '1px solid rgba(245,197,24,0.5)' }}>
              This class has reached its maximum of {maxStudents} students.
            </div>
          )}
          {error && <div role="alert" style={alertStyle}>{error}</div>}
          <form onSubmit={lookup} className="flex gap-2">
            <input
              type="email"
              required
              placeholder="student@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ak-input"
              style={{ ...fieldStyle, flex: 1 }}
            />
            <button type="submit" disabled={busy} className="transition hover:brightness-105 disabled:opacity-50" style={{ ...btnModalGhost, padding: '11px 18px', color: navy, borderColor: navy }}>
              Find
            </button>
          </form>

          {student && (
            <div className="flex flex-col gap-3.5" style={{ border: `1px solid ${line}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>
                {student.last_name}, {student.first_name}
                <span style={{ color: faint, fontWeight: 400 }}> · {student.email}</span>
              </div>
              <StudentFields fields={fields} setFields={setFields} />
            </div>
          )}
        </div>
        <div style={modalFooterStyle}>
          <button onClick={onClose} style={btnModalGhost}>Cancel</button>
          <button onClick={enroll} disabled={busy || isFull || !student} className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" style={btnModalPrimary}>
            {busy ? 'Adding…' : 'Add to class'}
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

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={cardStyle}>
        <div style={modalHeaderStyle}>
          <span style={iconSquare}><Users className="h-[18px] w-[18px]" /></span>
          <h2 style={modalTitle}>{student.last_name}, {student.first_name}</h2>
          <button onClick={onClose} className="transition hover:text-[#0A1733]" style={closeBtn}><X className="h-[18px] w-[18px]" /></button>
        </div>
        <div style={modalBodyStyle} className="flex flex-col gap-4">
          {error && <div role="alert" style={alertStyle}>{error}</div>}
          <StudentFields fields={fields} setFields={setFields} />
          <div>
            <label style={labelStyle}>Academic progress</label>
            <select className="ak-input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ ...modalFooterStyle, justifyContent: 'space-between' }}>
          <button onClick={removeFromClass} disabled={busy} className="transition hover:brightness-105 disabled:opacity-50" style={{ ...btnModalGhost, color: red, borderColor: 'rgba(192,57,43,0.3)' }}>
            Remove from class
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} style={btnModalGhost}>Cancel</button>
            <button onClick={save} disabled={busy} className="transition hover:brightness-110 disabled:opacity-50" style={btnModalPrimary}>
              {busy ? 'Saving…' : 'Save'}
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
function CsvUploadModal({ classId, onClose, onDone }) {
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null) // { students: [] }
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
        throw new Error('CSV must have an "email" column (expected: email, first_name, last_name)')
      }
      const students = []
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
        if (entry.email) {
          students.push(entry)
        }
      }
      setPreview({ students })
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
      await api(`/api/classes/${classId}/students/provision`, {
        method: 'POST',
        body: { students: preview.students }
      })
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={cardStyle}>
        <div style={modalHeaderStyle}>
          <span style={iconSquare}><FileText className="h-[18px] w-[18px]" /></span>
          <h2 style={modalTitle}>Bulk Upload Roster</h2>
          <button onClick={onClose} className="transition hover:text-[#0A1733]" style={closeBtn}><X className="h-[18px] w-[18px]" /></button>
        </div>
        <div style={modalBodyStyle} className="flex flex-col gap-4">
          <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, margin: 0 }}>
            Required header: <code style={codeStyle}>email</code>. Optional columns:{' '}
            <code style={codeStyle}>first_name, last_name, lrn, birthdate, student_number, middle_name, course, year_level, remarks, enrollment_status</code>.
            Students without Activklass accounts are invited and auto-enrolled when they register.
          </p>
          {error && <div role="alert" style={alertStyle}>{error}</div>}

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            style={{ fontSize: 13, color: muted }}
          />
          {busy && !preview && <p style={{ fontSize: 13, color: faint }}>Processing roster…</p>}

          {preview && (
            <div style={{ border: `1px solid ${line}`, borderRadius: 12, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
              {preview.students.map((s, idx) => (
                <div key={idx} className="flex justify-between" style={{ padding: '10px 14px', borderBottom: `1px solid ${line}`, fontSize: 13 }}>
                  <span style={{ color: ink }}>
                    {s.last_name || s.first_name ? `${s.last_name}, ${s.first_name}` : s.email}
                  </span>
                  <span style={{ color: blueText, fontWeight: 600 }}>will import/invite</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={modalFooterStyle}>
          <button onClick={onClose} style={btnModalGhost}>Cancel</button>
          <button
            onClick={commit}
            disabled={busy || !preview || preview.students.length === 0}
            className="transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            style={btnModalPrimary}
          >
            {busy ? 'Importing…' : preview ? `Import ${preview.students.length} student${preview.students.length === 1 ? '' : 's'}` : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- navy+gold Overview surface (matches the DC mock: stat cards + roster) ---
const navy = '#0E2A5C'
const navyDeep = '#061840'
const ink = '#0A1733'
const gold = '#F5C518'
const goldDeep = '#8B6A00'
const muted = '#6A7A95'
const faint = '#9AA6BD'
const green = '#1F8A5B'
const blueText = '#1E6FB0'
const red = '#C0392B'
const line = 'rgba(14,42,92,0.08)'
const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }
const sans = "'Plus Jakarta Sans', sans-serif"

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

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginBottom: 12 }}>{label}</div>
      <div style={{ ...serif, fontSize: 40, lineHeight: 1, color: color ?? ink }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: faint, marginTop: 8 }}>{sub}</div>}
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

  async function deleteClass() {
    if (!window.confirm('Delete this class section? The roster list will be lost (student accounts are kept).')) return
    try {
      await deleteDoc(doc(db, 'classes', classId))
      navigate('/teacher/classes')
    } catch (err) {
      setError(err.message)
    }
  }

  if (isLoading) return <p style={{ color: faint }}>Loading roster…</p>
  if (isError || !data) return <p style={{ color: red }}>Class not found.</p>

  const { clazz, students } = data
  const maxStudents = clazz.max_students ?? 0
  const activeCount = students.filter((s) => (s.enrollment_status ?? 'AC') === 'AC').length
  const inactiveCount = students.length - activeCount

  return (
    <div>
      {/* Stat cards (matches the DC mock's Overview) */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard label="Students" value={students.length} />
        <StatCard label="Active (AC)" value={activeCount} color={green} />
        <StatCard label="Inactive (IN)" value={inactiveCount} />
        <StatCard
          label="Capacity"
          value={
            <>
              {students.length} <span style={{ color: '#C3CCDB' }}>/ {maxStudents || '—'}</span>
            </>
          }
          sub="students enrolled"
        />
      </div>

      {clazz.syllabus_file && (
        <a
          href={clazz.syllabus_file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 transition hover:brightness-105"
          style={{ ...btnGhost, color: navy, textDecoration: 'none' }}
        >
          📄 Syllabus file: {clazz.syllabus_file.name}
        </a>
      )}

      {error && (
        <p role="alert" className="mt-4" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>{error}</p>
      )}

      {/* Roster */}
      <div className="mt-5" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, overflow: 'hidden' }}>
        <div className="flex flex-wrap items-center justify-between gap-3" style={{ padding: '18px 22px', borderBottom: `1px solid ${line}` }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: ink, margin: 0 }}>
            Roster <span style={{ fontWeight: 500, color: faint, fontSize: 14 }}>· {students.length} student{students.length === 1 ? '' : 's'}</span>
          </h3>
          <div className="flex flex-wrap items-center gap-2.5">
            <button onClick={() => setModal('csv')} className="transition hover:brightness-105" style={btnGhost}>⇪ Bulk Upload CSV</button>
            <button onClick={() => setModal('add')} className="transition hover:brightness-110" style={btnPrimary}>
              <span style={{ display: 'inline-grid', placeItems: 'center', width: 18, height: 18, borderRadius: '50%', background: gold, color: navy, fontSize: 13, lineHeight: 1 }}>+</span>
              Add Student
            </button>
            <button onClick={deleteClass} title="Delete class" className="transition hover:brightness-105" style={btnDanger}>Delete</button>
          </div>
        </div>
        {students.length === 0 ? (
          <div style={{ padding: '56px 24px', textAlign: 'center', color: faint, fontSize: 14 }}>
            No students yet. Add them by email or upload a CSV roster.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'rgba(14,42,92,0.03)', borderBottom: `1px solid ${line}` }}>
                  <th style={{ ...th, textAlign: 'left' }}>ID No.</th>
                  <th style={{ ...th, textAlign: 'left' }}>Name</th>
                  <th style={{ ...th, textAlign: 'left' }}>Course · Year</th>
                  <th style={{ ...th, textAlign: 'left' }}>Remarks</th>
                  <th style={{ ...th, textAlign: 'center' }}>Enrollment</th>
                  <th style={{ ...th, textAlign: 'left' }}>Progress</th>
                  <th style={th} aria-label="Edit" />
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const status = s.status ?? 'active'
                  const enrollment = s.enrollment_status ?? 'AC'
                  const courseYear = [s.course, s.year_level].filter(Boolean).join(' · ')
                  return (
                    <tr key={s.id || s.email} style={{ borderBottom: `1px solid ${line}` }}>
                      <td style={{ ...td, ...mono, fontSize: 12, color: muted }}>{s.student_number ?? '—'}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 700, color: ink }}>
                          {s.last_name}, {s.first_name}{s.middle_name ? ` ${s.middle_name}` : ''}
                        </div>
                        <div style={{ fontSize: 12, color: faint, marginTop: 2 }}>{s.email}</div>
                      </td>
                      <td style={{ ...td, color: '#3A4A6B' }}>{courseYear || '—'}</td>
                      <td style={{ ...td, color: '#3A4A6B' }}>{s.remarks ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={pillStyle(enrollment === 'AC' ? 'green' : 'gray')}>
                          {ENROLLMENT_STATUS_LABELS[enrollment] ?? enrollment}
                        </span>
                      </td>
                      <td style={td}>
                        <span style={pillStyle(statusTone(status))}>{STATUS_LABELS[status] || status}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {s.id ? (
                          <button onClick={() => setModal(s)} className="transition hover:brightness-110" style={{ fontSize: 13, fontWeight: 700, color: navy, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: sans }}>
                            Edit →
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: faint, fontStyle: 'italic' }}>Invited</span>
                        )}
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
