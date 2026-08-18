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
 * UI goes back to presenting a synthetic-data probability as though it meant
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
const { predictRisk, predictRiskBatch } = await import('./ai')

/** What risk_model.TRAINING_BASIS actually ships today. */
const TRAINING = {
  real_data: false,
  source: 'synthetic',
  samples: 4000,
  summary:
    'Trained on 4,000 generated student records, not on real ActivKlass ' +
    'history — no labelled term has finished yet. Treat it as a prompt to ' +
    'look closer, not as evidence about a student.',
}

const reply = (over = {}) => ({
  risk_flag: 'on_track',
  risk_probability: 0.13,
  model: 'random_forest',
  top_factors: [{ feature: 'attendance_rate', importance: 0.42 }],
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
  it('reports zero coverage for a student with nothing recorded', async () => {
    vi.mocked(api).mockResolvedValue(reply())
    const result = await predictRisk({})

    // This is the trap the coverage warning exists for: the backend fills every
    // missing indicator with a healthy cohort default, so a student it knows
    // NOTHING about comes back on_track at 0.13 -- reassuring, and about nobody.
    expect(result.flag).toBe('on_track')
    expect(result.probability).toBe(0.13)
    expect(result.atRisk).toBe(false)

    // Both components gate their warning on coverage < 0.7, so 0 here is what
    // makes that reassurance visibly unfounded rather than silently wrong.
    expect(result.coverage).toBe(0)
    expect(result.supplied).toEqual([])
    expect(result.missing).toContain('attendance_rate')
  })

  it('counts coverage by model weight, not by field count', async () => {
    vi.mocked(api).mockResolvedValue(reply())
    // attendance_rate alone is 0.42 of the model's basis -- one field, and still
    // nowhere near the 0.7 the warning triggers below.
    const result = await predictRisk({ attendanceRate: 92 })
    expect(result.coverage).toBe(0.42)
    expect(result.coverage).toBeLessThan(0.7)
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
      age: 16,
    })
    expect(result.supplied).toEqual(['age'])
    const sent = vi.mocked(api).mock.calls[0][1].body.indicators
    expect(sent).toEqual({ age: 16 })
  })
})
