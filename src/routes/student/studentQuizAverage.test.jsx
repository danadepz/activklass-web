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
    // Excusals read successfully and empty, so anything withheld below is
    // withheld because of the evidence under test.
    if (queryKey[0] === 'my-quiz-excusals') return { data: new Set(), isSuccess: true, isLoading: false, isError: false }
    return { data: undefined, isLoading: false, isError: false }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import StudentClassDetail from './classes/$classId/index.jsx'

const att = (quiz_id, total_score, extra = {}) => ({ id: `${quiz_id}-${total_score}`, quiz_id, class_id: 'c1', student_id: 'S1', total_score, total_possible: 100, status: 'graded', ...extra })

async function indicatorsSent(attemptsByQuiz, extra = {}) {
  state.standing = []
  posted.length = 0
  state.data = {
    clazz: { id: 'c1', subject: 'Science', schedule: null },
    teacher: null,
    entry: { final_grade: 80, mode: 'deped_k12', assessments: [], components: [] },
    attendance: { log: [], tally: {}, rate: null },
    contestsByDate: {}, gradeContestsByAssessment: {}, syllabus: null,
    announcements: [], quizzes: [], attemptsByQuiz, scaffoldedTopicIds: new Set(),
    ...extra,
  }
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/student/classes/c1?tab=analytics']}>
      <Routes><Route path="/student/classes/:classId" element={<StudentClassDetail />} /></Routes>
    </MemoryRouter>,
  )
  await Promise.all(state.standing)
  const predict = posted.filter((p) => p.path === '/api/predict')
  expect(predict.length).toBeGreaterThan(0)
  return predict.at(-1).body.indicators
}
const quizAverageSent = async (attemptsByQuiz) => (await indicatorsSent(attemptsByQuiz)).quiz_average

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

describe('student page: quiz dates and unknown evidence (2026-11-23)', () => {
  const quizzes = [
    { id: 'q1', status: 'closed', closes_at: '2026-03-01T17:00' },
    { id: 'q2', status: 'closed', closes_at: '2026-03-02T17:00' },
    { id: 'q3', status: 'closed', closes_at: null }, // dated only by its record column
    { id: 'q4', status: 'closed', closes_at: '2026-03-05T17:00' }, // never attempted
  ]
  const attemptsByQuiz = { q1: [att('q1', 90)], q2: [att('q2', 80)], q3: [att('q3', 30)] }
  const entry = {
    final_grade: 80, mode: 'deped_k12', components: [],
    // The student's entry shape: id and date_given, no source_quiz_id.
    assessments: [{ id: 'quiz-q3', title: 'Q3', date_given: '2026-03-04', status: 'graded' }],
  }

  it('a quiz with no closes_at is dated by its quiz-{id} column, so the trend uses it', async () => {
    const sent = await indicatorsSent(attemptsByQuiz, { quizzes, entry })
    expect(sent.quiz_trend).toBe(-55) // 30 - mean(90, 80), in due-date order
    const undated = await indicatorsSent(attemptsByQuiz, { quizzes, entry: { ...entry, assessments: [] } })
    expect(undated.quiz_trend).toBeUndefined() // only two dated quizzes without it
  })

  it('all reads known: the closed, unattempted q4 counts as missed', async () => {
    // 1 of 5: four closed quizzes plus the graded record column, pooled as the
    // teacher panel pools them (existing rule, unchanged).
    expect((await indicatorsSent(attemptsByQuiz, { quizzes, entry })).missing_work_rate).toBe(0.2)
  })

  it('attempts read failed: no quiz average, trend or missing-work rate is sent (not "every quiz missed")', async () => {
    const sent = await indicatorsSent(attemptsByQuiz, { quizzes, entry, queryErrors: { attempts: new Error('offline') } })
    expect(sent).not.toHaveProperty('quiz_average')
    expect(sent).not.toHaveProperty('quiz_trend')
    expect(sent).not.toHaveProperty('missing_work_rate')
  })

  it('quizzes read failed: no trend (no dates) and no missing-work rate (not "nothing was due")', async () => {
    const sent = await indicatorsSent(attemptsByQuiz, { quizzes, entry, queryErrors: { quizzes: new Error('offline') } })
    expect(sent).not.toHaveProperty('quiz_trend')
    expect(sent).not.toHaveProperty('missing_work_rate')
    expect(sent.quiz_average).toBeCloseTo(200 / 3, 10) // attempts were read fine
  })
})

