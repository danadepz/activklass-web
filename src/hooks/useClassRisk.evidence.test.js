/**
 * What useClassRisk actually sends to /api/predict, and the evidence it
 * attaches -- run against a fake Firestore. Synthetic fixtures only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = {}
const predictRiskBatch = vi.fn(async (payload) =>
  payload.map((p) => ({ studentId: p.studentId, status: 'insufficient_data', missing: [] })))

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1' } }) }))
vi.mock('@/lib/performance', () => ({ saveClassPerformance: vi.fn(async () => 0) }))
vi.mock('@/lib/ai', () => ({ predictRiskBatch: (p) => predictRiskBatch(p) }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (opts) => opts }))
vi.mock('firebase/firestore', () => ({
  collection: (_db, ...path) => path.join('/'),
  doc: (_db, ...path) => path.join('/'),
  query: (path) => path,
  where: () => null,
  getDoc: async (path) => ({ data: () => store[path] }),
  getDocs: async (path) => ({
    docs: (store[path] ?? []).map((d) => ({ id: d.id, data: () => d })),
  }),
}))

const { useClassRisk } = await import('./useClassRisk')

const mark = (status) => ({ status, remarks: '' })
const att = (quiz_id, score, day) =>
  ({ quiz_id, class_id: 'c1', student_id: 's1', total_score: score, total_possible: 10, submitted_at: `2026-11-${day}T08:00:00Z` })

beforeEach(() => {
  predictRiskBatch.mockClear()
  for (const k of Object.keys(store)) delete store[k]
  store['classes/c1'] = { schedule: { monday: [{ start: '08:00', end: '09:00' }] } }
  store['classes/c1/attendance'] = [
    { id: '2026-11-02', date: '2026-11-02', records: { s1: mark('present') } },
    { id: '2026-11-09', date: '2026-11-09', records: { s1: mark('absent'), s2: mark('present') } },
    { id: '2026-11-16', date: '2026-11-16', session_status: 'cancelled', records: {} },
    { id: '2026-11-23', date: '2026-11-23', records: { s2: mark('present') } }, // s1 not recorded
  ]
  store.quiz_attempts = [att('q1', 2, '02'), att('q1', 10, '03'), att('q2', 0, '05')]
  store['gradebooks/c1/assessments'] = []
  store.quizzes = []
})

describe('useClassRisk · payload and evidence', () => {
  it('averages per distinct quiz, keeps a zero, and leaves unrecorded attendance out', async () => {
    const out = await useClassRisk('c1', [{ student_id: 's1', grade: 80 }]).queryFn()
    const sent = predictRiskBatch.mock.calls[0][0][0].indicators
    expect(sent.quizAverage).toBe(50) // (100 + 0) / 2, not the old best-overall 100
    expect(sent.attendanceRate).toBe(50) // present + absent; cancelled and unrecorded excluded
    expect(sent.priorAverageGrade).toBe(80)

    expect(out.s1.evidence.attendance).toEqual({ held_sessions: 3, marks: 2, excused: 0, not_recorded: 1 })
    expect(out.s1.evidence.quizzes).toEqual({ gradedQuizzes: 2, awaitingGrading: 0, retakesFolded: 1, undatedQuizzes: 2 })
    expect(out.s1.evidence.sessions.cancelled).toBe(1)
    expect(out.s1.evidence.work.missing).toBe(0)
  })

  it('counts meetings from the class start date and says so (A1)', async () => {
    store['classes/c1'] = { ...store['classes/c1'], start_date: '2026-10-26' }
    const out = await useClassRisk('c1', [{ student_id: 's1', grade: 80 }]).queryFn()
    expect(out.s1.evidence.sessions).toMatchObject({ start: '2026-10-26', start_source: 'class' })
    // 26 Oct is a planned Monday with no record: unconfirmed, and still not a mark.
    expect(out.s1.evidence.sessions.unconfirmed).toBeGreaterThan(0)
    expect(predictRiskBatch.mock.calls[0][0][0].indicators.attendanceRate).toBe(50)
  })

  it('orders the quiz trend by due date and leaves an excused quiz out of missing work (A3, A4)', async () => {
    store.quiz_attempts = [att('q3', 4, '01'), att('q1', 9, '20'), att('q2', 8, '05')]
    store.quizzes = [
      { id: 'q1', status: 'closed', closes_at: '2026-11-02T17:00' },
      { id: 'q2', status: 'closed', closes_at: '2026-11-05T17:00' },
      { id: 'q3', status: 'closed', closes_at: '2026-11-09T17:00' },
      { id: 'q4', status: 'closed', closes_at: '2026-11-10T17:00' }, // never attempted
    ]
    let sent = (await useClassRisk('c1', [{ student_id: 's1', grade: 80 }]).queryFn(), predictRiskBatch.mock.calls.at(-1)[0][0].indicators)
    expect(sent.quizTrend).toBe(40 - 85) // q1 90, q2 80, q3 40 by due date -- not by submission
    expect(sent.missingWorkRate).toBe(1 / 4)
    store['classes/c1/quiz_excusals'] = [{ id: 'q4_s1', quiz_id: 'q4', student_id: 's1', excused: true }]
    const out = await useClassRisk('c1', [{ student_id: 's1', grade: 80 }]).queryFn()
    sent = predictRiskBatch.mock.calls.at(-1)[0][0].indicators
    expect(sent.missingWorkRate).toBe(0)
    expect(out.s1.evidence.work).toMatchObject({ missing: 0, excused: 1, attempted: 3 })
  })

  it('A2/A7: a null riskGrade stays missing -- never replaced by the displayed grade', async () => {
    await useClassRisk('c1', [{ student_id: 's1', grade: 80, riskGrade: null }]).queryFn()
    expect(predictRiskBatch.mock.calls.at(-1)[0][0].indicators.priorAverageGrade).toBeUndefined()
  })

  it('never alters the backend status: evidence rides beside it', async () => {
    const out = await useClassRisk('c1', [{ student_id: 's1', grade: 80 }]).queryFn()
    expect(out.s1.status).toBe('insufficient_data')
  })
})
