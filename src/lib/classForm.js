import { formatSchedule } from '@/lib/schedule'
import { semesterLabel } from '@/lib/validation'

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
  }
}

/** Map a stored class doc into editable form strings. */
export function classToForm(c) {
  return {
    education_level: c.education_level ?? 'High School',
    subject_code: c.subject_code ?? '',
    subject: c.subject ?? '',
    section: c.section ?? '',
    schedule: formatSchedule(c.schedule),
    grade_level: c.grade_level ?? '',
    max_students: c.max_students != null ? String(c.max_students) : '',
    academic_year: c.academic_year ?? '2025-2026',
    units: c.units != null ? String(c.units) : '',
    semester: c.semester ?? '',
  }
}

/**
 * "2026-2027 · 1st Sem" for a college class, "2026-2027" for K-12 -- the one
 * line every list, card and header shows for when a class ran.
 */
export function academicTerm(c) {
  const sem = c.education_level === 'College' ? semesterLabel(c.semester) : ''
  return [c.academic_year, sem].filter(Boolean).join(' · ')
}
