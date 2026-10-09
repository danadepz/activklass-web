/**
 * T-154 (andecobs-220): nothing limited how much text went into a class, and
 * one paste made the My Classes row, the create-confirm dialog, Grade
 * Config's Target Classes picker and the dashboard table all unreadable at
 * once -- the tester proved it by pasting a few thousand words of lorem
 * ipsum into Subject Description.
 *
 * Pinned here: the three class-form fields carry a `maxLength` and a visible
 * counter, `validate()` refuses a paste over the limit with a message (not a
 * silent truncation), and the confirm dialog's own label is capped
 * independently -- a class saved before these limits existed can still hold
 * an unbounded value, and that value must never reach the dialog whole.
 *
 * Static markup, the house pattern for this file -- no DOM library, so this
 * asserts the first render and the pure validator/label functions directly.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(), collection: vi.fn(), doc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn(),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/lib/attachments', () => ({ uploadAttachment: vi.fn() }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [] }) }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import ClassFormModal, { validate, dialogLabelFor, DIALOG_LABEL_MAX } from './ClassFormModal.jsx'
import { emptyClassForm, classToForm } from '@/lib/classForm'
import { SUBJECT_CODE_MAX, SECTION_MAX, SUBJECT_MAX } from '@/lib/validation'

const render = (initial) => renderToStaticMarkup(
  <ClassFormModal mode="create" initial={initial} onClose={() => {}} onSaved={() => {}} />
)

describe('New Class fields carry a maxLength and a counter (T-154)', () => {
  it('caps Subject Code / Identifier at SUBJECT_CODE_MAX', () => {
    const html = render(emptyClassForm())
    expect(html).toMatch(new RegExp(`data-field="subject_code"[^>]*maxLength="${SUBJECT_CODE_MAX}"`))
    expect(html).toContain(`0/${SUBJECT_CODE_MAX}`)
  })

  it('caps Section / Room at SECTION_MAX', () => {
    const html = render(emptyClassForm())
    expect(html).toMatch(new RegExp(`data-field="section"[^>]*maxLength="${SECTION_MAX}"`))
    expect(html).toContain(`0/${SECTION_MAX}`)
  })

  it('caps Subject Description at SUBJECT_MAX', () => {
    const html = render(emptyClassForm())
    expect(html).toMatch(new RegExp(`data-field="subject"[^>]*maxLength="${SUBJECT_MAX}"`))
    expect(html).toContain(`0/${SUBJECT_MAX}`)
  })

  it('shows the real count once the field has a value', () => {
    const html = render({ ...emptyClassForm(), subject_code: 'MATH10' })
    expect(html).toContain(`6/${SUBJECT_CODE_MAX}`)
  })

  it('still renders a class already holding a value longer than the new limit', () => {
    // A document saved before these limits existed, or written straight
    // through the API -- the form must still open and edit it, not crash.
    const huge = 'x'.repeat(5000)
    const html = renderToStaticMarkup(
      <ClassFormModal mode="edit" classId="C1" initial={classToForm({ section: huge, subject_code: 'SCI9', subject: 'Science 9', grade_level: 'Grade 9', academic_year: '2026-2027' })} onClose={() => {}} onSaved={() => {}} />
    )
    expect(html).toContain(`5000/${SECTION_MAX}`)
  })
})

describe('validate() refuses a paste over the limit (T-154)', () => {
  const base = {
    education_level: 'High School',
    subject_code: 'MATH10',
    subject: 'Mathematics 10',
    section: 'Grade 10 - Rizal',
    schedule: 'M 8:00 AM – 9:00 AM',
    grade_level: 'Grade 10',
    academic_year: '2026-2027',
    max_students: '40',
    units: '',
    semester: '',
  }
  const days = ['M']

  it('accepts exactly the limit and refuses one character over, for each of the three fields', () => {
    expect(validate({ ...base, subject_code: 'x'.repeat(SUBJECT_CODE_MAX) }, days).subject_code).toBeUndefined()
    expect(validate({ ...base, subject_code: 'x'.repeat(SUBJECT_CODE_MAX + 1) }, days).subject_code).toMatch(/too long/)

    expect(validate({ ...base, section: 'x'.repeat(SECTION_MAX) }, days).section).toBeUndefined()
    expect(validate({ ...base, section: 'x'.repeat(SECTION_MAX + 1) }, days).section).toMatch(/too long/)

    expect(validate({ ...base, subject: 'x'.repeat(SUBJECT_MAX) }, days).subject).toBeUndefined()
    expect(validate({ ...base, subject: 'x'.repeat(SUBJECT_MAX + 1) }, days).subject).toMatch(/too long/)
  })

  it('does not reject the real class that forced the Section/Room ceiling up from the tester\'s suggested 10', () => {
    expect(validate({ ...base, section: 'Special Science Class - Curie' }, days).section).toBeUndefined()
  })

  it('still says "Room" rather than "Section" on a college class', () => {
    const college = { ...base, education_level: 'College', units: '3', semester: '1st' }
    expect(validate({ ...college, section: 'x'.repeat(SECTION_MAX + 1) }, days).section).toMatch(/^Room is too long/)
  })

  it('still catches a genuinely blank field, same wording as before', () => {
    expect(validate({ ...base, subject_code: '' }, days).subject_code).toBe('Subject code is required.')
    expect(validate({ ...base, section: '' }, days).section).toBe('Section is required.')
    expect(validate({ ...base, subject: '' }, days).subject).toBe('Subject description is required.')
  })
})

describe('dialogLabelFor caps the confirm dialog\'s own label (T-154)', () => {
  it('leaves an ordinary label alone', () => {
    expect(dialogLabelFor({ subject_code: 'MATH10', section: 'Grade 10 - Rizal' })).toBe('MATH10 · Grade 10 - Rizal')
  })

  it('truncates a class saved before the field limits existed', () => {
    // andecobs-220's own repro, sitting in the live project: a section field
    // tens of thousands of characters long. This is exactly what must never
    // reach the dialog whole, or its Cancel button is unreachable again.
    const huge = 'Lorem ipsum '.repeat(4000)
    const label = dialogLabelFor({ subject_code: 'SCI9', section: huge })
    expect(label.length).toBe(DIALOG_LABEL_MAX + 1) // the cap plus the ellipsis mark
    expect(label.startsWith('SCI9 · Lorem ipsum')).toBe(true)
    expect(label.endsWith('…')).toBe(true)
  })
})
