/**
 * The student class page sends the model the UNROUNDED mean of the best scored
 * attempt per distinct quiz (owner decision 2026-11-23), the same figure the
 * teacher panel's quizAverageFromAttempts gives. It used to Math.round it, so
 * 81.5 reached /api/predict as 82.
 *
 * Driven through the real page and the real forecast component down to the
 * request body: useQuery is the only seam, as in the house pattern, and the
 * forecast's 'standing' query runs its queryFn so predictRisk really posts.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: null, standing: [] }))
const posted = vi.hoisted(() => [])

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'S1', role: 'student', first_name: 'Hana', last_name: 'Lorenzo' } }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/studentData', () => ({
  loadSyllabus: vi.fn(), loadStudentEntry: vi.fn(), loadStudentAttendance: vi.fn(),
  loadStudentContests: vi.fn(), loadStudentGradeContests: vi.fn(),
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(async (path, opts) => {
    posted.push({ path, body: opts?.body })
    return { status: 'insufficient_data', missing: [], supplied: [] }
  }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: ({ queryKey, queryFn }) => {
    if (queryKey[0] === 'standing') {
      state.standing.push(queryFn())
      return { data: null, isLoading: true, isError: false }
    }
    if (queryKey[0] === 'student-class-detail') return { data: state.data, isLoading: false, isError: false, error: null, refetch: vi.fn() }
    return { data: undefined, isLoading: false, isError: false }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import StudentClassDetail from './classes/$classId/index.jsx'

const att = (quiz_id, total_score, extra = {}) => ({ id: `${quiz_id}-${total_score}`, quiz_id, class_id: 'c1', student_id: 'S1', total_score, total_possible: 100, status: 'graded', ...extra })

async function quizAverageSent(attemptsByQuiz) {
  state.standing = []
  posted.length = 0
  state.data = {
    clazz: { id: 'c1', subject: 'Science', schedule: null },
    teacher: null,
    entry: { final_grade: 80, mode: 'deped_k12', assessments: [], components: [] },
    attendance: { log: [], tally: {}, rate: null },
    contestsByDate: {}, gradeContestsByAssessment: {}, syllabus: null,
    announcements: [], quizzes: [], attemptsByQuiz, scaffoldedTopicIds: new Set(),
  }
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/student/classes/c1?tab=analytics']}>
      <Routes><Route path="/student/classes/:classId" element={<StudentClassDetail />} /></Routes>
    </MemoryRouter>,
  )
  await Promise.all(state.standing)
  const predict = posted.filter((p) => p.path === '/api/predict')
  expect(predict.length).toBeGreaterThan(0)
  return predict.at(-1).body.indicators.quiz_average
}

beforeEach(() => { posted.length = 0 })

describe('student page quiz average reaches /api/predict unrounded', () => {
  it('81 and 82 -> 81.5', async () => {
    expect(await quizAverageSent({ a: [att('a', 81)], b: [att('b', 82)] })).toBe(81.5)
  })

  it('75, 80 and 90 -> 81.666…, not 82', async () => {
    const v = await quizAverageSent({ a: [att('a', 75)], b: [att('b', 80)], c: [att('c', 90)] })
    expect(v).toBeCloseTo(245 / 3, 12)
    expect(v).not.toBe(82)
  })

  it('0 and 85 -> 42.5 (a scored zero counts)', async () => {
    expect(await quizAverageSent({ a: [att('a', 0)], b: [att('b', 85)] })).toBe(42.5)
  })

  it('retakes count once at their best; ungraded and in-progress attempts are ignored', async () => {
    expect(await quizAverageSent({
      a: [att('a', 40), att('a', 81), att('a', null, { status: 'in_progress' })],
      b: [att('b', 82)],
      c: [att('c', null, { status: 'submitted' })],
    })).toBe(81.5)
  })

  it('no scored evidence sends no quiz average at all, never a zero', async () => {
    expect(await quizAverageSent({ a: [att('a', null)] })).toBeUndefined()
    expect(await quizAverageSent({})).toBeUndefined()
  })
})
