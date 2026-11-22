/**
 * Teacher risk panel, checked on the /api/predict REQUEST BODY (the real
 * predictRiskBatch, API stubbed) against a fake Firestore that tells the
 * modern `class_ids` quiz query from the legacy `class_id` one. Synthetic data.
 *
 *  - a failed excusal read is unknown, never "none excused" (2026-11-23);
 *  - legacy quizzes linked by `class_id` count, once, beside modern ones;
 *  - attendance goes out as the model's fraction, never 1% read as 100%;
 *  - the attendance trend counts held sessions only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = {}
let failExcusals = false

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1' } }) }))
vi.mock('@/lib/performance', () => ({ saveClassPerformance: vi.fn(async () => 0) }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (opts) => opts }))
vi.mock('@/lib/api', () => ({
  api: vi.fn(async (_url, { body }) => ({
    results: body.students.map((s) => ({ student_id: s.student_id, status: 'insufficient_data', missing_features: [] })),
  })),
  ApiError: class extends Error {},
}))
vi.mock('firebase/firestore', () => ({
  collection: (_db, ...path) => path.join('/'),
  doc: (_db, ...path) => path.join('/'),
  where: (field) => field,
  query: (path, field) => (field ? `${path}?${field}` : path),
  getDoc: async (path) => ({ data: () => store[path] }),
  getDocs: async (path) => {
    if (failExcusals && path.endsWith('/quiz_excusals')) throw Object.assign(new Error('denied'), { code: 'permission-denied' })
    return { docs: (store[path] ?? []).map((d) => ({ id: d.id, data: () => d })) }
  },
}))

const { api } = await import('@/lib/api')
const { useClassRisk } = await import('./useClassRisk')

const S = 's1'
const day = (date, status, session_status) =>
  ({ id: date, date, ...(session_status ? { session_status } : {}), records: { [S]: { status } } })
const attempt = (quiz_id, score) =>
  ({ quiz_id, class_id: 'c1', student_id: S, total_score: score, total_possible: 100, status: 'graded' })

const modern = { id: 'q1', class_ids: ['c1'], status: 'closed', closes_at: '2026-11-01T17:00' }
const legacy = { id: 'q2', class_id: 'c1', status: 'closed', closes_at: '2026-11-02T17:00' }
const both = { id: 'q3', class_id: 'c1', class_ids: ['c1'], status: 'closed', closes_at: '2026-11-03T17:00' }
const legacyMissed = { id: 'q4', class_id: 'c1', status: 'closed', closes_at: '2026-11-04T17:00' } // never attempted

beforeEach(() => {
  vi.mocked(api).mockClear()
  failExcusals = false
  for (const k of Object.keys(store)) delete store[k]
  store['classes/c1'] = {}
  store['classes/c1/attendance'] = [
    day('2026-11-02', 'present'), day('2026-11-03', 'present'), day('2026-11-04', 'present'),
    day('2026-11-05', 'present'), day('2026-11-06', 'late'), day('2026-11-09', 'late'),
    day('2026-11-10', 'absent'), day('2026-11-11', 'excused'),
    day('2026-11-12', 'absent', 'cancelled'), day('2026-11-13', 'absent', 'rescheduled'), // legacy marks
  ]
  store['quiz_attempts?class_id'] = [attempt('q1', 70), attempt('q1', 90), attempt('q2', 81), attempt('q3', 0)]
  store['gradebooks/c1/assessments'] = []
  store['quizzes?class_ids'] = [modern, both]
  store['quizzes?class_id'] = [legacy, both, legacyMissed]
  store['classes/c1/quiz_excusals'] = []
})

// The hook's query object is built in each test body (react-hooks lint) and run here.
async function sent(risk) {
  const out = await risk.queryFn()
  return { body: vi.mocked(api).mock.calls.at(-1)[1].body.students[0].indicators, out: out[S] }
}

describe('teacher risk panel · request body', () => {
  it('excusals read OK and empty: all six inputs, legacy quizzes counted once', async () => {
    const { body } = await sent(useClassRisk('c1', [{ student_id: S, grade: 80 }]))
    expect(Object.keys(body).sort()).toEqual([
      'attendance_rate', 'attendance_trend', 'missing_work_rate', 'prior_average_grade', 'quiz_average', 'quiz_trend',
    ])
    expect(body.attendance_rate).toBeCloseTo(5 / 7, 12) // 71.428571% as the model's fraction
    expect(body.quiz_average).toBe(57) // (90 + 81 + 0) / 3: retake folded, zero kept
    expect(body.quiz_trend).toBe(-85.5) // q1 90, q2 81 (legacy), q3 0 in due-date order
    expect(body.missing_work_rate).toBe(1 / 4) // q4 (legacy) closed, never attempted; q3 counted once
  })

  it('an excused legacy quiz leaves both numerator and denominator', async () => {
    store['classes/c1/quiz_excusals'] = [{ id: `q4_${S}`, quiz_id: 'q4', student_id: S, excused: true }]
    const { body, out } = await sent(useClassRisk('c1', [{ student_id: S, grade: 80 }]))
    expect(body.missing_work_rate).toBe(0)
    expect(out.evidence.work).toMatchObject({ excused: 1, missing: 0, attempted: 3 })
    expect(out.evidence.work.excusals_unknown).toBeUndefined()
  })

  it('a FAILED excusal read withholds missing_work_rate: five inputs, never a complete score', async () => {
    failExcusals = true
    const { body, out } = await sent(useClassRisk('c1', [{ student_id: S, grade: 80 }]))
    expect(body).not.toHaveProperty('missing_work_rate')
    expect(Object.keys(body)).toHaveLength(5)
    expect(out.evidence.work.excusals_unknown).toBe(true)
  })

  it('a failed excusal read changes nothing when no closed quiz was expected', async () => {
    failExcusals = true
    store['quizzes?class_ids'] = []
    store['quizzes?class_id'] = []
    store['gradebooks/c1/assessments'] = [{ id: 'w1', scores: { [S]: { status: 'missing' } } }]
    const { body } = await sent(useClassRisk('c1', [{ student_id: S, grade: 80 }]))
    expect(body.missing_work_rate).toBe(1)
  })

  it('without the legacy query the legacy quizzes would vanish: q2 undated, q4 never expected', async () => {
    store['quizzes?class_id'] = []
    const { body } = await sent(useClassRisk('c1', [{ student_id: S, grade: 80 }]))
    expect(body.quiz_trend).toBeUndefined() // only q1 and q3 dated
    expect(body.missing_work_rate).toBe(0)
  })

  it('attendance trend counts held sessions only (cancelled / moved-away marks are history)', async () => {
    store['classes/c1/attendance'] = [
      ...['01', '02', '03', '04', '05', '06'].map((d) => day(`2026-11-${d}`, 'present')),
      day('2026-11-07', 'absent', 'cancelled'),
    ]
    const { body } = await sent(useClassRisk('c1', [{ student_id: S, grade: 80 }]))
    expect(body.attendance_trend).toBe(0) // six held presents: flat, not -0.5
    expect(body.attendance_rate).toBe(1)
  })
})
