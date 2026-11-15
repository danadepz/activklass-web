/**
 * Edit Student modal: Enrollment Status and Academic Progress removed
 * (owner request, 2026-11-15) -- UI only, nothing underneath lost.
 *
 * - Enrollment Status: the select is gone from the modal, but the value is
 *   still loaded from the student and written back by rosterPatch, so the
 *   roster's Enrollment column and its AC count keep their data. The Add
 *   Student panel keeps its own Enrollment Status select -- not this ticket.
 * - Academic Progress: it edited users.status, which is the ACCOUNT state the
 *   backend gates sign-in on. With the select gone, Save no longer writes
 *   status at all, so an edit can neither lock a student out nor undo the
 *   modal's own Disable/Enable Sign-In.
 *
 * Source-text test, the pattern this directory uses for the modal
 * (studentModalLabelStyle.test.js): a full render needs heavy Firebase and
 * dialog-behaviour mocks for claims about what the JSX contains.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')

/* From `from` to the first top-level closing brace after it. The file may be
   checked out with CRLF endings, so the end is matched with \r?\n. */
function slice(from) {
  const start = src.indexOf(from)
  expect(start, from).toBeGreaterThan(-1)
  const rest = src.slice(start)
  const end = rest.search(/\r?\n\}\r?\n/)
  expect(end, `end of ${from}`).toBeGreaterThan(0)
  return rest.slice(0, end)
}

const modal = slice('function EditStudentModal(')
const studentFields = slice('function StudentFields(')
const rosterPatchSrc = slice('function rosterPatch(')

describe('Edit Student modal — Academic Progress removed', () => {
  it('no longer renders the Academic Progress select', () => {
    expect(modal).not.toContain('>Academic Progress<')
    expect(modal).not.toContain('Object.entries(STATUS_LABELS)')
    expect(modal).not.toMatch(/setStatus\(/)
  })

  it('Save does not write users.status (sign-in state is changed only by Disable/Enable Sign-In)', () => {
    const update = modal.slice(modal.indexOf('await updateDoc('), modal.indexOf('onDone()'))
    expect(update).toContain('first_name: firstName.trim()')
    expect(update).toContain('...rosterPatch(fields)')
    expect(update).not.toMatch(/\bstatus\b(?!_)/)
  })

  it('keeps the Disable / Enable Sign-In control', () => {
    expect(modal).toContain('Disable Sign-In')
    expect(modal).toContain('Enable Sign-In')
  })
})

describe('Edit Student modal — Enrollment Status removed from the form, kept in the data', () => {
  it('StudentFields renders no Enrollment Status select', () => {
    expect(studentFields).not.toContain('>Enrollment Status</label>')
    expect(studentFields).not.toContain('ENROLLMENT_STATUS_LABELS')
    expect(studentFields).not.toContain("set('enrollment_status')")
  })

  it('the modal still loads the stored value and rosterPatch still writes it back', () => {
    expect(modal).toContain("enrollment_status: student.enrollment_status ?? 'AC'")
    expect(rosterPatchSrc).toContain("enrollment_status: fields.enrollment_status || 'AC'")
  })

  it('every other field is still on the form', () => {
    for (const label of ['ID Number', 'Middle Name', 'LRN', 'Birthdate', 'Remarks']) {
      expect(studentFields, label).toContain(label)
    }
    expect(studentFields).toContain('<ProgramYearFields')
    expect(modal).toContain('<span style={labelStyle}>First Name')
    expect(modal).toContain('<span style={labelStyle}>Last Name')
  })

  it('the Add Student panel keeps its own Enrollment Status select (not this change)', () => {
    const outsideModal = src.replace(modal, '').replace(studentFields, '')
    expect(outsideModal).toContain('<label style={labelStyle}>Enrollment Status</label>')
  })
})
