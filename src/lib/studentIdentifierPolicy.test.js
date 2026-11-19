/**
 * Student identifier policy, as the two upload previews apply it (2026-11-19).
 *
 * K-12: a 12-digit LRN is required and is the login source.
 * College: a student number with 6+ digits is required and is the login
 * source -- an LRN on the row never stands in for it.
 *
 * The backend applies the same rule (api/admin.py _prepare_user,
 * api/classes.py provision_students; tests/smoke_student_identifiers.py), so
 * the login each preview shows is the login the server issues.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))

import { rowProblem as adminProblem, rowLogin as adminLogin } from '@/routes/admin/BulkUpload'
import { rowProblem as soloProblem, rowLogin as soloLogin, levelOfClass } from '@/routes/teacher/StudentAccounts'

const base = { role: 'student', first_name: 'Ana', last_name: 'Cruz', birthdate: '2008-03-14' }

describe('institution bulk (BulkUpload)', () => {
  it('a college row with an LRN and a short student number is flagged before upload', () => {
    const row = { ...base, student_level: 'college', student_number: '12', lrn: '136428200011' }
    expect(adminProblem(row, 'snhs')).toMatch(/college students need a student number with 6\+ digits/)
  })
  it('a valid college row with an LRN logs in by its student number, not the LRN', () => {
    const row = { ...base, student_level: 'college', student_number: '2024-500001', lrn: '136428211111' }
    expect(adminProblem(row, 'snhs')).toBe('')
    expect(adminLogin(row, 'snhs')).toBe('snhs-500001')
  })
  it('a K-12 row needs an LRN and logs in by it', () => {
    expect(adminProblem({ ...base, student_level: 'k12', student_number: '2024-500002' }, 'snhs'))
      .toMatch(/K–12 students need a 12-digit LRN/)
    const row = { ...base, student_level: 'k12', student_number: '2024-500002', lrn: '136428222222' }
    expect(adminProblem(row, 'snhs')).toBe('')
    expect(adminLogin(row, 'snhs')).toBe('snhs-222222')
  })
})

describe('solo teacher (StudentAccounts)', () => {
  it('the class decides the level', () => {
    expect(levelOfClass({ education_level: 'College' })).toBe('college')
    expect(levelOfClass({ education_level: 'High School' })).toBe('k12')
    expect(levelOfClass(undefined)).toBe('k12')
  })
  it('K-12 without an LRN is flagged in solo bulk', () => {
    expect(soloProblem({ ...base, student_number: '2024-777777' }, 'ucb', 'k12'))
      .toMatch(/K–12 students need a 12-digit LRN/)
  })
  it('K-12 with an LRN logs in by the LRN, even with a 6+ digit student number', () => {
    const row = { ...base, student_number: '2024-777777', lrn: '136428255555' }
    expect(soloProblem(row, 'ucb', 'k12')).toBe('')
    expect(soloLogin(row, 'ucb', 'k12')).toBe('ucb-255555')
  })
  it('college logs in by the student number, never the LRN', () => {
    const row = { ...base, student_number: '2024-000123', lrn: '136428200011' }
    expect(soloProblem(row, 'ucb', 'college')).toBe('')
    expect(soloLogin(row, 'ucb', 'college')).toBe('ucb-000123')
  })
  it('college with a short student number is flagged, and an email does not rescue it', () => {
    const row = { ...base, student_number: '12', lrn: '136428244444', email: 'ho@test.dev' }
    expect(soloProblem(row, 'ucb', 'college')).toMatch(/college students need a student number with 6\+ digits/)
  })
  it('no level keeps the legacy LRN-first preview', () => {
    const row = { ...base, student_number: '2024-333333', lrn: '136428233333' }
    expect(soloProblem(row, 'ucb')).toBe('')
    expect(soloLogin(row, 'ucb')).toBe('ucb-233333')
  })
})
