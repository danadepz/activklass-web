/** Focused request and failure regressions for the server-authoritative risk workflow. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = {}
let failExcusals = false
let failPath = null
const riskResult = { student_id: 's1', indicators: {
  prior_average_grade: 80, attendance_rate: 0.8, attendance_trend: 0,
  quiz_average: 75, quiz_trend: 0, missing_work_rate: 0,
}, status: 'scored', risk_flag: 'on_track', risk_score: 0.2 }

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (opts) => opts }))
vi.mock('@/lib/api', () => ({
  api: vi.fn(async (_url, { body }) => ({ results: [{ ...riskResult, student_id: body.student_id ?? 's1' }] })),
  ApiError: class extends Error {},
}))
vi.mock('firebase/firestore', () => ({
  collection: (_db, ...path) => path.join('/'),
  doc: (_db, ...path) => path.join('/'),
  where: (field) => field,
  query: (path, field) => (field ? `${path}?${field}` : path),
  getDoc: async (path) => ({ data: () => store[path] }),
  getDocs: async (path) => {
    if (path === failPath) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
    if (failExcusals && path.endsWith('/quiz_excusals')) throw Object.assign(new Error('denied'), { code: 'permission-denied' })
    return { docs: (store[path] ?? []).map((d) => ({ id: d.id, data: () => d })) }
  },
}))

const { api } = await import('@/lib/api')
const { useClassRisk } = await import('./useClassRisk')

beforeEach(() => {
  vi.mocked(api).mockClear()
  failExcusals = false
  failPath = null
  for (const k of Object.keys(store)) delete store[k]
  store['classes/c1'] = { schedule: { monday: [{ start: '08:00', end: '09:00' }] } }
  store['classes/c1/attendance'] = [{ id: '2026-11-02', date: '2026-11-02', records: { s1: { status: 'present' } } }]
  store['quiz_attempts?class_id'] = []
  store['gradebooks/c1/assessments'] = []
  store['quizzes?class_ids'] = []
  store['quizzes?class_id'] = []
  store['classes/c1/quiz_excusals'] = []
})

const runRisk = () => useClassRisk('c1', [{ student_id: 's1', grade: 80 }], { periodId: 'p1' }).queryFn()

describe('teacher risk panel · authoritative request', () => {
  it('sends only class and period identifiers; model inputs/results are server-derived', async () => {
    const out = await runRisk()
    expect(api).toHaveBeenCalledWith('/api/predict-class-risk', {
      method: 'POST', body: { class_id: 'c1', period_id: 'p1' },
    })
    expect(out.s1.status).toBe('scored')
    expect(out.s1.atRisk).toBe(false)
  })

  it('a failed source read never starts prediction', async () => {
    failPath = 'classes/c1/attendance'
    await expect(runRisk()).rejects.toMatchObject({ code: 'permission-denied' })
    expect(api).not.toHaveBeenCalled()
  })

  it('a failed excusal evidence read is reported as unknown without changing the model response', async () => {
    failExcusals = true
    const out = await runRisk()
    expect(out.s1.status).toBe('scored')
    expect(out.s1.evidence.work.excusals_unknown).toBe(true)
  })

  it('a failed prediction/delivery request fails the query for a later retry', async () => {
    vi.mocked(api).mockRejectedValueOnce(Object.assign(new Error('Request failed with status 503'), { status: 503 }))
    await expect(runRisk()).rejects.toMatchObject({ status: 503 })
    expect(api).toHaveBeenCalledTimes(1)
  })
})
