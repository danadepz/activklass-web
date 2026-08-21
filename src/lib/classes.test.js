/**
 * The class list the Record and Attendance pickers read.
 *
 * These exist because the thing they replaced was not a slow endpoint, it was
 * the WRONG DATABASE. GET /api/classes read SQLAlchemy while every other class
 * screen read Firestore, so a class created in the app never appeared in
 * either picker, and the ids it did hand out were SQL ids that the
 * Firestore-backed per-class routes could not load.
 *
 * What is pinned here is the shape that made the two disagree: Firestore
 * classes have no `name`, archived classes must not appear, and the roster
 * count comes from `student_ids`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDocs = vi.fn()
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn((...args) => args),
  where: vi.fn((f, op, v) => ({ f, op, v })),
  getDocs: (...args) => getDocs(...args),
}))
vi.mock('./firebase', () => ({ db: {} }))

const { classLabel, loadTeacherClasses, studentCount } = await import('./classes')

const snapshotOf = (docs) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d })),
})

beforeEach(() => {
  getDocs.mockReset()
})

describe('classLabel', () => {
  it('prefers the subject code with the section', () => {
    expect(classLabel({ subject_code: 'SCI9', section: 'Newton' })).toBe('SCI9 · Newton')
  })

  it('does not leave a dangling separator when there is no section', () => {
    // `${code} · ${undefined ?? ''}`.trim() leaves "SCI9 ·", which reads as a
    // rendering bug to anyone looking at it.
    expect(classLabel({ subject_code: 'SCI9' })).toBe('SCI9')
  })

  it('falls back through section, subject, then name', () => {
    expect(classLabel({ section: 'Newton' })).toBe('Newton')
    expect(classLabel({ subject: 'Science 9' })).toBe('Science 9')
    // `name` is a SQL-era column that Firestore classes do not carry. Kept in
    // the chain so anything still passing the old shape renders a heading
    // rather than an empty one.
    expect(classLabel({ name: 'Legacy Class' })).toBe('Legacy Class')
  })

  it('never renders an empty heading', () => {
    expect(classLabel({})).toBe('Class')
    expect(classLabel(null)).toBe('Class')
  })
})

describe('studentCount', () => {
  it('counts the roster', () => {
    expect(studentCount({ student_ids: ['a', 'b', 'c'] })).toBe(3)
  })

  it('is 0, not a crash, when the roster is missing or malformed', () => {
    // A class document written before student_ids existed, or one where the
    // field arrived as something other than an array. The picker renders this
    // straight into "N students", so throwing here white-screens the page.
    expect(studentCount({})).toBe(0)
    expect(studentCount({ student_ids: null })).toBe(0)
    expect(studentCount(undefined)).toBe(0)
  })
})

describe('loadTeacherClasses', () => {
  it('hides archived classes', async () => {
    getDocs.mockResolvedValue(snapshotOf([
      { id: 'live', subject_code: 'SCI9', section: 'Newton' },
      { id: 'gone', subject_code: 'IT99', section: 'BSIT 1-B', archived_at: '2026-08-01' },
    ]))
    const classes = await loadTeacherClasses('teacher-1')
    expect(classes.map((c) => c.id)).toEqual(['live'])
  })

  it('sorts by the label the picker actually shows', async () => {
    // Sorting by raw document order put classes in creation order, which is
    // not the order the teacher reads them in.
    getDocs.mockResolvedValue(snapshotOf([
      { id: '3', subject_code: 'MATH7', section: 'Rizal' },
      { id: '1', subject_code: 'ENG10', section: 'Bonifacio' },
      { id: '2', subject_code: 'IT101', section: 'BSIT 2-A' },
    ]))
    const classes = await loadTeacherClasses('teacher-1')
    expect(classes.map((c) => c.subject_code)).toEqual(['ENG10', 'IT101', 'MATH7'])
  })

  it('returns [] without querying when there is no teacher yet', async () => {
    // The picker renders before the profile resolves. Querying with undefined
    // would either throw or, worse, match nothing and read as "no classes".
    await expect(loadTeacherClasses(undefined)).resolves.toEqual([])
    expect(getDocs).not.toHaveBeenCalled()
  })

  it('carries the document id through as the class id', async () => {
    // The pickers build /teacher/classes/${c.id}/record from this. The old
    // endpoint returned SQL ids, which those Firestore-backed routes could not
    // load -- so the id being the Firestore document id is the fix, not a
    // detail.
    getDocs.mockResolvedValue(snapshotOf([{ id: 'demo-sci9-newton', subject: 'Science 9' }]))
    const [first] = await loadTeacherClasses('teacher-1')
    expect(first.id).toBe('demo-sci9-newton')
  })
})
