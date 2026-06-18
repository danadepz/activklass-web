/** Blank class form state (strings, for controlled inputs). */
export function emptyClassForm() {
  return {
    subject_code: '',
    subject: '',
    section: '',
    schedule: '',
    units: '',
    max_students: '',
    academic_year: '2025-2026',
  }
}

/** Map a stored class doc into editable form strings. */
export function classToForm(c) {
  return {
    subject_code: c.subject_code ?? '',
    subject: c.subject ?? '',
    section: c.section ?? '',
    schedule: c.schedule ?? '',
    units: c.units != null ? String(c.units) : '',
    max_students: c.max_students != null ? String(c.max_students) : '',
    academic_year: c.academic_year ?? '2025-2026',
  }
}
