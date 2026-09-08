/**
 * Edit Class and the two College-only fields (andecobs-33 / T-19).
 *
 * The tester's report was that the semester is on New Class and missing from
 * Edit Class. It is one shared block gated on the education level, so the way
 * it goes missing is a class whose level the form guessed wrong -- and the
 * same wrong guess used to make `buildMeta` write `semester: null` over a
 * value the teacher was never shown. Both halves are pinned here: what the
 * edit form renders, and what a save is allowed to write.
 *
 * Static markup, the house pattern -- no DOM library, so this asserts the
 * first render, which is exactly what the tester screenshotted.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(), collection: vi.fn(), doc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn(),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/lib/attachments', () => ({ uploadAttachment: vi.fn() }))
// The same-time warning (T-26) reads the teacher's other classes; there is no
// QueryClient under a static render, so hand it an empty list.
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [] }) }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import ClassFormModal, { buildMeta } from './ClassFormModal.jsx'
import { classToForm, emptyClassForm } from '@/lib/classForm'

const editing = (clazz) => renderToStaticMarkup(
  <ClassFormModal mode="edit" classId="C1" initial={classToForm(clazz)} onClose={() => {}} onSaved={() => {}} />
)

/* A class saved before `education_level` existed: it has a semester and a
   year level, and no level field at all. This is the shape the fallback used
   to read as High School. */
const legacyCollege = {
  subject_code: 'CS201', subject: 'Data Structures', section: 'Room 305',
  grade_level: '2nd', academic_year: '2026-2027', semester: '1st', units: 3,
}
const highSchool = {
  subject_code: 'MATH10', subject: 'Mathematics 10', section: 'Grade 10 - Rizal',
  grade_level: 'Grade 10', academic_year: '2026-2027',
}

describe('Edit Class', () => {
  it('draws Semester and Course Units for a college class stored with its level', () => {
    const html = editing({ ...legacyCollege, education_level: 'College' })
    expect(html).toContain('Semester')
    expect(html).toContain('Course Units')
    expect(html).toContain('1st Semester')
  })

  it('draws them for a legacy college class that never stored a level', () => {
    const html = editing(legacyCollege)
    expect(html).toContain('Semester')
    expect(html).toContain('Course Units')
  })

  it('leaves a K-12 class without either field', () => {
    const html = editing(highSchool)
    expect(html).not.toContain('Course Units')
    expect(html).not.toContain('Select semester')
  })

  /* T-26: the day chips come from parseSchedule, which used to scan the whole
     string with includes() -- the "M" in "PM" pressed Monday on every
     afternoon class and "TTh" kept only Thursday. */
  it('presses exactly the days the stored schedule names', () => {
    const html = editing({ ...highSchool, schedule: 'TTh 1:00 PM – 2:30 PM' })
    const pressed = [...html.matchAll(/aria-pressed="(true|false)"[^>]*>(M|T|W|Th|F|Sa|Su)<\/button>/g)]
      .filter((m) => m[1] === 'true').map((m) => m[2])
    expect(pressed).toEqual(['T', 'Th'])
  })
})

describe('buildMeta', () => {
  const college = { ...emptyClassForm(), education_level: 'College', units: '3', semester: '1st', max_students: '40' }

  it('writes the semester and units a college form shows', () => {
    const meta = buildMeta(college)
    expect(meta.semester).toBe('1st')
    expect(meta.units).toBe(3)
  })

  it('clears both when a teacher moves a class down to K-12 on screen', () => {
    const meta = buildMeta({ ...college, education_level: 'High School' }, { writeCollegeFields: true })
    expect(meta.semester).toBeNull()
    expect(meta.units).toBeNull()
  })

  it('leaves them untouched when the College block was never rendered', () => {
    const meta = buildMeta({ ...emptyClassForm(), max_students: '40' }, { writeCollegeFields: false })
    expect('semester' in meta).toBe(false)
    expect('units' in meta).toBe(false)
    expect(meta.education_level).toBe('High School')
  })
})
