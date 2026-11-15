/**
 * A school admin cannot create another admin through a bulk CSV (2026-10-03).
 *
 * The web console's create form dropped the Admin option on 2026-10-02
 * (T-113), but `BulkUpload`'s `rowProblem` had its own `role` check, and a
 * CSV's `role` column could still say 'admin' and sail through as long as it
 * carried an email -- a bypass of the exact decision the form enforced.
 * `CREATABLE_ROLES` (routes/admin/ui.js) no longer lists 'admin', which is
 * what actually closes this; these tests pin that `rowProblem` reads that
 * list rather than its own copy of the rule.
 */
import { describe, expect, it } from 'vitest'
import { rowLogin, rowProblem, studentLevelForRow } from './BulkUpload'

describe('BulkUpload · a role column cannot mint an admin', () => {
  const adminRow = {
    first_name: 'New', last_name: 'Admin', role: 'admin', email: 'new.admin@school.edu.ph',
  }

  it('refuses a row whose role column says admin, even with an email', () => {
    expect(rowProblem(adminRow, 'srnhs')).toBe('admin accounts are not created here')
  })

  it('gives that row no login preview', () => {
    expect(rowLogin(adminRow, 'srnhs')).toBeUndefined()
  })

  it('still accepts a teacher row the same as before', () => {
    const teacherRow = {
      first_name: 'Nina', last_name: 'Cruz', role: 'teacher', employee_number: 'T-024018',
    }
    expect(rowProblem(teacherRow, 'srnhs')).toBe('')
    expect(rowLogin(teacherRow, 'srnhs')).toBe('srnhs-024018')
  })
})

describe('BulkUpload · K–12 and college identifiers', () => {
  const base = {
    first_name: 'Ana', last_name: 'Cruz', role: 'student',
    student_number: '2026-0001', birthdate: '2010-01-01',
  }

  it('requires a 12-digit LRN for explicit K–12 rows', () => {
    expect(rowProblem({ ...base, student_level: 'k12' }, 'srnhs')).toBe('K–12 students need a 12-digit LRN')
    expect(rowProblem({ ...base, student_level: 'k12', lrn: '123456789012' }, 'srnhs')).toBe('')
    expect(rowProblem({ ...base, student_level: 'k12', lrn: '12345' }, 'srnhs')).toBe('LRN must be 12 digits')
  })

  it('validates levels, chooses the correct identifier, and infers legacy rows', () => {
    expect(rowProblem({ ...base, student_level: 'university' }, 'srnhs')).toBe("student_level must be 'k12' or 'college'")
    expect(rowProblem({ ...base, student_level: 'college', grade: 'Grade 9' }, 'srnhs')).toBe('')
    expect(rowLogin({ ...base, student_level: 'college', lrn: '123456789012' }, 'srnhs')).toBe('srnhs-260001')
    expect(studentLevelForRow({ ...base, student_level: 'K–12' })).toBe('k12')
    expect(studentLevelForRow({ ...base, grade: 'Grade 9' })).toBe('k12')
    expect(studentLevelForRow({ ...base, year_level: '1st Year' })).toBe('college')
  })

  it('keeps legacy college rows on their student number', () => {
    const row = { ...base, year_level: '1st Year', course: 'BSIT' }
    expect(rowProblem(row, 'srnhs')).toBe('')
    expect(rowLogin(row, 'srnhs')).toBe('srnhs-260001')
  })
})
