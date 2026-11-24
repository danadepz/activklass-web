/**
 * What useClassRisk actually sends to /api/predict, and the evidence it
 * attaches -- run against a fake Firestore. Synthetic fixtures only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = {}
const predictClassRisk = vi.fn(async () => [{ studentId: 's1', status: 'insufficient_data', missing: [] }])

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/ai', () => ({ predictClassRisk: (...args) => predictClassRisk(...args) }))
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
  predictClassRisk.mockClear()
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
    const out = await useClassRisk('c1', [{ student_id: 's1', grade: 80 }], { periodId: 'p1' }).queryFn()
    expect(predictClassRisk).toHaveBeenCalledWith('c1', 'p1')

    expect(out.s1.evidence.attendance).toEqual({ held_sessions: 3, marks: 2, excused: 0, not_recorded: 1 })
    expect(out.s1.evidence.quizzes).toEqual({ gradedQuizzes: 2, awaitingGrading: 0, retakesFolded: 1, undatedQuizzes: 2 })
    expect(out.s1.evidence.sessions.cancelled).toBe(1)
    expect(out.s1.evidence.work.missing).toBe(0)
  })

  it('counts meetings from the class start date and says so (A1)', async () => {
    store['classes/c1'] = { ...store['classes/c1'], start_date: '2026-10-26' }
    const out = await useClassRisk('c1', [{ student_id: 's1', grade: 80 }], { periodId: 'p1' }).queryFn()
    expect(out.s1.evidence.sessions).toMatchObject({ start: '2026-10-26', start_source: 'class' })
    // 26 Oct is a planned Monday with no record: unconfirmed, and still not a mark.
    expect(out.s1.evidence.sessions.unconfirmed).toBeGreaterThan(0)
    expect(predictClassRisk).toHaveBeenCalledWith('c1', 'p1')
  })

  it('stops planned meetings at a past class end date; the attendance indicator is unchanged', async () => {
    await useClassRisk('c1', [{ student_id: 's1', grade: 80 }], { periodId: 'p1' }).queryFn()
    store['classes/c1'] = { ...store['classes/c1'], start_date: '2026-10-26', end_date: '2026-10-28' }
    const out = await useClassRisk('c1', [{ student_id: 's1', grade: 80 }], { periodId: 'p1' }).queryFn()
    expect(out.s1.evidence.sessions.ended).toBe('2026-10-28')
    expect(out.s1.evidence.sessions.planned).toBe(1) // Monday-only schedule: 26 Oct, then the class ended
    expect(predictClassRisk).toHaveBeenCalledWith('c1', 'p1')
  })

  it('orders the quiz trend by due date and leaves an excused quiz out of missing work (A3, A4)', async () => {
    store.quiz_attempts = [att('q3', 4, '01'), att('q1', 9, '20'), att('q2', 8, '05')]
    store.quizzes = [
      { id: 'q1', status: 'closed', closes_at: '2026-11-02T17:00' },
      { id: 'q2', status: 'closed', closes_at: '2026-11-05T17:00' },
      { id: 'q3', status: 'closed', closes_at: '2026-11-09T17:00' },
      { id: 'q4', status: 'closed', closes_at: '2026-11-10T17:00' }, // never attempted
    ]
    let out = await useClassRisk('c1', [{ student_id: 's1', grade: 80 }], { periodId: 'p1' }).queryFn()
    expect(predictClassRisk).toHaveBeenCalledWith('c1', 'p1')
    store['classes/c1/quiz_excusals'] = [{ id: 'q4_s1', quiz_id: 'q4', student_id: 's1', excused: true }]
    out = await useClassRisk('c1', [{ student_id: 's1', grade: 80 }], { periodId: 'p1' }).queryFn()
    expect(out.s1.evidence.work).toMatchObject({ missing: 0, excused: 1, attempted: 3 })
  })

  it('A2/A7: a null riskGrade stays missing -- never replaced by the displayed grade', async () => {
    await useClassRisk('c1', [{ student_id: 's1', grade: 80, riskGrade: null }], { periodId: 'p1' }).queryFn()
    expect(predictClassRisk).toHaveBeenCalledWith('c1', 'p1')
  })

  it('never alters the backend status: evidence rides beside it', async () => {
    const out = await useClassRisk('c1', [{ student_id: 's1', grade: 80 }], { periodId: 'p1' }).queryFn()
    expect(out.s1.status).toBe('insufficient_data')
  })
})
