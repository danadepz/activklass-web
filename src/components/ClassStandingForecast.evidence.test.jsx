/**
 * What the student forecast actually sends /api/predict (2026-11-23):
 *   - excusals pending or failed are UNKNOWN, never "none" -- no request while
 *     pending, and no missing_work_rate after a failure, so the six-input
 *     contract cannot return a complete score built on a guess;
 *   - attendance is the owner-approved weighted rate over held sessions.
 * Real component, real riskSignals, real predictRisk; useQuery and the API are
 * the only seams.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const excusal = vi.hoisted(() => ({ state: null }))
const standing = vi.hoisted(() => ({ runs: [], enabled: [] }))
const posted = vi.hoisted(() => [])

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(async (path, opts) => {
    posted.push({ path, body: opts?.body })
    return { status: 'insufficient_data', missing: [], supplied: [] }
  }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: ({ queryKey, queryFn, enabled }) => {
    if (queryKey[0] === 'my-quiz-excusals') return excusal.state
    if (queryKey[0] === 'standing') {
      standing.enabled.push(enabled)
      if (enabled) standing.runs.push(queryFn())
      return { data: null, isLoading: !!enabled, isError: false }
    }
    return { data: undefined, isLoading: false, isError: false }
  },
}))

const ClassStandingForecast = (await import('./ClassStandingForecast.jsx')).default

const PENDING = { isLoading: true, isSuccess: false, isError: false, data: undefined }
const FAILED = { isLoading: false, isSuccess: false, isError: true, data: undefined }
const LOADED = (ids) => ({ isLoading: false, isSuccess: true, isError: false, data: new Set(ids) })

// Every one of the six inputs is available, so the only open question is the
// missing-work rate -- the case where a guess would become a complete score.
const day = (date, status, session_status = 'held') => ({ date, status, session_status })
const log = [
  day('2026-03-01', 'present'), day('2026-03-02', 'present'), day('2026-03-03', 'present'),
  day('2026-03-04', 'present'), day('2026-03-05', 'late'), day('2026-03-06', 'late'),
  day('2026-03-07', 'absent'), day('2026-03-08', 'excused'),
  day('2026-03-09', 'absent', 'cancelled'), day('2026-03-10', 'absent', 'rescheduled'),
]
const quizzes = ['01', '02', '03', '04'].map((d, i) => ({ id: `q${i + 1}`, status: 'closed', closes_at: `2026-03-${d}T17:00` }))
const attempts = [
  { quiz_id: 'q1', total_score: 90, total_possible: 100 },
  { quiz_id: 'q2', total_score: 80, total_possible: 100 },
  { quiz_id: 'q3', total_score: 60, total_possible: 100 },
]

async function render(excusalState, props = {}) {
  excusal.state = excusalState
  standing.runs = []
  standing.enabled = []
  posted.length = 0
  const html = renderToStaticMarkup(
    <ClassStandingForecast
      classId="c1" studentId="S1" grade={80} attendanceRate={50} quizAverage={230 / 3}
      attendanceLog={log} attempts={attempts} assessments={[]} quizzes={quizzes}
      attemptedQuizIds={new Set(['q1', 'q2', 'q3'])} {...props}
    />,
  )
  await Promise.all(standing.runs)
  return { html, body: posted.find((p) => p.path === '/api/predict')?.body }
}

beforeEach(() => { posted.length = 0 })

describe('excusal evidence reaching /api/predict', () => {
  it('pending: no prediction is requested yet, and the card says it is working', async () => {
    const { html, body } = await render(PENDING)
    expect(body).toBeUndefined()
    expect(standing.enabled.every((e) => e === false)).toBe(true)
    expect(html).toContain('Working it out')
  })

  it('failed: missing_work_rate is withheld, so the request cannot be a complete six-input score', async () => {
    const { body } = await render(FAILED)
    expect(body.indicators).not.toHaveProperty('missing_work_rate')
    expect(Object.keys(body.indicators).sort()).toEqual(
      ['attendance_rate', 'attendance_trend', 'prior_average_grade', 'quiz_average', 'quiz_trend'],
    )
  })

  it('loaded, none excused: q4 closed and never attempted counts as missed (1 of 4)', async () => {
    const { body } = await render(LOADED([]))
    expect(body.indicators.missing_work_rate).toBe(0.25)
    expect(Object.keys(body.indicators)).toHaveLength(6)
  })

  it('loaded, q4 excused: it leaves numerator AND denominator (0 of 3)', async () => {
    const { body } = await render(LOADED(['q4']))
    expect(body.indicators.missing_work_rate).toBe(0)
  })

  it('failed, but no closed quiz was expected: an excusal could change nothing, so the rate stands', async () => {
    const open = quizzes.map((q) => ({ ...q, status: 'published', closes_at: '2999-01-01T00:00' }))
    const { body } = await render(FAILED, { quizzes: open, assessments: [{ id: 'w1', status: 'missing' }, { id: 'w2', status: 'graded' }] })
    expect(body.indicators.missing_work_rate).toBe(0.5)
  })

  it('quizzes or attempts unknown (failed reads): missing_work_rate withheld', async () => {
    expect((await render(LOADED([]), { quizzes: undefined })).body.indicators).not.toHaveProperty('missing_work_rate')
    expect((await render(LOADED([]), { attemptedQuizIds: undefined })).body.indicators).not.toHaveProperty('missing_work_rate')
  })
})

describe('attendance reaching /api/predict (owner-approved weighting, 2026-11-23)', () => {
  it('4 present, 2 late, 1 absent, 1 excused -> 71.428571…%, held sessions only, unrounded', async () => {
    const { body } = await render(LOADED([]))
    // Sent as a fraction; (4 + 0.5*2) / (4 + 2 + 1). The absent marks on the
    // cancelled and moved-away dates are not counted.
    expect(body.indicators.attendance_rate).toBeCloseTo(5 / 7, 12)
    expect(body.indicators.attendance_rate).not.toBeCloseTo(0.5, 3)
  })

  it('no counted marks (only excused) -> attendance_rate absent, never 0', async () => {
    const { body } = await render(LOADED([]), { attendanceLog: [day('2026-03-01', 'excused'), day('2026-03-02', 'present', 'cancelled')] })
    expect(body.indicators).not.toHaveProperty('attendance_rate')
  })
  it('the attendance TREND counts held sessions only, like the rate and the teacher panel', async () => {
    const sixHeld = ['01', '02', '03', '04', '05', '06'].map((d) => day(`2026-03-${d}`, 'present'))
    let { body } = await render(LOADED([]), { attendanceLog: [...sixHeld, day('2026-03-07', 'absent', 'cancelled')] })
    expect(body.indicators.attendance_trend).toBe(0) // not -0.5: the cancelled day's absent is history
    ;({ body } = await render(LOADED([]), { attendanceLog: [...sixHeld, day('2026-03-07', 'absent', 'rescheduled')] }))
    expect(body.indicators.attendance_trend).toBe(0)
    // A day with no session_status is a legacy HELD day and still counts.
    ;({ body } = await render(LOADED([]), { attendanceLog: [...sixHeld, { date: '2026-03-07', status: 'absent' }] }))
    expect(body.indicators.attendance_trend).toBe(-0.5)
    // The shared fixture: the two legacy marks on non-held days are out -> -0.65 (teacher figure).
    ;({ body } = await render(LOADED([])))
    expect(body.indicators.attendance_trend).toBeCloseTo(-0.65, 12)
  })

  it('a 1% fallback rate (no log) is sent as 0.01, not as 100% attendance', async () => {
    const { body } = await render(LOADED([]), { attendanceLog: undefined, attendanceRate: 1 })
    expect(body.indicators.attendance_rate).toBeCloseTo(0.01, 12)
  })
})
