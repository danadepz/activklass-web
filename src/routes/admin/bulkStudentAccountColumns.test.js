import { describe, expect, it } from 'vitest'
import { accountPayload, parseBulkUploadRows, STUDENT_ACCOUNT_TEMPLATE_COLUMNS } from '@/lib/bulkStudentAccounts'
import { rowProblem } from './BulkUpload.jsx'

describe('student account upload columns and legacy files', () => {
  it('keeps grade and section out of the new student template', () => {
    expect(STUDENT_ACCOUNT_TEMPLATE_COLUMNS).not.toContain('grade')
    expect(STUDENT_ACCOUNT_TEMPLATE_COLUMNS).not.toContain('section')
    expect(STUDENT_ACCOUNT_TEMPLATE_COLUMNS).toContain('student_number')
    expect(STUDENT_ACCOUNT_TEMPLATE_COLUMNS).toContain('lrn')
    expect(STUDENT_ACCOUNT_TEMPLATE_COLUMNS).toContain('student_level')
  })

  it('accepts an older Grade/Section template and uses LRN to retain K-12 identification', () => {
    const [row] = parseBulkUploadRows([
      ['first_name', 'last_name', 'student_number', 'lrn', 'grade', 'section'],
      ['Ana', 'Santos', 'S-123456', '123456789012', 'Grade 8', 'Rizal'],
    ])
    expect(accountPayload({ ...row, role: 'student' }, 'student')).toEqual({
      first_name: 'Ana', last_name: 'Santos', student_number: 'S-123456',
      lrn: '123456789012', role: 'student', student_level: 'k12',
    })
  })

  it('uses a legacy grade only to infer level and never sends grade, year level, or section to account creation', () => {
    const [row] = parseBulkUploadRows([
      ['first_name', 'last_name', 'student_number', 'grade', 'year_level', 'section'],
      ['Leo', 'Cruz', '2026-123456', 'Grade 11', '', 'STEM'],
    ])
    const payload = accountPayload({ ...row, role: 'student' }, 'student')
    expect(payload.student_level).toBe('k12')
    expect(payload).not.toHaveProperty('grade')
    expect(payload).not.toHaveProperty('year_level')
    expect(payload).not.toHaveProperty('section')
  })

  it('keeps the six-digit college student-number policy when the older file omits LRN and grade', () => {
    const [row] = parseBulkUploadRows([
      ['first_name', 'last_name', 'student_number', 'lrn', 'grade', 'section'],
      ['Mia', 'Reyes', '2024-123456', '', '', ''],
    ])
    expect(accountPayload({ ...row, role: 'student' }, 'student').student_level).toBe('college')
  })

  it('builds a valid new K-12 account payload from the current template', () => {
    const [row] = parseBulkUploadRows([
      STUDENT_ACCOUNT_TEMPLATE_COLUMNS,
      ['Ana', '', 'Santos', 'k12', 'STU-123456', '123456789012', '', '2012-04-10', '', ''],
    ])
    const payload = accountPayload({ ...row, role: 'student' }, 'student')
    expect(payload).toMatchObject({ role: 'student', student_level: 'k12', student_number: 'STU-123456', lrn: '123456789012' })
    expect(rowProblem(payload, 'sample-school')).toBe('')
  })
})
