const OPTIONAL = [
  'role', 'email', 'middle_name', 'password',
  'personal_email', 'student_level', 'student_number', 'lrn', 'birthdate',
  'employee_number', 'department', 'course',
]

/** Headers offered by the school-admin account creation templates. */
export const STUDENT_ACCOUNT_TEMPLATE_COLUMNS = [
  'first_name', 'middle_name', 'last_name', 'student_level', 'student_number', 'lrn',
  'course', 'birthdate', 'personal_email', 'password',
]

const REQUIRED = ['first_name', 'last_name']

export function studentLevelForRow(row) {
  const raw = String(row.student_level || '').trim().toLowerCase()
  const aliases = { 'k-12': 'k12', 'k–12': 'k12', 'k 12': 'k12' }
  if (raw) return aliases[raw] || raw
  const level = String(row.grade || row.year_level || '').trim().split(/\s*[-–]\s*/, 1)[0]
  const gradeIsK12 = /^(?:k|kinder(?:garten)?|(?:grade\s*)?(?:[1-9]|1[0-2]))$/i.test(level)
  return gradeIsK12 || Boolean(row.lrn) ? 'k12' : 'college'
}

export function parseBulkUploadRows(parsed) {
  if (parsed.length < 2) throw new Error('The file needs a header row and at least one data row.')
  const header = parsed[0].map((h) => h.trim().toLowerCase())
  const missing = REQUIRED.filter((c) => !header.includes(c))
  if (missing.length) throw new Error(`Missing column(s): ${missing.join(', ')}`)
  // Older files can carry grade/year_level/section. Accept those headers to
  // avoid crashing, but use grade/year_level only for legacy level inference.
  const legacyStudentColumns = new Set(['grade', 'year_level', 'section'])
  const known = new Set([...REQUIRED, ...OPTIONAL, ...legacyStudentColumns])
  return parsed.slice(1).map((cells) => {
    const row = {}
    header.forEach((h, i) => {
      if (known.has(h)) row[h] = (cells[i] ?? '').trim()
    })
    return row
  })
}

export function accountPayload(row, selectedRole) {
  const fields = { ...row }
  const grade = fields.grade
  const yearLevel = fields.year_level
  delete fields.grade
  delete fields.year_level
  delete fields.section
  const role = fields.role || selectedRole
  return {
    ...fields,
    ...(role === 'student' ? { student_level: studentLevelForRow({ ...fields, grade, year_level: yearLevel }) } : {}),
    role,
  }
}
