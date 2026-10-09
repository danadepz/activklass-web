/**
 * T-159 (maykel_64440-233): the create-class confirmation asked the teacher
 * to confirm a class it never showed them -- a title built from two of the
 * form's six fields, and nothing else. His ask: a clear title ("Create this
 * class?"), a summary (subject, section, schedule, grade, max students,
 * school year) before creating, Cancel renamed "Go back".
 *
 * Pinned here as pure-function tests against `dialogSummaryFor` and
 * `saveConfirmSpec` -- both pulled out of `submit()` specifically so this
 * does not need to drive a file upload, a Firestore write, or the rest of
 * the submit flow to check what the dialog says.
 */
import { describe, expect, it } from 'vitest'
import { dialogSummaryFor, saveConfirmSpec, SUMMARY_FIELD_MAX } from './ClassFormModal.jsx'

const form = {
  subject_code: 'ENGL101',
  subject: 'Introduction to English 101',
  section: 'Grade 10 - M1',
  schedule: 'Thu, Fri 7:00-9:30 AM',
  grade_level: 'Grade 10',
  max_students: '20',
  academic_year: '2026-2027',
}

describe('dialogSummaryFor — the six fields maykel asked for', () => {
  it('reads subject, section, schedule, grade, max students and school year, from the form the save will actually write', () => {
    const summary = dialogSummaryFor(form)
    expect(summary).toContain('Subject: Introduction to English 101')
    expect(summary).toContain('Section: Grade 10 - M1')
    expect(summary).toContain('Schedule: Thu, Fri 7:00-9:30 AM')
    expect(summary).toContain('Grade / Year: Grade 10')
    expect(summary).toContain('Max students: 20')
    expect(summary).toContain('School year: 2026-2027')
  })

  it('shows a dash rather than a blank line for a field the form has not filled', () => {
    expect(dialogSummaryFor({ ...form, section: '' })).toContain('Section: —')
  })

  it('caps a long value so the dialog cannot grow past the viewport -- the same defence T-154 built for the title', () => {
    const huge = 'x'.repeat(5000)
    const summary = dialogSummaryFor({ ...form, subject: huge })
    const subjectLine = summary.split('\n').find((l) => l.startsWith('Subject:'))
    // "Subject: " (9 chars) + the capped value + the ellipsis mark
    expect(subjectLine.length).toBe(9 + SUMMARY_FIELD_MAX + 1)
    expect(subjectLine.endsWith('…')).toBe(true)
  })
})

describe('saveConfirmSpec — title, body and labels', () => {
  it('titles a create "Create this class?", nothing else -- the class is named in the summary now', () => {
    const spec = saveConfirmSpec(form, { mode: 'create', clashText: '', hasClash: false })
    expect(spec.title).toBe('Create this class?')
    expect(spec.title).not.toContain('ENGL101')
  })

  it('titles an edit to match', () => {
    const spec = saveConfirmSpec(form, { mode: 'edit', clashText: '', hasClash: false })
    expect(spec.title).toBe('Save changes to this class?')
  })

  it('bodies a create with maykel\'s own sentence, the class\'s own code substituted', () => {
    const spec = saveConfirmSpec(form, { mode: 'create', clashText: '', hasClash: false })
    expect(spec.message).toMatch(
      /^ENGL101 will be added to your classes with no students\. You can enrol students from the class page\./,
    )
  })

  it('renames Cancel to "Go back", as asked', () => {
    expect(saveConfirmSpec(form, { mode: 'create', clashText: '', hasClash: false }).cancelLabel).toBe('Go back')
  })

  it('the summary is always appended after the body, never replacing it', () => {
    const spec = saveConfirmSpec(form, { mode: 'create', clashText: '', hasClash: false })
    expect(spec.message).toContain('Subject: Introduction to English 101')
    expect(spec.message.indexOf('will be added')).toBeLessThan(spec.message.indexOf('Subject:'))
  })
})

describe('saveConfirmSpec — the clash branch must survive (T-26, built with T-154 in mind)', () => {
  const clashSpec = saveConfirmSpec(form, {
    mode: 'create',
    clashText: 'SCI9 · Newton (Tue/Thu 1:00–2:30 PM)',
    hasClash: true,
  })

  it('puts the clash warning first, not the create sentence', () => {
    expect(clashSpec.message.startsWith('This meets at the same time as SCI9 · Newton (Tue/Thu 1:00–2:30 PM). Create anyway?')).toBe(true)
    expect(clashSpec.message).not.toContain('will be added to your classes')
  })

  it('still appends the summary below the clash warning, not instead of it', () => {
    expect(clashSpec.message).toContain('Subject: Introduction to English 101')
    expect(clashSpec.message.indexOf('This meets at the same time as')).toBeLessThan(clashSpec.message.indexOf('Subject:'))
  })

  it('changes the confirm button to "<verb> anyway"', () => {
    expect(clashSpec.confirmLabel).toBe('Create anyway')
    const editClash = saveConfirmSpec(form, { mode: 'edit', clashText: 'x', hasClash: true })
    expect(editClash.confirmLabel).toBe('Save anyway')
  })
})
