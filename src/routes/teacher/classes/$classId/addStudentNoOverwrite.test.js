/**
 * T-197 (maykel_64440-302): Add Student -> Individual found a student's
 * details and pre-filled every field into open inputs, with nothing on
 * screen saying the form would write back. Pressing "Add to class" patched
 * `users/{id}` unconditionally -- shared data, since one student can be on
 * several teachers' rosters -- so an untouched form re-wrote the same values
 * (harmless) but one stray keystroke, or the `matchYearLevel(...) ||
 * defaultYear` fallback that used to run even when the teacher never touched
 * the Year field, silently changed the student's real record.
 *
 * `addStudentPatch(original, fields, identifierType)` is the function that
 * replaced that unconditional `updateDoc(..., rosterPatch(findFields))`
 * call. It is pure and exported, so this is tested directly rather than
 * through the 2000-line modal component.
 */
import { describe, expect, it } from 'vitest'
import { addStudentPatch } from './index.jsx'

describe('T-197 — adding an existing student never overwrites what the account already has', () => {
  it('writes nothing when every field on the account is already filled in', () => {
    // The exact shape from the ticket: a found student with a complete
    // record, re-added to a different class. An untouched -- or edited --
    // form must produce no patch at all once fields are locked, so this
    // asserts the function never includes a key the account already has,
    // whatever the form state says.
    const original = {
      student_number: '2026-00004',
      course: 'ABM',
      year_level: '11',
      birthdate: '2009-11-05',
    }
    // Even if the form state somehow disagreed with the account (a stray
    // keystroke reaching state despite the field being disabled), the
    // patch must still drop any field the account already has.
    const tampered = {
      student_number: '2026-00004',
      lrn: '',
      course: 'BSIS', // changed from the account's 'ABM'
      year_level: '7', // changed from the account's '11'
      birthdate: '2009-11-05',
    }
    expect(addStudentPatch(original, tampered, 'id')).toBeNull()
  })

  it('never includes year_level, course, middle_name, remarks or enrollment_status — ever', () => {
    // These are "optional" fields this form no longer offers to edit. Even
    // with every one of them blank on the account, the patch must still not
    // carry them: the class does not need them to enroll a student, so
    // nothing here should write them.
    const original = { student_number: 'S-1', birthdate: '2010-01-01' }
    const fields = {
      student_number: 'S-1',
      course: 'BSIT',
      year_level: '2nd Year',
      middle_name: 'Reyes',
      remarks: 'Honor Roll',
      enrollment_status: 'IN',
      birthdate: '2010-01-01',
    }
    const patch = addStudentPatch(original, fields, 'id')
    expect(patch).toBeNull()
    expect(Object.keys(addStudentPatch(original, fields, 'id') ?? {})).not.toEqual(
      expect.arrayContaining(['course', 'year_level', 'middle_name', 'remarks', 'enrollment_status']),
    )
  })

  it('fills an identifier the account is missing, and only that', () => {
    const original = { student_number: '', lrn: '', birthdate: '2010-01-01' }
    const fields = { student_number: '2026-00099', lrn: '', birthdate: '2010-01-01' }
    expect(addStudentPatch(original, fields, 'id')).toEqual({ student_number: '2026-00099' })
  })

  it('fills a birthdate the account is missing, and stamps the derived age with it', () => {
    const original = { student_number: 'S-2', birthdate: '' }
    const fields = { student_number: 'S-2', birthdate: '2010-06-15' }
    const patch = addStudentPatch(original, fields, 'id')
    expect(patch.birthdate).toBe('2010-06-15')
    expect(patch).toHaveProperty('age')
    expect(typeof patch.age).toBe('number')
  })

  it('can fill both gaps at once, and nothing else', () => {
    const original = { student_number: '', lrn: '', birthdate: '' }
    const fields = { student_number: '2026-00100', lrn: '', birthdate: '2011-03-20' }
    expect(addStudentPatch(original, fields, 'id')).toEqual({
      student_number: '2026-00100',
      birthdate: '2011-03-20',
      age: expect.any(Number),
    })
  })

  it("reads the LRN field when the toggle is set to LRN, not student_number", () => {
    const original = { lrn: '', student_number: '2026-00004', birthdate: '2009-11-05' }
    const fields = { lrn: '123456789012', student_number: '2026-00004', birthdate: '2009-11-05' }
    expect(addStudentPatch(original, fields, 'lrn')).toEqual({ lrn: '123456789012' })
  })
})
