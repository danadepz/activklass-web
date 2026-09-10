/**
 * One class failing must not blank the whole Students page (T-57). The
 * Firestore-backed loader is not under test here -- only how its per-class
 * results fold into what the page shows.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: null }) }))

const { settleClassRows } = await import('./useTeacherStudents')

const SCI = { id: 'c1', subject_code: 'SCI10', section: '10A' }
const MATH = { id: 'c2', subject_code: 'MATH10', section: '10A' }
const row = (studentId, classId) => ({ studentId, classId })

describe('settleClassRows', () => {
  it('keeps the rows of the classes that loaded and names the one that did not', () => {
    const refused = new Error('Missing or insufficient permissions.')
    const out = settleClassRows([SCI, MATH], [
      { status: 'rejected', reason: refused },
      { status: 'fulfilled', value: [row('s1', 'c2'), row('s2', 'c2')] },
    ])
    expect(out.rows).toEqual([row('s1', 'c2'), row('s2', 'c2')])
    expect(out.failed).toEqual([{ classId: 'c1', label: 'SCI10 · 10A', error: refused }])
  })

  it('reports nothing failed when every class loaded', () => {
    const out = settleClassRows([SCI], [{ status: 'fulfilled', value: [row('s1', 'c1')] }])
    expect(out).toEqual({ rows: [row('s1', 'c1')], failed: [] })
  })

  it('rethrows the first error only when every class failed, so the page still shows its error', () => {
    const first = new Error('first')
    expect(() => settleClassRows([SCI, MATH], [
      { status: 'rejected', reason: first },
      { status: 'rejected', reason: new Error('second') },
    ])).toThrow(first)
  })

  it('a teacher with no classes gets an empty directory, not an error', () => {
    expect(settleClassRows([], [])).toEqual({ rows: [], failed: [] })
  })
})
