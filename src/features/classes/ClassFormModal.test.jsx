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

import ClassFormModal, { buildMeta, validate } from './ClassFormModal.jsx'
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

/* T-84 (andecobs-109): "Input Box misalignment". On New Class the tester saw
   Grade / Year Level's label wrap onto two lines in the quarter-width column,
   which dropped that cell's input a line below the Max Students and School
   Year boxes beside it -- three inputs in one row, two different top edges.

   There is no DOM library here, so the top edges themselves cannot be
   measured. What can be pinned is the thing that produces them: every cell in
   that row reserves the SAME label-block height, so a label that wraps eats
   into its own reserved box instead of pushing its control down. If any cell
   loses that reservation -- or the three stop agreeing on it -- the row can
   drift again, and that is exactly what these fail on. */

const ROW_4 = ['Grade / Year Level', 'Max Students', 'School Year']

/** The row-4 cell wrapper and its label span, straight out of the markup. */
function labelCell(html, label) {
  const re = new RegExp(
    `<(?:label|div) class="([^"]*)"><span class="([^"]*)">${label.replace(/[/*]/g, '\$&')}` +
    `<span class="text-red-500"`
  )
  const m = html.match(re)
  return m && { cell: m[1], labelBox: m[2] }
}

/** The two-line height each cell reserves for its label, in rem, at `sm:` and up. */
function reservedRem(labelBox) {
  const m = labelBox.match(/sm:min-h-\[([\d.]+)rem\]/)
  return m ? Number(m[1]) : 0
}

const creating = (initial) => renderToStaticMarkup(
  <ClassFormModal mode="create" initial={initial} onClose={() => {}} onSaved={() => {}} />
)

describe('New Class row 4 keeps one top edge (T-84)', () => {
  it('reserves a two-line label box in all three cells, the same in each', () => {
    const html = creating(emptyClassForm())
    const cells = ROW_4.map((l) => [l, labelCell(html, l)])
    for (const [label, cell] of cells) expect(cell, `${label} cell`).toBeTruthy()

    const heights = cells.map(([, c]) => reservedRem(c.labelBox))
    // Two lines of the 0.875rem label must fit, or a wrapped label still pushes.
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(2)
    expect(new Set(heights).size, `row 4 reserves ${heights.join(' / ')}rem`).toBe(1)
  })

  it('stacks each cell so the label box sits above the control', () => {
    const html = creating(emptyClassForm())
    for (const label of ROW_4) {
      const { cell, labelBox } = labelCell(html, label)
      expect(cell, `${label} cell`).toMatch(/\bflex\b/)
      expect(cell, `${label} cell`).toMatch(/\bflex-col\b/)
      // label text sits at the bottom of its reserved box, so one-line and
      // two-line labels end on the same baseline above the input
      expect(labelBox, `${label} label`).toMatch(/\bitems-end\b/)
    }
  })

  it('does the same on a College class -- the row is shared', () => {
    const html = creating({ ...emptyClassForm(), education_level: 'College' })
    const heights = ROW_4.map((l) => reservedRem(labelCell(html, l).labelBox))
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(2)
    expect(new Set(heights).size).toBe(1)
  })

  it('does the same on Edit Class -- the same form, the other entry point', () => {
    const html = editing(highSchool)
    const heights = ROW_4.map((l) => reservedRem(labelCell(html, l).labelBox))
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(2)
    expect(new Set(heights).size).toBe(1)
  })
})

/* ------------------------------------------------------------------ *
 * T-92 (verification lock) — a capacity below the roster is refused,
 * and an already-over class can still be saved.
 *
 * Kristine's MATH101 · 1A read "Capacity 61 / 40 students enrolled" and
 * nothing had ever objected. The rule lives in validate(); these pin both
 * directions of it, including the originalMaxStudents exemption whose
 * whole point is that an existing out-of-range value must not block an
 * edit the teacher did not make. Driven through the exported validator,
 * the same pure-function shape buildMeta is tested with above.
 * ------------------------------------------------------------------ */
const capacityForm = {
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
const capacityDays = ['M']
const capErr = (max, originalMax, enrolled) =>
  validate({ ...capacityForm, max_students: String(max) }, capacityDays, originalMax, enrolled).max_students

describe('T-92 — Max students cannot be lowered under the roster', () => {
  it('refuses a new capacity below the enrolled count and names both numbers', () => {
    const message = capErr(40, 61, 61)
    expect(message).toBeTruthy()
    // Kristine's two numbers have to appear, not just "too low".
    expect(message).toContain('61')
    expect(message).toBe('This class already has 61 students. Max students cannot be lower than that.')
  })

  it('refuses it one under the roster too, not only far under', () => {
    expect(capErr(7, 8, 8)).toContain('8')
  })

  it('accepts a capacity exactly at, or above, the roster', () => {
    expect(capErr(61, 40, 61)).toBeUndefined()
    expect(capErr(300, 40, 61)).toBeUndefined()
  })

  it('still lets an ALREADY over-capacity class save an unrelated edit (the exemption)', () => {
    // The 61/40 class Kristine reported. She opens Edit Class to fix a typo
    // in the subject code and leaves Max Students at the 40 it loaded with;
    // re-breaking this locks her out of her own class.
    expect(capErr(40, 40, 61)).toBeUndefined()
    expect(validate({ ...capacityForm, subject_code: 'MATH102', max_students: '40' }, capacityDays, 40, 61))
      .toEqual({})
  })

  it('does not fire on the create path, where no roster is known', () => {
    expect(capErr(5, null, 0)).toBeUndefined()
  })

  it('leaves the pre-existing shape and range rules first in line', () => {
    expect(capErr('abc', 40, 61)).toBe('Max students must be a whole number.')
    expect(capErr(0, 40, 61)).toBe('Max students must be at least 1.')
    // and the older over-300 exemption is untouched by the new branch
    expect(capErr(1000, 1000, 61)).toBeUndefined()
  })
})
