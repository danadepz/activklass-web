/**
 * T-167 / Admin Class Oversight:
 * `fetchOverview` must scope:
 * - `users` to the admin's own school via `where('school_id', '==', schoolId)` (T-126).
 * - `classes` to the school's teachers via `where('teacher_id', 'in', ...)` (T-203).
 * - `quiz_attempts` to the school's students via `where('student_id', 'in', ...)` (T-203).
 *
 * An unscoped list on any of these three collections throws "permission-denied",
 * mirroring Cloud Firestore's live security rules.
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
  { id: 'a1', class_id: 'c1', student_id: 's1', total_score: 8, total_possible: 10 },
  { id: 'a2', class_id: 'c2', student_id: 's2', total_score: 5, total_possible: 10 },
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
      const scope = constraints.find((c) => c.__type === 'where' && c.field === 'school_id')
      if (!scope) throw new Error('permission-denied: Missing or insufficient permissions.')
      return makeSnap(USERS.filter((u) => u.school_id === scope.value))
    }
    if (ref.path === 'classes') {
      const scope = constraints.find((c) => c.__type === 'where' && c.field === 'teacher_id')
      if (!scope) throw new Error('permission-denied: Missing or insufficient permissions.')
      const allowed = Array.isArray(scope.value) ? scope.value : [scope.value]
      return makeSnap(CLASSES.filter((c) => allowed.includes(c.teacher_id)))
    }
    if (ref.path === 'quizzes') return makeSnap(QUIZZES)
    if (ref.path === 'quiz_attempts') {
      const scope = constraints.find((c) => c.__type === 'where' && c.field === 'student_id')
      if (!scope) throw new Error('permission-denied: Missing or insufficient permissions.')
      const allowed = Array.isArray(scope.value) ? scope.value : [scope.value]
      return makeSnap(ATTEMPTS.filter((a) => allowed.includes(a.student_id)))
    }
    return makeSnap([])
  },
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))

const { fetchOverview } = await import('./useAdminOverview')

beforeEach(() => { getDocsCalls.length = 0 })

describe('fetchOverview', () => {
  it('refuses an unscoped users list -- proves the mock bites a dropped where', async () => {
    const { collection, getDocs } = await import('firebase/firestore')
    await expect(getDocs(collection({}, 'users'))).rejects.toThrow(/permission-denied/)
  })

  it('refuses an unscoped classes list -- proves the mock bites dropped teacher_id scoping', async () => {
    const { collection, getDocs } = await import('firebase/firestore')
    await expect(getDocs(collection({}, 'classes'))).rejects.toThrow(/permission-denied/)
  })

  it('refuses an unscoped quiz_attempts list -- proves the mock bites dropped student_id scoping', async () => {
    const { collection, getDocs } = await import('firebase/firestore')
    await expect(getDocs(collection({}, 'quiz_attempts'))).rejects.toThrow(/permission-denied/)
  })

  it('reads users scoped to the caller\'s own school, not the whole collection', async () => {
    await fetchOverview('srnhs')
    const usersCall = getDocsCalls.find((c) => (c.ref ?? c).path === 'users')
    expect(usersCall.__type).toBe('query')
    expect(usersCall.constraints).toEqual([{ __type: 'where', field: 'school_id', op: '==', value: 'srnhs' }])
  })

  it('reads classes scoped to this school\'s teachers', async () => {
    await fetchOverview('srnhs')
    const classesCall = getDocsCalls.find((c) => (c.ref ?? c).path === 'classes')
    expect(classesCall.__type).toBe('query')
    expect(classesCall.constraints).toEqual([{ __type: 'where', field: 'teacher_id', op: 'in', value: ['t1'] }])
  })

  it('reads quiz_attempts scoped to this school\'s students', async () => {
    await fetchOverview('srnhs')
    const attemptsCall = getDocsCalls.find((c) => (c.ref ?? c).path === 'quiz_attempts')
    expect(attemptsCall.__type).toBe('query')
    expect(attemptsCall.constraints).toEqual([{ __type: 'where', field: 'student_id', op: 'in', value: ['s1'] }])
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
