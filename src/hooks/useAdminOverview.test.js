/**
 * T-167: `fetchOverview` must scope the `users` read to the admin's own
 * school, the same way `useAdminUsers.js` does, or Firestore refuses the
 * whole call. The mocked `getDocs` below enforces that rule itself -- an
 * unscoped `users` list throws "permission-denied", exactly like the live
 * tab did (andecobs-249) -- so a regression that drops the `where` clause
 * makes these tests throw instead of merely disagreeing on a count.
 *
 * It must also keep another school's classes, quizzes and attempts off this
 * admin's oversight screen (classes carry no school_id, so membership is
 * derived from the school's own, now-scoped, teacher list).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USERS = [
  { id: 't1', role: 'teacher', school_id: 'srnhs', first_name: 'Marites', last_name: 'Cruz' },
  { id: 't2', role: 'teacher', school_id: 'other-school', first_name: 'Someone', last_name: 'Else' },
  { id: 's1', role: 'student', school_id: 'srnhs' },
]
const CLASSES = [
  { id: 'c1', teacher_id: 't1', section: 'Newton', subject: 'Science' },
  { id: 'c2', teacher_id: 't2', section: 'Foreign', subject: 'Math' },
]
const QUIZZES = [
  { id: 'q1', class_ids: ['c1'] },
  { id: 'q2', class_ids: ['c2'] },
]
const ATTEMPTS = [
  { id: 'a1', class_id: 'c1', total_score: 8, total_possible: 10 },
  { id: 'a2', class_id: 'c2', total_score: 5, total_possible: 10 },
]

function makeSnap(docs) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d })) }
}

const getDocsCalls = []
vi.mock('firebase/firestore', () => ({
  collection: (_db, ...parts) => ({ __type: 'collection', path: parts.join('/') }),
  query: (ref, ...constraints) => ({ __type: 'query', ref, constraints }),
  where: (field, op, value) => ({ __type: 'where', field, op, value }),
  getDocs: async (refOrQuery) => {
    getDocsCalls.push(refOrQuery)
    const isQuery = refOrQuery.__type === 'query'
    const ref = isQuery ? refOrQuery.ref : refOrQuery
    const constraints = isQuery ? refOrQuery.constraints : []

    if (ref.path === 'users') {
      // Mirrors the live rules engine: an admin may read users/{uid} only
      // when sameSchoolAsCaller holds (T-126), and a LIST query is refused
      // outright unless it carries the matching `where`.
      const scope = constraints.find((c) => c.__type === 'where' && c.field === 'school_id')
      if (!scope) throw new Error('permission-denied: Missing or insufficient permissions.')
      return makeSnap(USERS.filter((u) => u.school_id === scope.value))
    }
    if (ref.path === 'classes') return makeSnap(CLASSES)
    if (ref.path === 'quizzes') return makeSnap(QUIZZES)
    if (ref.path === 'quiz_attempts') return makeSnap(ATTEMPTS)
    return makeSnap([])
  },
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))

const { fetchOverview } = await import('./useAdminOverview')

beforeEach(() => { getDocsCalls.length = 0 })

describe('fetchOverview', () => {
  it('refuses an unscoped users list -- proves the mock bites a dropped where', async () => {
    // Exercises the exact shape the pre-fix code used: collection(db,'users')
    // with no query() around it, same as `all('users')` built before T-167.
    const { collection, getDocs } = await import('firebase/firestore')
    await expect(getDocs(collection({}, 'users'))).rejects.toThrow(/permission-denied/)
  })

  it('reads users scoped to the caller\'s own school, not the whole collection', async () => {
    await fetchOverview('srnhs')
    const usersCall = getDocsCalls.find((c) => (c.ref ?? c).path === 'users')
    expect(usersCall.__type).toBe('query')
    expect(usersCall.constraints).toEqual([{ __type: 'where', field: 'school_id', op: '==', value: 'srnhs' }])
  })

  it('returns only this school\'s classes, quizzes and attempts', async () => {
    const result = await fetchOverview('srnhs')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ id: 'c1', teacherName: 'Cruz, Marites', attemptCount: 1 })
    expect(result.stats).toMatchObject({
      teachers: 1, students: 1, classes: 1, activeClasses: 1, quizzes: 1, attempts: 1, schoolAverage: 80,
    })
  })

  it('never surfaces another school\'s class or user', async () => {
    const result = await fetchOverview('srnhs')
    expect(result.rows.some((r) => r.id === 'c2')).toBe(false)
    expect(result.users.some((u) => u.id === 't2')).toBe(false)
  })

  it('short-circuits with no Firestore read when the caller has no school_id', async () => {
    const result = await fetchOverview(undefined)
    expect(result).toEqual({
      rows: [], users: [],
      stats: { totalUsers: 0, activeUsers: 0, teachers: 0, students: 0, parents: 0,
               classes: 0, activeClasses: 0, quizzes: 0, attempts: 0, schoolAverage: null },
    })
    expect(getDocsCalls).toHaveLength(0)
  })
})
