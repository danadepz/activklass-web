/**
 * T-123 (triplecookiemonster-154): the Add Student form used to ask for an
 * ID Number AND an LRN at once, with nothing saying which one the system
 * actually uses. The owner's answer was "its the alternative" -- one
 * identifier, toggled -- so the form now asks a single "Student identifier"
 * question with an ID Number / LRN segmented control (Bulk | Individual's
 * own control, reused rather than a second style), writing to whichever
 * stored field the toggle names.
 *
 * `identifierKey` is the one place that decides which field a typed value
 * lands in. This locks the mapping directly, so a reversed ternary or a
 * hardcoded field fails here immediately rather than only showing up as a
 * student silently missing their LRN after being added through this form.
 */
import { describe, expect, it } from 'vitest'
import { identifierKey } from './index.jsx'

describe('T-123 — identifierKey decides which stored field the toggle writes to', () => {
  it('targets student_number when the toggle reads ID Number', () => {
    expect(identifierKey('id')).toBe('student_number')
  })

  it('targets lrn when the toggle reads LRN', () => {
    expect(identifierKey('lrn')).toBe('lrn')
  })

  it('defaults to student_number for any other value, so ID Number is the fallback behaviour', () => {
    expect(identifierKey(undefined)).toBe('student_number')
    expect(identifierKey('')).toBe('student_number')
  })
})
