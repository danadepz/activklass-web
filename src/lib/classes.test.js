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

const { classLabel, loadTeacherClasses, studentCount, getTermEndDate, shouldAutoArchive } = await import('./classes')

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

describe('T-138 — getTermEndDate', () => {
  const termDates = {
    school_year_end: '2026-06-30',
    first_sem_end: '2026-11-30',
    second_sem_end: '2027-04-30',
    summer_end: '2027-07-31',
  }

  it('resolves K-12 class (semester null or omitted) to school_year_end', () => {
    expect(getTermEndDate({ id: 'k12-1', semester: null }, termDates)).toBe('2026-06-30')
    expect(getTermEndDate({ id: 'k12-2' }, termDates)).toBe('2026-06-30')
  })

  it('resolves College classes by semester', () => {
    expect(getTermEndDate({ id: 'c1', semester: '1st' }, termDates)).toBe('2026-11-30')
    expect(getTermEndDate({ id: 'c2', semester: '2nd' }, termDates)).toBe('2027-04-30')
    expect(getTermEndDate({ id: 'c3', semester: 'summer' }, termDates)).toBe('2027-07-31')
  })

  it('returns null when term dates are missing or empty', () => {
    expect(getTermEndDate({ id: 'c1', semester: '1st' }, null)).toBeNull()
    expect(getTermEndDate({ id: 'c1', semester: '1st' }, {})).toBeNull()
    expect(getTermEndDate(null, termDates)).toBeNull()
  })
})

describe('T-138 — shouldAutoArchive', () => {
  const termDates = {
    school_year_end: '2026-06-30',
    first_sem_end: '2026-11-30',
    second_sem_end: '2027-04-30',
    summer_end: '2027-07-31',
  }

  // Simulated fixed "now": Dec 15, 2026 (after 1st sem end 2026-11-30, before 2nd sem 2027-04-30)
  const NOW = new Date(2026, 11, 15, 12, 0, 0).getTime()

  it('archives a class past its term date with no post-term activity', () => {
    const pastClass = {
      id: 'c-past',
      semester: '1st',
      updated_at: new Date(2026, 10, 1).getTime(),
    }
    expect(shouldAutoArchive(pastClass, termDates, NOW)).toBe(true)
  })

  it('does NOT archive a class that is still in its term', () => {
    const inTermClass = {
      id: 'c-interm',
      semester: '2nd', // ends 2027-04-30
    }
    expect(shouldAutoArchive(inTermClass, termDates, NOW)).toBe(false)

    const k12InTerm = {
      id: 'c-k12',
      semester: null,
    }
    expect(shouldAutoArchive(k12InTerm, { school_year_end: '2027-06-30' }, NOW)).toBe(false)
  })

  it('does NOT archive a class past its term if it has activity after the term end date', () => {
    const activePastClass = {
      id: 'c-active-past',
      semester: '1st', // ended 2026-11-30
      last_activity_at: new Date(2026, 11, 5).getTime(), // Dec 5, 2026 (after term end)
    }
    expect(shouldAutoArchive(activePastClass, termDates, NOW)).toBe(false)
  })

  it('does NOT archive a class that the teacher manually unarchived after term end', () => {
    const unarchivedClass = {
      id: 'c-unarchived',
      semester: '1st', // ended 2026-11-30
      unarchived_at: new Date(2026, 11, 10).getTime(), // Dec 10, 2026 (teacher unarchived)
    }
    expect(shouldAutoArchive(unarchivedClass, termDates, NOW)).toBe(false)
  })

  it('does NOT archive a class that is already archived', () => {
    const alreadyArchived = {
      id: 'c-archived',
      semester: '1st',
      archived_at: new Date(2026, 10, 15).getTime(),
    }
    expect(shouldAutoArchive(alreadyArchived, termDates, NOW)).toBe(false)
  })

  it('degrades safely: never archives when the school has no term dates set', () => {
    const pastClass = { id: 'c-past', semester: '1st' }
    expect(shouldAutoArchive(pastClass, null, NOW)).toBe(false)
    expect(shouldAutoArchive(pastClass, {}, NOW)).toBe(false)
  })
})
