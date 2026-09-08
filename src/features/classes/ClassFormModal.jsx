import { useRef, useState } from 'react'
import { yearLevelError, semesterError, SEMESTERS } from '@/lib/validation'
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { emptyClassForm } from '@/lib/classForm'
import { useAuth } from '@/context/useAuth'
import { uploadAttachment } from '@/lib/attachments'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'
import { confirmDialog } from '@/components/ui/dialogs'
import { toast } from '@/components/ui/toast'

/* Split so the error border replaces the normal one rather than sitting beside
   it. Both colours in one class string is a coin-flip on stylesheet order, and
   the losing half is the red one nobody sees. */
const inputBase = 'mt-1 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 bg-white text-slate-800 text-sm'
const inputOk = 'border-slate-300 focus:ring-[#0E2A5C]/40'
const inputBad = 'border-red-400 focus:ring-red-300'
const inputCls = `${inputBase} ${inputOk}`
const fieldCls = (bad) => `${inputBase} ${bad ? inputBad : inputOk}`

const MAX_SYLLABUS_BYTES = 10 * 1024 * 1024
const ALLOWED_SYLLABUS_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const FIRST_YEAR = 2026
const YEARS = Array.from({ length: 10 }, (_, i) => String(FIRST_YEAR + i))

/* The selects only offer FIRST_YEAR and later, so anything below it is clamped
   for display. Normalising up front keeps the value we save equal to the one on
   screen: a blank form rendered "2026 - 2027" while still holding
   emptyClassForm()'s "2025-2026", and saved the latter unless the teacher
   happened to touch a year dropdown. */
function normalizeAcademicYear(value) {
  const [rawFrom, rawTo] = String(value ?? '')
    .split(/[-–]/)
    .map((v) => Number(String(v ?? '').trim()))
  const from = Number.isFinite(rawFrom) && rawFrom >= FIRST_YEAR ? rawFrom : FIRST_YEAR
  const to = Number.isFinite(rawTo) && rawTo > from ? rawTo : from + 1
  return { from: String(from), to: String(to), value: `${from}-${to}` }
}

function parseSchedule(str = '') {
  const defaults = {
    days: [],
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

/* School-day bounds. The pickers are 12-hour, so nothing stops a teacher
   saving a 6:00 AM class -- this catches it. There is deliberately no
   closing-time cap any more: the pilot had real classes ending after 9 PM,
   and the old DAY_CLOSES check blocked saving them. */
const DAY_OPENS = 7 * 60      // 7:00 AM
const MIN_LENGTH = 60         // one hour

function minutesFromLabel(hour, minute, period) {
  const h = Number(hour) % 12
  return (period.toUpperCase() === 'PM' ? h + 12 : h) * 60 + Number(minute)
}

/** "MWF 8:00 AM – 9:30 AM" -> { start, end } in minutes from midnight. */
function scheduleRange(str = '') {
  const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–—-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  return {
    start: minutesFromLabel(m[1], m[2], m[3]),
    end: minutesFromLabel(m[4], m[5], m[6]),
  }
}

function clockLabel(mins) {
  const h24 = Math.floor(mins / 60)
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(mins % 60).padStart(2, '0')} ${period}`
}

function validateSchedule(str) {
  const range = scheduleRange(str)
  // Older classes may hold free text that predates the pickers. Unreadable
  // is not the same as invalid, so do not block a save on it.
  if (!range) return null
  const { start, end } = range
  if (end <= start) return 'A class has to end after it starts.'
  if (end - start < MIN_LENGTH) return 'A class has to run for at least one hour.'
  if (start < DAY_OPENS) return `Classes cannot start before ${clockLabel(DAY_OPENS)}.`
  return null
}

/* Class-size and unit-load bounds. A teacher mistyping 400 for 40, or 30 units
   for 3, should be told at the field rather than finding out from the roster
   cap or a transcript later. */
const MIN_STUDENTS = 1
const MAX_STUDENTS = 300
const MIN_UNITS = 0.5
const MAX_UNITS = 12

/* Rendered top-to-bottom, so the first entry carrying an error is the field
   worth scrolling to. */
const FIELD_ORDER = [
  'subject_code', 'section', 'subject', 'schedule',
  'grade_level', 'max_students', 'academic_year', 'units', 'semester',
]

/* Returns { field: message } -- one message per input, keyed by the field it
   belongs to. The old single string named five fields at once and left the
   teacher to work out which of them was actually empty. */
function validate(form, selectedDays, originalMaxStudents = null) {
  const errors = {}
  const isCollege = form.education_level === 'College'
  const required = (key, message) => {
    if (!String(form[key] ?? '').trim()) errors[key] = message
  }

  required('subject_code', 'Subject code is required.')
  required('section', isCollege ? 'Room is required.' : 'Section is required.')
  required('subject', 'Subject description is required.')
  {
    const levelProblem = yearLevelError(form.grade_level, { level: isCollege ? 'college' : 'school' })
    if (levelProblem) errors.grade_level = levelProblem
  }

  // No day selected leaves schedule an empty string, which reads as "missing"
  // rather than "malformed" -- say which of the two it is.
  if (!selectedDays.length) {
    errors.schedule = 'Pick at least one day this class meets.'
  } else {
    const scheduleError = validateSchedule(form.schedule)
    if (scheduleError) errors.schedule = scheduleError
  }

  const students = String(form.max_students ?? '').trim()
  if (!students) {
    errors.max_students = 'Max students is required.'
  } else if (!Number.isInteger(Number(students))) {
    errors.max_students = 'Max students must be a whole number.'
  } else if (Number(students) < MIN_STUDENTS) {
    errors.max_students = `Max students must be at least ${MIN_STUDENTS}.`
  } else if (Number(students) > MAX_STUDENTS && Number(students) !== originalMaxStudents) {
    /* A class saved before this cap existed can hold a bigger number, and
       refusing it here blocked every OTHER edit to that class: a teacher
       fixing a typo in the subject code was told to change a capacity they
       had not touched, with no way to save until they did. Found by opening
       Edit Class on a 1000-seat class. Only a NEW value has to fit the cap. */
    errors.max_students = `Max students must be between ${MIN_STUDENTS} and ${MAX_STUDENTS}.`
  }

  // The pickers only offer to-years above the from-year, but a class stored
  // before that filter existed can still load a reversed span into the form.
  const [fromYear, toYear] = String(form.academic_year ?? '')
    .split(/[-–]/)
    .map((v) => Number(v.trim()))
  if (!fromYear || !toYear || toYear <= fromYear) {
    errors.academic_year = 'School year must run from one year to the next.'
  }

  if (isCollege) {
    const units = String(form.units ?? '').trim()
    if (!units) {
      errors.units = 'Course units are required for a college class.'
    } else if (Number.isNaN(Number(units))) {
      errors.units = 'Course units must be a number.'
    } else if (Number(units) < MIN_UNITS || Number(units) > MAX_UNITS) {
      errors.units = `Course units must be between ${MIN_UNITS} and ${MAX_UNITS}.`
    }
    const semesterProblem = semesterError(form.semester)
    if (semesterProblem) errors.semester = semesterProblem
  }

  return errors
}

/* The red asterisk every other teacher form already uses for a required
   field (the roster's Add Student form, for one). Shown before the teacher
   types anything -- the post-submit banner only says it after the fact.
   Hidden from screen readers: the inputs already carry `required`. */
function Req() {
  return <span className="text-red-500" aria-hidden="true"> *</span>
}

function FieldError({ id, message }) {
  if (!message) return null
  return <p id={id} role="alert" className="mt-1 text-xs text-red-600">{message}</p>
}

/* `writeCollegeFields` false leaves units and semester exactly as they are
   stored. Those are the two inputs only the College form renders, so writing
   null from a form that never showed them would discard a value the teacher
   was never given the chance to keep -- every list would stop printing a
   semester nobody cleared. An edit that opened as College still writes both,
   so moving a class down to K-12 clears them, which is a choice made on
   screen. */
export function buildMeta(form, { writeCollegeFields = true } = {}) {
  const isCollege = form.education_level === 'College'
  const meta = {
    education_level: form.education_level,
    subject_code: form.subject_code.trim(),
    subject: form.subject.trim(),
    section: form.section.trim(),
    schedule: form.schedule.trim(),
    grade_level: form.grade_level.trim(),
    max_students: Number.parseInt(form.max_students, 10),
    academic_year: form.academic_year.trim() || '2026-2027',
  }
  if (writeCollegeFields) {
    meta.units = isCollege && form.units.trim() ? Number.parseFloat(form.units) : null
    meta.semester = isCollege && form.semester ? form.semester : null
  }
  return meta
}

export default function ClassFormModal({ mode, classId, initial, currentSyllabusFile, onClose, onSaved }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Class details', closeOnBackdrop: false })
  const { profile } = useAuth()
  const [form, setForm] = useState(() => {
    const base = initial ?? emptyClassForm()
    return { ...base, academic_year: normalizeAcademicYear(base.academic_year).value }
  })
  const [educationLevel, setEducationLevel] = useState(form.education_level ?? 'High School')

  /* Was the College block on screen when this form opened? An edit that never
     showed it leaves units and semester alone instead of nulling them. */
  const [openedAsCollege] = useState(() => form.education_level === 'College')

  /* The capacity this class was already saved with. Held so validate() can let
     an over-cap number through untouched while still refusing a new one -- see
     the note there. useState with an initialiser, not a useRef read of `form`,
     so it captures the value as it arrived rather than as the teacher edits. */
  const [originalMaxStudents] = useState(() => {
    const n = Number(initial?.max_students)
    return Number.isFinite(n) ? n : null
  })
  
  // Parse schedule helper
  const parsed = parseSchedule(form.schedule)
  const [selectedDays, setSelectedDays] = useState(parsed.days)
  const [startHour, setStartHour] = useState(parsed.startHour)
  const [startMinute, setStartMinute] = useState(parsed.startMinute)
  const [startPeriod, setStartPeriod] = useState(parsed.startPeriod)
  const [endHour, setEndHour] = useState(parsed.endHour)
  const [endMinute, setEndMinute] = useState(parsed.endMinute)
  const [endPeriod, setEndPeriod] = useState(parsed.endPeriod)

  // Seeded from the same normaliser the form state was, so the dropdowns and
  // form.academic_year cannot start out disagreeing.
  const [fromYear, setFromYear] = useState(() => normalizeAcademicYear(form.academic_year).from)
  const [toYear, setToYear] = useState(() => normalizeAcademicYear(form.academic_year).to)

  const [syllabusFile, setSyllabusFile] = useState(null)
  const [error, setError] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)
  const formRef = useRef(null)

  const invalidCount = FIELD_ORDER.filter((key) => errors[key]).length

  /* Failures that are not tied to one field still render in the banner at the
     top of the form -- roughly 300 lines above the file picker and the Save
     button, inside a scroll container. A teacher at the bottom of the modal
     sees the button return to its idle label and nothing else, which reads as
     the button being dead. The toast is viewport-independent and, for errors,
     stays until dismissed. Field-level problems do not come through here: those
     scroll to the offending input instead. */
  const reportError = (message) => {
    setError(message)
    toast.error(message)
  }

  // Clear a field's message as soon as the teacher edits it, so a corrected
  // field stops shouting before they reach the bottom of the form.
  const clearError = (key) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))

  const set = (key) => (e) => {
    const { value } = e.target
    setForm((f) => ({ ...f, [key]: value }))
    clearError(key)
  }

  const handleEducationLevelChange = (level) => {
    setEducationLevel(level)
    setForm((f) => ({ ...f, education_level: level }))
    // Units are only required for College, so the message stops applying the
    // moment the level changes.
    clearError('units')
    clearError('semester')
  }

  // Update schedule string helper
  const updateScheduleString = (days, sh, sm, sp, eh, em, ep) => {
    const dayOrder = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su']
    const sortedDays = dayOrder.filter(d => days.includes(d)).join('')
    const str = sortedDays ? `${sortedDays} ${sh}:${sm} ${sp} – ${eh}:${em} ${ep}` : ''
    setForm(f => ({ ...f, schedule: str }))
    clearError('schedule')
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

  // Handle year changes
  const handleFromYearChange = (val) => {
    const nextTo = String(Number(val) + 1)
    setFromYear(val)
    setToYear(nextTo)
    setForm(f => ({ ...f, academic_year: `${val}-${nextTo}` }))
    clearError('academic_year')
  }

  const handleToYearChange = (val) => {
    setToYear(val)
    setForm(f => ({ ...f, academic_year: `${fromYear}-${val}` }))
    clearError('academic_year')
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
      reportError('Syllabus must be a PDF or Word document.')
      clearFile()
      return
    }
    if (file.size > MAX_SYLLABUS_BYTES) {
      reportError('Syllabus file must be under 10 MB.')
      clearFile()
      return
    }
    setSyllabusFile(file)
  }

  async function submit(e) {
    e.preventDefault()
    const nextErrors = validate(form, selectedDays, originalMaxStudents)
    setErrors(nextErrors)
    const firstBad = FIELD_ORDER.find((key) => nextErrors[key])
    if (firstBad) {
      // The banner at the top can sit off-screen on a scrolled modal, so move
      // to the offending field rather than only naming it.
      const el = formRef.current?.querySelector(`[data-field="${firstBad}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (typeof el?.focus === 'function') el.focus({ preventScroll: true })
      return
    }
    /* Asked after validation, not before: a question about a form that is
       about to be rejected is a question about nothing. The class is named
       back rather than described, because the field the teacher most often
       gets wrong here is which section they are editing. */
    const label = [form.subject_code, form.section].map((v) => String(v ?? '').trim()).filter(Boolean).join(' · ')
    if (!(await confirmDialog({
      title: mode === 'edit' ? `Save changes to "${label}"?` : `Create "${label}"?`,
      message: mode === 'edit'
        ? 'Everyone on the roster sees the updated details the next time they open the class. Nothing recorded against it changes.'
        : 'It joins your class list with an empty roster — you enrol students from the class page afterwards.',
      confirmLabel: mode === 'edit' ? 'Save changes' : 'Create class',
    }))) return
    setSaving(true)
    setError(null)
    try {
      const meta = buildMeta(form, {
        writeCollegeFields: mode !== 'edit' || educationLevel === 'College' || openedAsCollege,
      })
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
          const url = await uploadAttachment(path, syllabusFile)
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
          warning = `Class saved, but the syllabus file was not attached. ${err.message}`
        }
      }
      onSaved({ warning })
    } catch (err) {
      reportError(err.message)
      setSaving(false)
    }
  }

  return (
    <div {...overlayProps} className="fixed inset-0 bg-slate-900/50 z-200 overflow-y-auto">
      <div {...panelProps} className="flex min-h-full items-center justify-center p-4 py-8">
        {/* noValidate: the browser's own bubble fires first and would stop
            submit() before a single inline message could render. */}
        <form ref={formRef} noValidate onSubmit={submit} className="bg-white rounded-xl p-6 w-full max-w-xl space-y-4 shadow-xl">
          <h3 className="text-lg font-semibold text-slate-800">
            {mode === 'edit' ? 'Edit Class' : 'New Class'}
          </h3>
          <p className="text-xs text-slate-500 -mt-2"><span className="text-red-500">*</span> required</p>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          {invalidCount > 0 && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Fix the {invalidCount === 1 ? 'highlighted field' : `${invalidCount} highlighted fields`} below.
            </p>
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
              <span className="text-sm font-medium text-slate-700">Subject Code / Identifier<Req /></span>
              <input
                required placeholder="e.g. MATH10, SCI-1" value={form.subject_code} onChange={set('subject_code')}
                data-field="subject_code"
                aria-invalid={!!errors.subject_code}
                aria-describedby={errors.subject_code ? 'err-subject_code' : undefined}
                className={fieldCls(errors.subject_code)}
              />
              <FieldError id="err-subject_code" message={errors.subject_code} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Section / Room<Req /></span>
              <input
                required placeholder="e.g. Grade 10 - Rizal, Block A" value={form.section} onChange={set('section')}
                data-field="section"
                aria-invalid={!!errors.section}
                aria-describedby={errors.section ? 'err-section' : undefined}
                className={fieldCls(errors.section)}
              />
              <FieldError id="err-section" message={errors.section} />
            </label>
          </div>

          {/* Row 2: Subject Description */}
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Subject Description<Req /></span>
            <input
              required placeholder="e.g. Mathematics 10, Introduction to Computing" value={form.subject} onChange={set('subject')}
              data-field="subject"
              aria-invalid={!!errors.subject}
              aria-describedby={errors.subject ? 'err-subject' : undefined}
              className={fieldCls(errors.subject)}
            />
            <FieldError id="err-subject" message={errors.subject} />
          </label>

          {/* Row 3: Schedule Day & Time Custom Selector */}
          <div
            data-field="schedule"
            className={`space-y-2 border rounded-xl p-3 bg-slate-50/50 ${errors.schedule ? 'border-red-400' : 'border-slate-100'}`}
          >
            <span className="text-sm font-medium text-slate-700 block">Schedule Days<Req /></span>
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
                      color: isActive ? '#FAFAF6' : '#6A7A95',
                      borderColor: isActive ? '#0E2A5C' : '#CBD5E1'
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

            <FieldError id="err-schedule" message={errors.schedule} />
          </div>

          {/* Row 4: Grade/Year Level, Max Students, School Year */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="block col-span-1">
              <span className="text-sm font-medium text-slate-700">Grade / Year Level<Req /></span>
              <input
                required placeholder={educationLevel === 'College' ? 'e.g. 3rd' : 'e.g. Grade 3'} value={form.grade_level} onChange={set('grade_level')}
                data-field="grade_level"
                aria-invalid={!!errors.grade_level}
                aria-describedby={errors.grade_level ? 'err-grade_level' : undefined}
                className={fieldCls(errors.grade_level)}
              />
              <FieldError id="err-grade_level" message={errors.grade_level} />
            </label>
            <label className="block col-span-1">
              <span className="text-sm font-medium text-slate-700">Max Students<Req /></span>
              <input
                required
                type="number"
                min={MIN_STUDENTS}
                max={MAX_STUDENTS}
                placeholder="40"
                value={form.max_students}
                onChange={set('max_students')}
                data-field="max_students"
                aria-invalid={!!errors.max_students}
                aria-describedby={errors.max_students ? 'err-max_students' : undefined}
                className={fieldCls(errors.max_students)}
              />
              <FieldError id="err-max_students" message={errors.max_students} />
            </label>

            {/* School Year Selectors */}
            <div className="block col-span-2">
              <span className="text-sm font-medium text-slate-700 block mb-1">School Year<Req /></span>
              <div className="flex items-center gap-1">
                <select
                  value={fromYear}
                  onChange={(e) => handleFromYearChange(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0E2A5C]/40 flex-1"
                >
                  {YEARS.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <span className="text-slate-400">–</span>
                <select
                  value={toYear}
                  onChange={(e) => handleToYearChange(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0E2A5C]/40 flex-1"
                >
                  {YEARS.filter(y => Number(y) > Number(fromYear)).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <FieldError id="err-academic_year" message={errors.academic_year} />
            </div>
          </div>

          {/* Row 5: Conditional - Course Units + Semester (only for College) */}
          {educationLevel === 'College' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Course Units<Req /></span>
              <input
                required
                type="number"
                min={MIN_UNITS}
                max={MAX_UNITS}
                step="0.5"
                placeholder="3"
                value={form.units}
                onChange={set('units')}
                data-field="units"
                aria-invalid={!!errors.units}
                aria-describedby={errors.units ? 'err-units' : undefined}
                className={fieldCls(errors.units)}
              />
              <FieldError id="err-units" message={errors.units} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Semester<Req /></span>
              <select
                required
                value={form.semester}
                onChange={set('semester')}
                data-field="semester"
                aria-invalid={!!errors.semester}
                aria-describedby={errors.semester ? 'err-semester' : undefined}
                className={fieldCls(errors.semester)}
              >
                <option value="">Select semester</option>
                {SEMESTERS.map((sem) => (
                  <option key={sem.value} value={sem.value}>{sem.label}</option>
                ))}
              </select>
              <FieldError id="err-semester" message={errors.semester} />
            </label>
          </div>
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
