/**
 * Tests for the risk surface of ./ai.js — the /api/predict path only, hence the
 * narrower filename. The rest of ai.js is prompt shaping and is not covered
 * here.
 *
 * What these guard is a disclosure, not a calculation. The backend says what the
 * model was fitted on (`training`, from risk_model.TRAINING_BASIS) and both
 * views render a caveat off the back of it — the teacher's PredictedRisk and the
 * student's ClassStandingForecast. The only thing joining the two is one line in
 * shapeRiskResult. Drop it and nothing breaks loudly: `training` comes back
 * undefined, both components' disclosure blocks quietly evaluate false, and the
 * UI goes back to presenting a synthetic-data score as though it meant
 * something. That silence is what these tests exist to catch.
 *
 * The API is stubbed rather than reached. shapeRiskResult is private, so the
 * chain is exercised through the exported callers, which is the path the app
 * actually takes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {},
}))

const { api } = await import('./api')
const { predictRisk, predictRiskBatch, riskReasons } = await import('./ai')

/** Training metadata shipped by the development artifact. */
const TRAINING = {
  real_data: false,
  source: 'synthetic',
  samples: 8000,
  summary:
    'Trained on 8,000 generated student trajectories, not on real ActivKlass ' +
    'history — no labelled term has finished yet. It projects where a student ' +
    'is heading, so treat it as a prompt to look now, not as evidence about ' +
    'how they will finish.',
}

const reply = (over = {}) => ({
  status: 'scored',
  risk_flag: 'on_track',
  risk_score: 0.13,
  model: 'random_forest',
  top_factors: [{ feature: 'prior_average_grade', importance: 0.26 }],
  signals: [],
  training: TRAINING,
  ...over,
})

beforeEach(() => {
  vi.mocked(api).mockReset()
})

describe('training basis reaches the caller', () => {
  it('carries `training` through from the response', async () => {
    vi.mocked(api).mockResolvedValue(reply())
    const result = await predictRisk({ attendanceRate: 92, priorAverageGrade: 84 })
    expect(result.training).toEqual(TRAINING)
    // real_data is the field both components branch on to decide whether to
    // disclaim; a truthy `training` with this missing would disclose nothing.
    expect(result.training.real_data).toBe(false)
  })

  it('carries it per student in the batch form', async () => {
    vi.mocked(api).mockResolvedValue({
      results: [
        { student_id: 's1', ...reply() },
        { student_id: 's2', ...reply({ risk_flag: 'high_risk', risk_probability: 0.81 }) },
      ],
      features: [],
    })
    const rows = await predictRiskBatch([
      { studentId: 's1', indicators: { attendanceRate: 91 } },
      { studentId: 's2', indicators: { attendanceRate: 40 } },
    ])
    expect(rows).toHaveLength(2)
    // PredictedRisk reads the basis off the first scored row, so every row
    // carrying it is what makes that safe.
    rows.forEach((r) => expect(r.training).toEqual(TRAINING))
    expect(vi.mocked(api).mock.calls[0][1].body).not.toHaveProperty('accepts_insufficient_data')
  })

  it('keeps batch insufficient-data results compatible without a single-call opt-in', async () => {
    vi.mocked(api).mockResolvedValue({
      results: [{
        student_id: 's1', status: 'insufficient_data', risk_flag: null,
        risk_probability: null, missing_features: ['quiz_trend'],
      }],
    })
    const [result] = await predictRiskBatch([
      { studentId: 's1', indicators: { attendanceRate: 91 } },
    ])

    expect(result.status).toBe('insufficient_data')
    expect(result.flag).toBeNull()
    expect(result.score).toBeNull()
    expect(vi.mocked(api).mock.calls[0][1].body).not.toHaveProperty('accepts_insufficient_data')
  })

  it('is null, not undefined, when an older backend omits it', async () => {
    // Deleting rather than destructuring-and-discarding: the config has no
    // ignoreRestSiblings, so the discarded binding would be a lint error.
    const withoutTraining = { ...reply() }
    delete withoutTraining.training
    vi.mocked(api).mockResolvedValue(withoutTraining)
    const result = await predictRisk({ attendanceRate: 92 })
    // PredictedRisk falls back to RISK_CAVEAT on a null here. Leaving the key
    // absent would work by accident today and break the moment anything
    // destructures it with a default.
    expect(result.training).toBeNull()
  })
})

describe('the no-data trap stays visible', () => {
  it('reports insufficient evidence for a student with nothing recorded', async () => {
    vi.mocked(api).mockResolvedValue(reply({ status: 'insufficient_data', risk_flag: null, risk_score: null }))
    const result = await predictRisk({})
    expect(result.status).toBe('insufficient_data')
    expect(result.flag).toBeNull()
    expect(result.score).toBeNull()
    expect(result.probability).toBeNull()
    expect(result.atRisk).toBe(false)

    expect(result.coverage).toBe(0)
    expect(result.supplied).toEqual([])
    expect(result.missing).toContain('attendance_rate')
    expect(vi.mocked(api).mock.calls[0][1].body.accepts_insufficient_data).toBe(true)
  })

  it('counts coverage by model weight, not by field count', async () => {
    vi.mocked(api).mockResolvedValue(reply())
    // attendance_rate alone is 0.08 of the basis -- the whole-term rate is the
    // model's WEAKEST input now that the trends carry the early signal.
    const result = await predictRisk({ attendanceRate: 92 })
    expect(result.coverage).toBe(0.08)
    expect(result.coverage).toBeLessThan(0.7)
  })

  it('never trusts a scored response when the request feature vector is incomplete', async () => {
    vi.mocked(api).mockResolvedValue(reply({ risk_flag: 'high_risk', risk_score: 0.91 }))
    const result = await predictRisk({ attendanceRate: 92 })
    expect(result.status).toBe('insufficient_data')
    expect(result.atRisk).toBe(false)
    expect(result.score).toBeNull()
    // The pre-Option-B backend may ignore this field and return an imputed v1
    // score. The web shaper still suppresses it because the sent vector is partial.
    expect(vi.mocked(api).mock.calls[0][1].body.accepts_insufficient_data).toBe(true)
  })

  it('treats a levels-only caller as under half covered', async () => {
    vi.mocked(api).mockResolvedValue(reply())
    // The three levels are 0.26 + 0.13 + 0.08 = 0.47. A caller with a complete
    // gradebook and no history to difference is still below the 0.7 warning,
    // which is the honest reading: it cannot yet see where anyone is heading.
    const result = await predictRisk({
      priorAverageGrade: 84,
      quizAverage: 79,
      attendanceRate: 92,
    })
    expect(result.coverage).toBe(0.47)
    expect(result.coverage).toBeLessThan(0.7)
    expect(result.missing).toEqual(
      expect.arrayContaining(['attendance_trend', 'quiz_trend', 'missing_work_rate']),
    )
  })

  it('sends trends unscaled, unlike the attendance rate', async () => {
    vi.mocked(api).mockResolvedValue(reply())
    // attendanceRate 92 is a percentage and normalises to 0.92; the trend is
    // already a difference. Halving -0.26 would understate exactly the signal
    // the trend was added for.
    await predictRisk({ attendanceRate: 92, attendanceTrend: -0.26, quizTrend: -14 })
    const sent = vi.mocked(api).mock.calls[0][1].body.indicators
    expect(sent).toEqual({
      attendance_rate: 0.92,
      attendance_trend: -0.26,
      quiz_trend: -14,
    })
  })

  it('never counts an unmeasured indicator as supplied', async () => {
    vi.mocked(api).mockResolvedValue(reply())
    // null/undefined/'' must be omitted, not coerced. A 0 sent for "we did not
    // measure attendance" would read as zero attendance and score the student
    // as high risk on a fabrication.
    const result = await predictRisk({
      attendanceRate: null,
      priorAverageGrade: undefined,
      quizAverage: '',
      attendanceTrend: undefined,
      missingWorkRate: 0.4,
    })
    expect(result.supplied).toEqual(['missing_work_rate'])
    const sent = vi.mocked(api).mock.calls[0][1].body.indicators
    expect(sent).toEqual({ missing_work_rate: 0.4 })
  })

  it('keeps a measured zero, which is not the same as unmeasured', async () => {
    vi.mocked(api).mockResolvedValue(reply())
    // A student with nothing missing genuinely has missing_work_rate 0, and a
    // flat trend genuinely is 0. Dropping them as falsy would report the
    // student as less covered than they are and waste real evidence.
    await predictRisk({ missingWorkRate: 0, attendanceTrend: 0 })
    const sent = vi.mocked(api).mock.calls[0][1].body.indicators
    expect(sent).toEqual({ attendance_trend: 0, missing_work_rate: 0 })
  })
})

// T-251: the parser must accept both the committed v1 reply (risk_probability,
// no status, missing inputs filled with defaults) and the v2 reply (status +
// risk_score), and never let a defaulted v1 number through for missing evidence.
describe('backend contract compatibility (T-251)', () => {
  const FULL = {
    priorAverageGrade: 70, attendanceRate: 90, quizAverage: 60,
    attendanceTrend: -0.1, quizTrend: -5, missingWorkRate: 0.2,
  }
  const v1 = (over = {}) => ({ risk_flag: 'high_risk', risk_probability: 0.75, model: 'random_forest', training: TRAINING, ...over })

  it('A: v1, all six indicators -- the legacy value is kept, as an uncalibrated score', async () => {
    vi.mocked(api).mockResolvedValue(v1({ risk_probability: 0.73 }))
    const result = await predictRisk(FULL)
    expect(result.status).toBe('scored')
    expect(result.score).toBe(0.73)
    expect(result.atRisk).toBe(true)
    expect(result.probability).toBeNull()
  })

  it('B: v1, missing indicators -- the defaulted 75% is discarded', async () => {
    vi.mocked(api).mockResolvedValue(v1())
    const result = await predictRisk({ attendanceRate: 92 })
    expect(result.status).toBe('insufficient_data')
    expect(result.score).toBeNull()
    expect(result.flag).toBeNull()
    expect(result.atRisk).toBe(false)
  })

  it('B: v1 batch, nothing recorded -- no score for that student', async () => {
    vi.mocked(api).mockResolvedValue({ results: [{ student_id: 's1', ...v1() }] })
    const [result] = await predictRiskBatch([{ studentId: 's1', indicators: {} }])
    expect(result.status).toBe('insufficient_data')
    expect(result.score).toBeNull()
  })

  it('C: v2 scored, all six indicators -- risk_score is read on the 0-1 scale', async () => {
    vi.mocked(api).mockResolvedValue(reply({ risk_flag: 'high_risk', risk_score: 0.62, risk_probability: 0.99 }))
    const result = await predictRisk(FULL)
    expect(result.status).toBe('scored')
    expect(result.score).toBe(0.62)
    expect(result.atRisk).toBe(true)
  })

  it('D: v2 insufficient_data is kept even when the request was complete', async () => {
    vi.mocked(api).mockResolvedValue(reply({ status: 'insufficient_data', risk_flag: null, risk_score: null }))
    const result = await predictRisk(FULL)
    expect(result.status).toBe('insufficient_data')
    expect(result.score).toBeNull()
  })

  it('v2 model_unavailable never yields a score', async () => {
    vi.mocked(api).mockResolvedValue(reply({ status: 'model_unavailable', risk_flag: null, risk_score: null }))
    const result = await predictRisk(FULL)
    expect(result.status).toBe('model_unavailable')
    expect(result.score).toBeNull()
  })

  it('rejects an explicit scored status without a finite 0–1 score', async () => {
    vi.mocked(api).mockResolvedValue(reply({ status: 'scored', risk_probability: null, risk_score: null }))
    const result = await predictRisk(FULL)
    expect(result.status).toBe('insufficient_data')
    expect(result.score).toBeNull()
    expect(result.flag).toBeNull()
    expect(result.atRisk).toBe(false)
  })
})

describe('signals become something a reader can act on', () => {
  it('carries per-student signals through', async () => {
    const signals = [{ feature: 'attendance_trend', value: -0.26, code: 'attendance_falling' }]
    vi.mocked(api).mockResolvedValue(reply({ risk_flag: 'high_risk', signals }))
    const result = await predictRisk({ attendanceTrend: -0.26 })
    expect(result.signals).toEqual(signals)
  })

  it('words the same signal differently for each audience', async () => {
    const signals = [
      { feature: 'attendance_trend', value: -0.26, code: 'attendance_falling' },
      { feature: 'missing_work_rate', value: 0.35, code: 'work_not_submitted' },
    ]
    // The teacher scans a list; the student is being told about themselves.
    // Same source, and neither is a bare probability.
    expect(riskReasons(signals, 'teacher')).toEqual([
      'attendance down ~26 pts',
      '35% of work not submitted',
    ])
    expect(riskReasons(signals, 'student')).toEqual([
      'your attendance has dropped about 26 points recently',
      'you have not turned in 35% of your work so far',
    ])
  })

  it('drops a code it has no wording for rather than rendering undefined', async () => {
    expect(riskReasons([{ code: 'something_new', value: 1 }], 'student')).toEqual([])
    expect(riskReasons(undefined, 'student')).toEqual([])
  })
})
