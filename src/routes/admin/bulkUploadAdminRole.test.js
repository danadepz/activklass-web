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
import { rowLogin, rowProblem } from './BulkUpload'

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
