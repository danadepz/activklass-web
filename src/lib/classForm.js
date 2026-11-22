import { formatSchedule } from '@/lib/schedule'
import { semesterLabel, yearLevelError } from '@/lib/validation'

/** Strict YYYY-MM-DD calendar validation (Date.parse normalizes impossible days). */
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

/** Blank class form state (strings, for controlled inputs). */
export function emptyClassForm() {
  return {
    education_level: 'High School',
    subject_code: '',
    subject: '',
    section: '',
    schedule: '',
    grade_level: '',
    max_students: '',
    academic_year: '2025-2026',
    units: '',
    semester: '',
    start_date: '',
    end_date: '',
  }
}

/* Which school-wide default start a class takes (C1/C2, 2026-11-22): the
   semester's own start for a college class with one picked, else the school
   year's. A suggestion only -- the teacher confirms it on the form, and it is
   copied onto the class when saved, never read live, so a later change to the
   school's dates never moves a class's own. Null when the admin set none. */
const SEMESTER_START_KEY = { '1st': 'first_sem_start', '2nd': 'second_sem_start', summer: 'summer_start' }
export function schoolDefaultStart(termDates, form) {
  const iso = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  const semKey = form?.education_level === 'College' ? SEMESTER_START_KEY[form?.semester] : null
  return iso(semKey && termDates?.[semKey]) ?? iso(termDates?.school_year_start)
}

/**
 * The level a stored class edits as.
 *
 * `education_level` has only been written since 2026-06-21, so a class made
 * before that -- or seeded straight into Firestore -- carries nothing, and the
 * plain `?? 'High School'` fallback this replaces made every one of them edit
 * as K-12. That hides the College-only Units and Semester fields, which is
 * what a tester saw: the semester is on the New Class form and gone from Edit
 * Class. Anything only a college class carries settles it, so an older college
 * class opens as what it is rather than as what the fallback guessed.
 */
export function classEducationLevel(c) {
  if (c?.education_level) return c.education_level
  if (c?.semester || c?.units != null) return 'College'
  if (c?.grade_level && !yearLevelError(c.grade_level, { level: 'college' })) return 'College'
  return 'High School'
}

/** Map a stored class doc into editable form strings. */
export function classToForm(c) {
  return {
    education_level: classEducationLevel(c),
    subject_code: c.subject_code ?? '',
    subject: c.subject ?? '',
    section: c.section ?? '',
    schedule: formatSchedule(c.schedule),
    grade_level: c.grade_level ?? '',
    max_students: c.max_students != null ? String(c.max_students) : '',
    academic_year: c.academic_year ?? '2025-2026',
    units: c.units != null ? String(c.units) : '',
    semester: c.semester ?? '',
    start_date: c.start_date ?? '',
    end_date: c.end_date ?? '',
  }
}

/**
 * "2026-2027 · 1st Sem" for a college class, "2026-2027" for K-12 -- the one
 * line every list, card and header shows for when a class ran. Reads the same
 * derived level the edit form does, so a class that opens as College also
 * shows its semester in the list.
 */
export function academicTerm(c) {
  const sem = classEducationLevel(c) === 'College' ? semesterLabel(c.semester) : ''
  return [c.academic_year, sem].filter(Boolean).join(' · ')
}
