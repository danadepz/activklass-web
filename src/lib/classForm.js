import { formatSchedule } from '@/lib/schedule'

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
  }
}
