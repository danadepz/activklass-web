import { useRef, useState } from 'react'
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { emptyClassForm } from '@/lib/classForm'
import { useAuth } from '@/context/useAuth'

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0E2A5C]/40 bg-white text-slate-800 text-sm'

const MAX_SYLLABUS_BYTES = 10 * 1024 * 1024
const ALLOWED_SYLLABUS_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function parseSchedule(str = '') {
  const defaults = {
    days: ['M', 'W', 'F'],
    startHour: '8',
    startMinute: '00',
    startPeriod: 'AM',
    endHour: '9',
    endMinute: '30',
    endPeriod: 'AM'
  }
  if (!str.trim()) return defaults

  // Match days
  const days = []
  if (str.includes('M')) days.push('M')
  if (str.includes('Th')) {
    days.push('Th')
  } else if (str.includes('T')) {
    days.push('T')
  }
  if (str.includes('W')) days.push('W')
  if (str.includes('F')) days.push('F')
  if (str.includes('Sa')) days.push('Sa')
  if (str.includes('Su')) days.push('Su')

  // Match times
  const matches = [...str.matchAll(/(\d+):(\d+)\s*(AM|PM)/ig)]
  if (matches.length >= 2) {
    return {
      days,
      startHour: matches[0][1],
      startMinute: matches[0][2],
      startPeriod: matches[0][3].toUpperCase(),
      endHour: matches[1][1],
      endMinute: matches[1][2],
      endPeriod: matches[1][3].toUpperCase()
    }
  }
  return { ...defaults, days }
}

function validate(form) {
  if (
    !form.subject_code.trim() ||
    !form.subject.trim() ||
    !form.section.trim() ||
    !form.schedule.trim() ||
    !form.grade_level.trim()
  ) {
    return 'Subject code, section, description, schedule, and grade/year level are required'
  }
  const maxStudents = Number.parseInt(form.max_students, 10)
  if (!Number.isInteger(maxStudents) || maxStudents <= 0) {
    return 'Max no. of students must be a positive number'
  }
  if (form.education_level === 'College' && form.units.trim()) {
    const units = Number.parseFloat(form.units)
    if (Number.isNaN(units) || units < 0) return 'Units must be a positive number'
  }
  return null
}

function buildMeta(form) {
  return {
    education_level: form.education_level,
    subject_code: form.subject_code.trim(),
    subject: form.subject.trim(),
    section: form.section.trim(),
    schedule: form.schedule.trim(),
    grade_level: form.grade_level.trim(),
    max_students: Number.parseInt(form.max_students, 10),
    academic_year: form.academic_year.trim() || '2025-2026',
    units: form.education_level === 'College' && form.units.trim() ? Number.parseFloat(form.units) : null,
  }
}

export default function ClassFormModal({ mode, classId, initial, currentSyllabusFile, onClose, onSaved }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(initial ?? emptyClassForm())
  const [educationLevel, setEducationLevel] = useState(form.education_level ?? 'High School')
  
  // Parse schedule helper
  const parsed = parseSchedule(form.schedule)
  const [selectedDays, setSelectedDays] = useState(parsed.days)
  const [startHour, setStartHour] = useState(parsed.startHour)
  const [startMinute, setStartMinute] = useState(parsed.startMinute)
  const [startPeriod, setStartPeriod] = useState(parsed.startPeriod)
  const [endHour, setEndHour] = useState(parsed.endHour)
  const [endMinute, setEndMinute] = useState(parsed.endMinute)
  const [endPeriod, setEndPeriod] = useState(parsed.endPeriod)

  const [syllabusFile, setSyllabusFile] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleEducationLevelChange = (level) => {
    setEducationLevel(level)
    setForm((f) => ({ ...f, education_level: level }))
  }

  // Update schedule string helper
  const updateScheduleString = (days, sh, sm, sp, eh, em, ep) => {
    const dayOrder = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su']
    const sortedDays = dayOrder.filter(d => days.includes(d)).join('')
    const str = sortedDays ? `${sortedDays} ${sh}:${sm} ${sp} – ${eh}:${em} ${ep}` : ''
    setForm(f => ({ ...f, schedule: str }))
  }

  const toggleDay = (day) => {
    let next
    if (selectedDays.includes(day)) {
      next = selectedDays.filter(d => d !== day)
    } else {
      next = [...selectedDays, day]
    }
    setSelectedDays(next)
    updateScheduleString(next, startHour, startMinute, startPeriod, endHour, endMinute, endPeriod)
  }

  const handleStartHourChange = (val) => {
    setStartHour(val)
    updateScheduleString(selectedDays, val, startMinute, startPeriod, endHour, endMinute, endPeriod)
  }

  const handleStartMinuteChange = (val) => {
    setStartMinute(val)
    updateScheduleString(selectedDays, startHour, val, startPeriod, endHour, endMinute, endPeriod)
  }

  const handleEndHourChange = (val) => {
    setEndHour(val)
    updateScheduleString(selectedDays, startHour, startMinute, startPeriod, val, endMinute, endPeriod)
  }

  const handleEndMinuteChange = (val) => {
    setEndMinute(val)
    updateScheduleString(selectedDays, startHour, startMinute, startPeriod, endHour, val, endPeriod)
  }

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
    <div className="fixed inset-0 bg-slate-900/50 z-200 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 py-8">
        <form onSubmit={submit} className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 shadow-xl">
          <h3 className="text-lg font-semibold text-slate-800">
            {mode === 'edit' ? 'Edit Class' : 'New Class'}
          </h3>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Education Level Dropdown */}
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Education Level</span>
            <select
              value={educationLevel}
              onChange={(e) => handleEducationLevelChange(e.target.value)}
              className={inputCls}
            >
              <option value="Elementary">Elementary</option>
              <option value="High School">High School</option>
              <option value="College">College</option>
            </select>
          </label>

          {/* Row 1: Subject Code and Section */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Subject Code / Identifier</span>
              <input required placeholder="e.g. MATH10, SCI-1" value={form.subject_code} onChange={set('subject_code')} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Section / Room</span>
              <input required placeholder="e.g. Grade 10 - Rizal, Block A" value={form.section} onChange={set('section')} className={inputCls} />
            </label>
          </div>

          {/* Row 2: Subject Description */}
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Subject Description</span>
            <input required placeholder="e.g. Mathematics 10, Introduction to Computing" value={form.subject} onChange={set('subject')} className={inputCls} />
          </label>

          {/* Row 3: Schedule Day & Time Custom Selector */}
          <div className="space-y-2 border border-slate-100 rounded-xl p-3 bg-slate-50/50">
            <span className="text-sm font-medium text-slate-700 block">Schedule Days</span>
            <div className="flex gap-2 flex-wrap">
              {[
                { val: 'M', label: 'M' },
                { val: 'T', label: 'T' },
                { val: 'W', label: 'W' },
                { val: 'Th', label: 'Th' },
                { val: 'F', label: 'F' },
                { val: 'Sa', label: 'Sa' },
                { val: 'Su', label: 'Su' }
              ].map(day => {
                const isActive = selectedDays.includes(day.val);
                return (
                  <button
                    key={day.val}
                    type="button"
                    onClick={() => toggleDay(day.val)}
                    className="w-10 h-10 rounded-full font-semibold text-sm transition-all focus:outline-none flex items-center justify-center cursor-pointer border"
                    style={{
                      background: isActive ? '#0E2A5C' : '#fff',
                      color: isActive ? '#FAFAF6' : '#475569',
                      borderColor: isActive ? '#0E2A5C' : '#cbd5e1'
                    }}
                  >
                    {day.label}
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              {/* Start Time */}
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500 block">Start Time</span>
                <div className="flex items-center gap-1">
                  {/* Hour */}
                  <select
                    value={startHour}
                    onChange={(e) => handleStartHourChange(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0E2A5C]/40 flex-1"
                  >
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-slate-400">:</span>
                  {/* Minute */}
                  <select
                    value={startMinute}
                    onChange={(e) => handleStartMinuteChange(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0E2A5C]/40 flex-1"
                  >
                    <option value="00">00</option>
                    <option value="30">30</option>
                  </select>
                  {/* AM/PM Arrow Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = startPeriod === 'AM' ? 'PM' : 'AM';
                      setStartPeriod(next);
                      updateScheduleString(selectedDays, startHour, startMinute, next, endHour, endMinute, endPeriod);
                    }}
                    className="flex items-center justify-between border border-slate-300 rounded-lg px-2 py-2 bg-white hover:bg-slate-50 transition cursor-pointer text-sm font-semibold text-slate-800"
                    style={{ width: '60px', height: '38px' }}
                  >
                    <span>{startPeriod}</span>
                    <span className="text-slate-400 text-xs">⇅</span>
                  </button>
                </div>
              </div>

              {/* End Time */}
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500 block">End Time</span>
                <div className="flex items-center gap-1">
                  {/* Hour */}
                  <select
                    value={endHour}
                    onChange={(e) => handleEndHourChange(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0E2A5C]/40 flex-1"
                  >
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-slate-400">:</span>
                  {/* Minute */}
                  <select
                    value={endMinute}
                    onChange={(e) => handleEndMinuteChange(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0E2A5C]/40 flex-1"
                  >
                    <option value="00">00</option>
                    <option value="30">30</option>
                  </select>
                  {/* AM/PM Arrow Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = endPeriod === 'AM' ? 'PM' : 'AM';
                      setEndPeriod(next);
                      updateScheduleString(selectedDays, startHour, startMinute, startPeriod, endHour, endMinute, next);
                    }}
                    className="flex items-center justify-between border border-slate-300 rounded-lg px-2 py-2 bg-white hover:bg-slate-50 transition cursor-pointer text-sm font-semibold text-slate-800"
                    style={{ width: '60px', height: '38px' }}
                  >
                    <span>{endPeriod}</span>
                    <span className="text-slate-400 text-xs">⇅</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Row 4: Grade/Year Level, Max Students, School Year */}
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Grade / Year Level</span>
              <input required placeholder={educationLevel === 'College' ? 'e.g. 3rd' : 'e.g. Grade 3'} value={form.grade_level} onChange={set('grade_level')} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Max Students</span>
              <input required type="number" min="1" placeholder="40" value={form.max_students} onChange={set('max_students')} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">School Year</span>
              <input required placeholder="e.g. 2026–2027" value={form.academic_year} onChange={set('academic_year')} className={inputCls} />
            </label>
          </div>

          {/* Row 5: Conditional - Course Units (only for College) */}
          {educationLevel === 'College' && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Course Units</span>
              <input required={educationLevel === 'College'} type="number" min="0" step="0.5" placeholder="3" value={form.units} onChange={set('units')} className={inputCls} />
            </label>
          )}

          {/* Syllabus Upload */}
          <div className="border-t border-slate-200 pt-4">
            <span className="text-sm font-medium text-slate-700">
              Syllabus <span className="text-slate-400 font-normal">(optional)</span>
            </span>
            {currentSyllabusFile && !syllabusFile && (
              <p className="text-xs text-slate-500 mt-1">
                Current:{' '}
                <a href={currentSyllabusFile.url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: '#0E2A5C' }}>
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
              className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-white file:px-4 file:py-2 file:font-medium hover:file:opacity-90 cursor-pointer"
            />
            {syllabusFile ? (
              <p className="text-xs text-slate-500 mt-1">
                Attached: {syllabusFile.name} ({Math.ceil(syllabusFile.size / 1024)} KB) ·{' '}
                <button type="button" onClick={clearFile} className="hover:underline" style={{ color: '#0E2A5C' }}>
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
              className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg px-4 py-2 font-medium transition hover:brightness-110 disabled:opacity-50 text-sm"
              style={{ background: '#0E2A5C', color: '#FAFAF6', border: 'none', cursor: 'pointer' }}
            >
              {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
