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

const STATUS_STYLE = {
  active: 'bg-green-50 text-green-700',
  needs_remediation: 'bg-amber-50 text-amber-700',
  mastered: 'bg-indigo-50 text-indigo-700',
}

const ENROLLMENT_STYLE = {
  AC: 'bg-green-50 text-green-700',
  IN: 'bg-slate-100 text-slate-500',
}

const inputCls =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">ID Number</span>
          <input
            placeholder="Student ID"
            value={fields.student_number}
            onChange={set('student_number')}
            className={`${inputCls} w-full mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Middle name <span className="text-slate-400 font-normal">(opt)</span>
          </span>
          <input
            value={fields.middle_name}
            onChange={set('middle_name')}
            className={`${inputCls} w-full mt-1`}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Course <span className="text-slate-400 font-normal">(opt)</span>
          </span>
          <input
            placeholder="e.g. BSIT"
            value={fields.course}
            onChange={set('course')}
            className={`${inputCls} w-full mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Year</span>
          <input
            placeholder="e.g. 1st Year / Grade 10"
            value={fields.year_level}
            onChange={set('year_level')}
            className={`${inputCls} w-full mt-1`}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Remarks <span className="text-slate-400 font-normal">(opt)</span>
          </span>
          <select
            value={fields.remarks}
            onChange={set('remarks')}
            className={`${inputCls} w-full mt-1 bg-white`}
          >
            <option value="">—</option>
            {REMARKS_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Enrollment status</span>
          <select
            value={fields.enrollment_status}
            onChange={set('enrollment_status')}
            className={`${inputCls} w-full mt-1 bg-white`}
          >
            {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label} ({value})</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            DepEd LRN <span className="text-slate-400 font-normal">(opt)</span>
          </span>
          <input
            placeholder="12-digit LRN"
            value={fields.lrn}
            onChange={set('lrn')}
            className={`${inputCls} w-full mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Birthdate</span>
          <input
            type="date"
            value={fields.birthdate}
            onChange={set('birthdate')}
            className={`${inputCls} w-full mt-1`}
          />
        </label>
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
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center px-4 z-10">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-slate-800">Add Student</h3>
        {isFull && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            This class has reached its maximum of {maxStudents} students.
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        <form onSubmit={lookup} className="flex gap-2">
          <input
            type="email"
            required
            placeholder="student@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputCls} flex-1`}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-indigo-200 text-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50"
          >
            Find
          </button>
        </form>

        {student && (
          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <p className="font-medium text-slate-800">
              {student.last_name}, {student.first_name}
              <span className="text-slate-400 font-normal"> · {student.email}</span>
            </p>
            <StudentFields fields={fields} setFields={setFields} />
            <button
              onClick={enroll}
              disabled={busy || isFull}
              className="w-full rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? 'Adding…' : 'Add to class'}
            </button>
          </div>
        )}

        <button onClick={onClose} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50">
          Close
        </button>
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
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center px-4 z-10">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-slate-800">
          {student.last_name}, {student.first_name}
        </h3>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
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
              className="rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
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

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center px-4 z-10">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-slate-800">Bulk Upload Roster (CSV)</h3>
        <p className="text-sm text-slate-500">
          Required header: <code className="bg-slate-100 px-1 rounded text-xs">email</code>. Optional columns:{' '}
          <code className="bg-slate-100 px-1 rounded text-xs">first_name,last_name,lrn,birthdate,student_number,middle_name,course,year_level,remarks,enrollment_status</code>.
          Students must already have Activklass accounts — rows are matched by email.
        </p>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:px-4 file:py-2 file:font-medium hover:file:bg-indigo-100"
        />
        {busy && !preview && <p className="text-sm text-slate-400">Matching students…</p>}

        {preview && (
          <>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-sm">
              {preview.matched.map((m) => (
                <div key={m.uid} className="px-3 py-2 flex justify-between">
                  <span className="text-slate-700">
                    {m.last_name || m.first_name ? `${m.last_name}, ${m.first_name}` : m.email}
                  </span>
                  <span className={m.already ? 'text-slate-400' : 'text-green-600 font-medium'}>
                    {m.already ? 'already enrolled — will update info' : 'will enroll'}
                  </span>
                </div>
              ))}
              {preview.unmatched.map((u, i) => (
                <div key={`u-${i}`} className="px-3 py-2 flex justify-between">
                  <span className="text-slate-700">{u.email}</span>
                  <span className="text-red-500 font-medium">no account — skipped</span>
                </div>
              ))}
            </div>
            {preview.unmatched.length > 0 && (
              <p className="text-xs text-amber-600">
                {preview.unmatched.length} student{preview.unmatched.length === 1 ? '' : 's'} have no
                Activklass account yet — ask them to register, then re-upload.
              </p>
            )}
            <button
              onClick={commit}
              disabled={busy || preview.matched.length === 0}
              className="w-full rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700 disabled:opacity-40"
            >
              {busy ? 'Importing…' : `Import ${preview.matched.length} student${preview.matched.length === 1 ? '' : 's'}`}
            </button>
          </>
        )}

        <button onClick={onClose} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50">
          Close
        </button>
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
      {/* Analytics: quick stats for this class */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Students</p>
          <p className="text-2xl font-bold text-slate-800">{students.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Active (AC)</p>
          <p className="text-2xl font-bold text-green-700">{acCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Inactive (IN)</p>
          <p className="text-2xl font-bold text-slate-500">{students.length - acCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Capacity</p>
          <p className="text-2xl font-bold text-slate-800">
            {clazz.max_students ? `${students.length} / ${clazz.max_students}` : '—'}
          </p>
        </div>
      </div>

      {clazz.syllabus_file && (
        <a
          href={clazz.syllabus_file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:border-indigo-300"
        >
          📄 Syllabus file: {clazz.syllabus_file.name}
        </a>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">{error}</p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 mt-6 overflow-x-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-800">
            Roster <span className="text-sm font-normal text-slate-400">· {students.length} student{students.length === 1 ? '' : 's'}</span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setModal('csv')}
              className="rounded-lg border border-indigo-200 text-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-50"
            >
              ⇪ Bulk Upload CSV
            </button>
            <button
              onClick={() => setModal('add')}
              className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700"
            >
              + Add Student
            </button>
            <button
              onClick={deleteClass}
              title="Delete class"
              className="rounded-lg border border-red-200 text-red-600 px-3 py-2 text-sm hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>
        {students.length === 0 ? (
          <p className="p-8 text-center text-slate-400">
            No students yet. Add them by email or upload a CSV roster.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-5 py-2.5 font-medium">ID No.</th>
                <th className="px-5 py-2.5 font-medium">Name</th>
                <th className="px-5 py-2.5 font-medium">Course / Year</th>
                <th className="px-5 py-2.5 font-medium">Remarks</th>
                <th className="px-5 py-2.5 font-medium text-center">Enrollment</th>
                <th className="px-5 py-2.5 font-medium">Progress</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
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
                        {STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setModal(s)}
                        className="text-indigo-600 hover:underline text-xs font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
