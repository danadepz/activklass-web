/**
 * A class's capacity cannot be lowered below its own roster (T-92,
 * triplecookiemonster-120). Kristine's MATH101 · 1A read "Capacity 61 / 40
 * students enrolled" -- 61 students in a class capped at 40 -- and nothing
 * had ever refused it. Both add paths already enforce a full class; the gap
 * was `validate()` here, which checked `max_students` for shape and the
 * MIN_STUDENTS..MAX_STUDENTS range only, never against who was already
 * enrolled.
 *
 * Pure-function tests against the exported validator, the same pattern
 * `buildMeta` already uses in ClassFormModal.test.jsx -- no DOM needed for a
 * rule that only reads the form and two numbers.
 */
import { describe, expect, it } from 'vitest'
import { validate } from './ClassFormModal.jsx'

const validForm = {
  education_level: 'High School',
  subject_code: 'MATH101',
  subject: 'Mathematics 101',
  section: '1A',
  schedule: 'M 8:00 AM – 9:00 AM',
  grade_level: 'Grade 10',
  academic_year: '2026-2027',
  units: '',
  semester: '',
}
const selectedDays = ['M']

describe('T-92 — a new capacity cannot be lower than the roster already enrolled', () => {
  it('refuses a new max_students below the enrolled count, naming both numbers', () => {
    const errors = validate({ ...validForm, max_students: '40' }, selectedDays, 61, 61)
    expect(errors.max_students).toBe('This class already has 61 students. Max students cannot be lower than that.')
  })

  it('accepts a new max_students at or above the enrolled count', () => {
    const atCap = validate({ ...validForm, max_students: '61' }, selectedDays, 61, 61)
    expect(atCap.max_students).toBeUndefined()
    const aboveCap = validate({ ...validForm, max_students: '70' }, selectedDays, 61, 61)
    expect(aboveCap.max_students).toBeUndefined()
  })

  it('lets an already over-capacity class save untouched -- the originalMaxStudents exemption', () => {
    // The class is already 61/40 from before this rule existed. The teacher
    // opens Edit Class to fix something unrelated and saves max_students
    // exactly as it was loaded (40); that must not suddenly start failing.
    const errors = validate({ ...validForm, max_students: '40' }, selectedDays, 40, 61)
    expect(errors.max_students).toBeUndefined()
  })

  it('does not fire with no known roster (create path, enrolledCount 0)', () => {
    const errors = validate({ ...validForm, max_students: '5' }, selectedDays, null, 0)
    expect(errors.max_students).toBeUndefined()
  })

  it('still catches the ordinary "too small" and "not a number" cases first', () => {
    expect(validate({ ...validForm, max_students: '0' }, selectedDays, null, 61).max_students)
      .toBe('Max students must be at least 1.')
    expect(validate({ ...validForm, max_students: 'abc' }, selectedDays, null, 61).max_students)
      .toBe('Max students must be a whole number.')
  })
})
