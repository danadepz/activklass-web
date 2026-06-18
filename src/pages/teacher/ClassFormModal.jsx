import { useRef, useState } from 'react'
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { db, storage } from '../../lib/firebase'
import { emptyClassForm } from '../../lib/classForm'
import { useAuth } from '../../context/useAuth'

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500'

const MAX_SYLLABUS_BYTES = 10 * 1024 * 1024
const ALLOWED_SYLLABUS_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function validate(form) {
  if (
    !form.subject_code.trim() ||
    !form.subject.trim() ||
    !form.section.trim() ||
    !form.schedule.trim()
  ) {
    return 'Subject code, description, section, and schedule are required'
  }
  const maxStudents = Number.parseInt(form.max_students, 10)
  if (!Number.isInteger(maxStudents) || maxStudents <= 0) {
    return 'Max no. of students must be a positive number'
  }
  if (form.units.trim()) {
    const units = Number.parseFloat(form.units)
    if (Number.isNaN(units) || units < 0) return 'Units must be a number'
  }
  return null
}

function buildMeta(form) {
  return {
    subject_code: form.subject_code.trim(),
    subject: form.subject.trim(),
    section: form.section.trim(),
    schedule: form.schedule.trim(),
    units: form.units.trim() ? Number.parseFloat(form.units) : null,
    max_students: Number.parseInt(form.max_students, 10),
    academic_year: form.academic_year.trim() || '2025-2026',
  }
}

/**
 * Create or edit a class. Shared by My Classes (create) and the class header
 * (edit). Handles the optional syllabus file upload in both modes.
 *
 * onSaved is called with { warning } — a non-fatal syllabus-upload message, if any.
 */
export default function ClassFormModal({ mode, classId, initial, currentSyllabusFile, onClose, onSaved }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(initial ?? emptyClassForm())
  const [syllabusFile, setSyllabusFile] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const clearFile = () => {
    setSyllabusFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    setError(null)
    if (!file) {
      setSyllabusFile(null)
      return
    }
    const looksLikeDoc =
      ALLOWED_SYLLABUS_TYPES.includes(file.type) || /\.(pdf|docx?)$/i.test(file.name)
    if (!looksLikeDoc) {
      setError('Syllabus must be a PDF or Word document.')
      clearFile()
      return
    }
    if (file.size > MAX_SYLLABUS_BYTES) {
      setError('Syllabus file must be under 10 MB.')
      clearFile()
      return
    }
    setSyllabusFile(file)
  }

  async function submit(e) {
    e.preventDefault()
    const validationError = validate(form)
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const meta = buildMeta(form)
      let targetRef
      if (mode === 'edit') {
        targetRef = doc(db, 'classes', classId)
        await updateDoc(targetRef, meta)
      } else {
        targetRef = await addDoc(collection(db, 'classes'), {
          ...meta,
          teacher_id: profile.id,
          student_ids: [],
          created_at: serverTimestamp(),
        })
      }
      const targetId = mode === 'edit' ? classId : targetRef.id

      let warning = null
      if (syllabusFile) {
        try {
          const path = `syllabi/${targetId}/${syllabusFile.name}`
          const sref = storageRef(storage, path)
          await uploadBytes(sref, syllabusFile, { contentType: syllabusFile.type })
          const url = await getDownloadURL(sref)
          await updateDoc(targetRef, {
            syllabus_file: {
              name: syllabusFile.name,
              url,
              path,
              content_type: syllabusFile.type,
              size: syllabusFile.size,
              uploaded_at: new Date().toISOString(),
            },
          })
        } catch (err) {
          warning = `Class saved, but the syllabus file couldn't be uploaded (${err.message}). Make sure the Storage emulator is running, then re-attach it.`
        }
      }
      onSaved({ warning })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center px-4 z-10">
      <form onSubmit={submit} className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-slate-800">
          {mode === 'edit' ? 'Edit Class' : 'New Class'}
        </h3>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Subject code</span>
            <input required placeholder="e.g. MATH10" value={form.subject_code} onChange={set('subject_code')} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Section</span>
            <input required placeholder="e.g. Grade 10 - Rizal" value={form.section} onChange={set('section')} className={inputCls} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Subject description</span>
          <input required placeholder="e.g. Mathematics 10" value={form.subject} onChange={set('subject')} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Schedule (day and time)</span>
          <input required placeholder="e.g. MWF 8:00–9:00 AM" value={form.schedule} onChange={set('schedule')} className={inputCls} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Units <span className="text-slate-400 font-normal">(opt)</span>
            </span>
            <input type="number" min="0" step="0.5" placeholder="3" value={form.units} onChange={set('units')} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Max students</span>
            <input required type="number" min="1" placeholder="40" value={form.max_students} onChange={set('max_students')} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Academic year</span>
            <input value={form.academic_year} onChange={set('academic_year')} className={inputCls} />
          </label>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <span className="text-sm font-medium text-slate-700">
            Syllabus <span className="text-slate-400 font-normal">(optional)</span>
          </span>
          {currentSyllabusFile && !syllabusFile && (
            <p className="text-xs text-slate-500 mt-1">
              Current:{' '}
              <a href={currentSyllabusFile.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                {currentSyllabusFile.name}
              </a>{' '}
              — choose a file to replace it.
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFile}
            className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:px-4 file:py-2 file:font-medium hover:file:bg-indigo-100"
          />
          {syllabusFile ? (
            <p className="text-xs text-slate-500 mt-1">
              Attached: {syllabusFile.name} ({Math.ceil(syllabusFile.size / 1024)} KB) ·{' '}
              <button type="button" onClick={clearFile} className="text-indigo-600 hover:underline">
                remove
              </button>
            </p>
          ) : (
            <p className="text-xs text-slate-400 mt-1">Attach a PDF or Word document, up to 10 MB.</p>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create class'}
          </button>
        </div>
      </form>
    </div>
  )
}
