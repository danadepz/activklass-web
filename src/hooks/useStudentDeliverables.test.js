/**
 * One class failing must not blank the student's "Up next" panel (the T-57
 * lesson, on the student side). The Firestore reads are not under test --
 * only how their settled results fold into the one list the dashboard shows.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: null }) }))

const { assembleDeliverables, studentClassName } = await import('./useStudentDeliverables')

const NOW = new Date(2026, 8, 15, 10, 0)
const SCI = { id: 'c1', subject_code: 'SCI9', subject: 'Science 9', section: 'Newton' }
const IT = { id: 'c2', subject_code: 'IT101', subject: 'Web Systems', section: 'BSIT-C' }
const ok = (value) => ({ status: 'fulfilled', value })
const refused = () => ({ status: 'rejected', reason: new Error('Missing or insufficient permissions.') })

const quiz = (id, over = {}) => ({ id, title: id, status: 'published', closes_at: '2026-09-18T23:59', ...over })
const task = (id, class_id, over = {}) => ({ id, class_id, kind: 'activity', title: id, status: 'published', due_at: '2026-09-17T23:59', ...over })

describe('studentClassName', () => {
  it('reads as the dashboard’s class card does', () => {
    expect(studentClassName(SCI)).toBe('SCI9 · Science 9')
    expect(studentClassName({ subject_code: 'X' })).toBe('X')
    expect(studentClassName({ section: 'Rizal' })).toBe('Rizal')
    expect(studentClassName(undefined)).toBe('Class')
  })
})

describe('assembleDeliverables', () => {
  it('merges quizzes and tasks across classes into one deadline-ordered list', () => {
    const out = assembleDeliverables({
      classes: [SCI, IT],
      quizResults: [ok([quiz('q-sci')]), ok([quiz('q-it', { closes_at: '2026-09-16T08:00' })])],
      taskChunks: [['c1', 'c2']],
      taskResults: [ok([task('k-sci', 'c1'), task('k-it', 'c2', { due_at: '2026-09-20T23:59' })])],
      attempts: [],
      studentId: 's1',
      now: NOW,
    })
    expect(out.failed).toEqual([])
    expect(out.items.map((d) => d.id)).toEqual(['q-it', 'k-sci', 'q-sci', 'k-it'])
    expect(out.items[0]).toMatchObject({ source: 'quiz', classId: 'c2', className: 'IT101 · Web Systems', href: '/student/classes/c2/quizzes/q-it' })
    expect(out.items[1]).toMatchObject({ source: 'task', classId: 'c1', className: 'SCI9 · Science 9', kind: 'activity' })
  })

  it('keeps the classes that loaded and names the one that did not', () => {
    const out = assembleDeliverables({
      classes: [SCI, IT],
      quizResults: [refused(), ok([quiz('q-it')])],
      taskChunks: [['c1', 'c2']],
      taskResults: [ok([task('k-it', 'c2')])],
      attempts: [],
      studentId: 's1',
      now: NOW,
    })
    expect(out.items.map((d) => d.id)).toEqual(['k-it', 'q-it'])
    expect(out.failed).toEqual([{ classId: 'c1', label: 'SCI9 · Science 9' }])
  })

  it('a refused task chunk names every class in the chunk, once', () => {
    const out = assembleDeliverables({
      classes: [SCI, IT],
      quizResults: [refused(), ok([])],
      taskChunks: [['c1', 'c2']],
      taskResults: [refused()],
      attempts: [],
      studentId: 's1',
      now: NOW,
    })
    expect(out.items).toEqual([])
    expect(out.failed.map((f) => f.classId)).toEqual(['c1', 'c2'])
  })

  it('drops draft quizzes and quizzes not assigned to this student, as the class page does', () => {
    const out = assembleDeliverables({
      classes: [SCI],
      quizResults: [ok([quiz('draft', { status: 'draft' }), quiz('someone-else', { assigned_to: ['s2'] }), quiz('mine', { assigned_to: ['s1'] }), quiz('closed', { status: 'closed' })])],
      taskChunks: [['c1']],
      taskResults: [ok([])],
      attempts: [],
      studentId: 's1',
      now: NOW,
    })
    expect(out.items.map((d) => d.id).sort()).toEqual(['closed', 'mine'])
  })

  it('marks a quiz done only from this student’s finished attempt in this class', () => {
    const out = assembleDeliverables({
      classes: [SCI, IT],
      quizResults: [ok([quiz('q')]), ok([quiz('q')])],
      taskChunks: [['c1', 'c2']],
      taskResults: [ok([])],
      attempts: [
        { quiz_id: 'q', class_id: 'c1', status: 'submitted', attempt_number: 1 },
        { quiz_id: 'q', class_id: 'c2', status: 'in_progress', attempt_number: 1 },
      ],
      studentId: 's1',
      now: NOW,
    })
    const byClass = Object.fromEntries(out.items.map((d) => [d.classId, d.state]))
    expect(byClass).toEqual({ c1: 'done', c2: 'open' })
  })

  it('with no classes at all, an empty list and nothing failed', () => {
    expect(assembleDeliverables({ classes: [], quizResults: [], taskChunks: [], taskResults: [], attempts: [], studentId: 's1', now: NOW }))
      .toEqual({ items: [], failed: [] })
  })
})
