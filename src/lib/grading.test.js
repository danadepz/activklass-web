/**
 * Unit tests for the pure grade math in ./grading.js.
 *
 * Every expected value below is hand-computed, and the DepEd numbers are kept
 * deliberately in step with the backend's tests/test_grade_service.py that this
 * pipeline was ported from -- so a drift between the two shows up here rather
 * than as two services disagreeing about a student's report card.
 *
 * If these fail, the grade math changed. That is a release blocker, not a test
 * to update.
 */
import { describe, expect, it } from 'vitest'
import {
  DEPED_COMPONENT_PRESET,
  computeFinalGrade,
  finalAcrossPeriods,
  weightsValid,
} from './grading.js'

const graded = (raw) => ({ status: 'graded', raw_score: raw })
const missing = { status: 'missing', raw_score: null }
const excused = { status: 'excused', raw_score: null }

/** DepEd Order No. 8 s. 2015 core-subject weights: WW 30 / PT 50 / QA 20. */
const depedCore = () => [
  { id: 'ww', weight_percent: 30, assessments: [{ id: 'w1', total_points: 30 }] },
  { id: 'pt', weight_percent: 50, assessments: [{ id: 'p1', total_points: 50 }] },
  { id: 'qa', weight_percent: 20, assessments: [{ id: 'q1', total_points: 50 }] },
]

/** DepEd Science/Math weights: WW 40 / PT 40 / QA 20 (backend fixture shape). */
const depedScience = () => [
  { id: 'ww', weight_percent: 40, assessments: [{ id: 'w1', total_points: 30 }] },
  { id: 'pt', weight_percent: 40, assessments: [{ id: 'p1', total_points: 50 }] },
  { id: 'qa', weight_percent: 20, assessments: [{ id: 'q1', total_points: 50 }] },
]

describe('computeFinalGrade — DepEd K-12 weighting path', () => {
  it('weights the three core components, then transmutes', () => {
    // WW 24/30=80, PT 45/50=90, QA 40/50=80
    // initial = (30*80 + 50*90 + 20*80)/100 = 8500/100 = 85.00 -> band 84.0 -> 90
    const result = computeFinalGrade(
      depedCore(),
      { w1: graded(24), p1: graded(45), q1: graded(40) },
      'deped_k12',
    )
    expect(result.initial).toBe(85)
    expect(result.final).toBe(90)
    expect(result.descriptor).toBe('Outstanding')
    expect(result.breakdown).toEqual({ ww: 80, pt: 90, qa: 80 })
  })

  it('matches the backend fixture for Science/Math weights (initial 84.00)', () => {
    // (40*80 + 40*90 + 20*80)/100 = 8400/100 = 84.00 -- the same value as
    // test_grade_service.py "full period grade".
    const result = computeFinalGrade(
      depedScience(),
      { w1: graded(24), p1: graded(45), q1: graded(40) },
      'deped_k12',
    )
    expect(result.initial).toBe(84)
    expect(result.final).toBe(90)
  })

  it('re-normalizes over components that have data when QA is not yet given', () => {
    // (30*80 + 50*90)/80 = 6900/80 = 86.25 -> band 85.6 -> 91
    const result = computeFinalGrade(
      depedCore(),
      { w1: graded(24), p1: graded(45) },
      'deped_k12',
    )
    expect(result.initial).toBe(86.25)
    expect(result.final).toBe(91)
    expect(result.descriptor).toBe('Outstanding')
    // An ungraded component neither drags the grade down nor inflates it.
    expect(result.breakdown.qa).toBeNull()
  })

  it('falls back to the grade of the only component with data', () => {
    // PT alone: 45/50 = 90.00 -> band 88.8 -> 93
    const result = computeFinalGrade(depedCore(), { p1: graded(45) }, 'deped_k12')
    expect(result.initial).toBe(90)
    expect(result.final).toBe(93)
  })

  it('counts missing work as zero of possible', () => {
    // WW: 0/30 = 0.00, the only component with data -> band 0.0 -> 60 floor
    const result = computeFinalGrade(depedCore(), { w1: missing }, 'deped_k12')
    expect(result.initial).toBe(0)
    expect(result.final).toBe(60)
    expect(result.descriptor).toBe('Did Not Meet Expectations')
  })

  it('excludes excused work from both sides', () => {
    const components = [
      {
        id: 'ww',
        weight_percent: 30,
        assessments: [{ id: 'w1', total_points: 30 }, { id: 'w2', total_points: 20 }],
      },
    ]
    // 24/30 = 80, not 24/50 = 48
    const result = computeFinalGrade(components, { w1: graded(24), w2: excused }, 'deped_k12')
    expect(result.initial).toBe(80)
    expect(result.final).toBe(87) // band 79.2 -> 87
  })

  it('treats a score of zero as data, not as an ungraded item', () => {
    const result = computeFinalGrade(depedCore(), { w1: graded(0) }, 'deped_k12')
    expect(result.initial).toBe(0)
    expect(result.final).toBe(60)
  })

  it('rounds the initial grade half-up to two decimals', () => {
    // WW 20/30 = 66.666..% -> 66.67 -> band 66.4 -> 79
    const result = computeFinalGrade(depedCore(), { w1: graded(20) }, 'deped_k12')
    expect(result.initial).toBe(66.67)
    expect(result.final).toBe(79)
    expect(result.descriptor).toBe('Fairly Satisfactory')
  })

  it('does not drift below 100 on decimal weights that sum to 100', () => {
    const even = [
      { id: 'c1', weight_percent: 33.33, assessments: [{ id: 'x1', total_points: 10 }] },
      { id: 'c2', weight_percent: 33.33, assessments: [{ id: 'x2', total_points: 10 }] },
      { id: 'c3', weight_percent: 33.34, assessments: [{ id: 'x3', total_points: 10 }] },
    ]
    const result = computeFinalGrade(
      even,
      { x1: graded(10), x2: graded(10), x3: graded(10) },
      'deped_k12',
    )
    expect(result.initial).toBe(100)
    expect(result.final).toBe(100)
  })

  it('returns nulls when nothing is recorded', () => {
    const result = computeFinalGrade(depedCore(), {}, 'deped_k12')
    expect(result).toMatchObject({ initial: null, final: null, descriptor: null })
    expect(result.breakdown).toEqual({ ww: null, pt: null, qa: null })
  })

  it('defaults to the DepEd mode when none is passed', () => {
    const result = computeFinalGrade(
      depedCore(),
      { w1: graded(24), p1: graded(45), q1: graded(40) },
    )
    expect(result.final).toBe(90)
    expect(result.descriptor).toBe('Outstanding')
  })

  it('tolerates missing components and scores rather than throwing', () => {
    expect(computeFinalGrade(undefined, undefined).final).toBeNull()
    expect(computeFinalGrade([], null).final).toBeNull()
  })
})

describe('computeFinalGrade — transmutation band edges', () => {
  // One component at 100% weight, so the initial grade is exactly the percent.
  const at = (percent) =>
    computeFinalGrade(
      [{ id: 'c', weight_percent: 100, assessments: [{ id: 'a', total_points: 100 }] }],
      { a: graded(percent) },
      'deped_k12',
    )

  it.each([
    [100, 100, 'Outstanding'],
    [90, 93, 'Outstanding'],
    [85.6, 91, 'Outstanding'],
    [84, 90, 'Outstanding'],
    [83.99, 89, 'Very Satisfactory'],
    [76, 85, 'Very Satisfactory'],
    [75, 84, 'Satisfactory'],
    [68, 80, 'Satisfactory'],
    [61.6, 76, 'Fairly Satisfactory'],
    [60, 75, 'Fairly Satisfactory'],
    [59.99, 74, 'Did Not Meet Expectations'],
    [4, 61, 'Did Not Meet Expectations'],
    [0, 60, 'Did Not Meet Expectations'],
  ])('initial %s transmutes to %s (%s)', (initial, final, descriptor) => {
    const result = at(initial)
    expect(result.final).toBe(final)
    expect(result.descriptor).toBe(descriptor)
  })

  it('clamps to the 60 floor and the 100 ceiling', () => {
    expect(at(0).final).toBe(60)
    expect(at(100).final).toBe(100)
  })
})

describe('computeFinalGrade — malformed assessment data', () => {
  it('skips an assessment with a non-numeric total_points instead of poisoning the sum', () => {
    // Regression: one bad assessment used to make the weighted sum NaN, and NaN
    // fell past every transmutation band to the 60 floor -- handing the whole
    // class a saved final of 60 / "Did Not Meet Expectations".
    const components = [
      {
        id: 'ww',
        weight_percent: 100,
        assessments: [
          { id: 'w1', total_points: 30 },
          { id: 'bad', total_points: undefined },
          { id: 'alsoBad', total_points: 'ten' },
        ],
      },
    ]
    const result = computeFinalGrade(
      components,
      { w1: graded(24), bad: graded(5), alsoBad: graded(5) },
      'deped_k12',
    )
    expect(result.initial).toBe(80)
    expect(result.final).toBe(87)
    expect(result.descriptor).toBe('Very Satisfactory')
  })

  it('skips a non-numeric raw_score', () => {
    const components = [
      {
        id: 'ww',
        weight_percent: 100,
        assessments: [{ id: 'w1', total_points: 30 }, { id: 'w2', total_points: 20 }],
      },
    ]
    const result = computeFinalGrade(
      components,
      { w1: graded(24), w2: graded('oops') },
      'deped_k12',
    )
    expect(result.initial).toBe(80)
    expect(result.final).toBe(87)
  })

  it('ignores a component whose weight is not a number', () => {
    const components = [
      { id: 'ww', weight_percent: 30, assessments: [{ id: 'w1', total_points: 30 }] },
      { id: 'junk', weight_percent: 'thirty', assessments: [{ id: 'j1', total_points: 10 }] },
    ]
    const result = computeFinalGrade(components, { w1: graded(24), j1: graded(0) }, 'deped_k12')
    // Only WW carries weight, so the unweighted component cannot drag the grade
    // down -- but it is still reported in the breakdown for the gradebook UI.
    expect(result.initial).toBe(80)
    expect(result.breakdown.junk).toBe(0)
  })
})

describe('computeFinalGrade — CHED modes', () => {
  const scores = { w1: graded(24), p1: graded(45) } // initial 86.25 on depedCore()

  it('ched_percentage keeps the raw weighted percent as the final grade', () => {
    const result = computeFinalGrade(depedCore(), scores, 'ched_percentage')
    expect(result.initial).toBe(86.25)
    expect(result.final).toBe(86.25)
    expect(result.descriptor).toBe('Passed')
  })

  it('ched_percentage fails below 75', () => {
    const result = computeFinalGrade(depedCore(), { w1: graded(20) }, 'ched_percentage')
    expect(result.final).toBe(66.67)
    expect(result.descriptor).toBe('Failed')
  })

  it('ched_point maps the percent onto the 1.0-5.0 scale', () => {
    const result = computeFinalGrade(depedCore(), scores, 'ched_point')
    expect(result.initial).toBe(86.25)
    expect(result.final).toBe(2.0) // 85 <= 86.25 < 88
    expect(result.descriptor).toBe('Passed')
  })

  it('ched_point fails anything worse than 3.0', () => {
    const result = computeFinalGrade(depedCore(), { w1: graded(20) }, 'ched_point')
    expect(result.final).toBe(5.0)
    expect(result.descriptor).toBe('Failed')
  })

  it('an unknown mode falls through to raw percentage', () => {
    const result = computeFinalGrade(depedCore(), scores, 'not_a_mode')
    expect(result.final).toBe(86.25)
  })
})

describe('finalAcrossPeriods', () => {
  const quarters = [
    { id: 'q1', weight_percent: 25 },
    { id: 'q2', weight_percent: 25 },
    { id: 'q3', weight_percent: 25 },
    { id: 'q4', weight_percent: 25 },
  ]
  const halves = [{ id: 'a', weight_percent: 50 }, { id: 'b', weight_percent: 50 }]

  it('averages four equally weighted quarters (backend fixture: 84.0)', () => {
    expect(finalAcrossPeriods({ q1: 80, q2: 90, q3: 85, q4: 81 }, quarters, 'deped_k12')).toBe(84)
  })

  it('averages the transmuted DepEd quarter grades to a whole number', () => {
    // (90 + 91 + 88 + 90)/4 = 89.75 -- DepEd finals are whole numbers -> 90
    const grades = { q1: 90, q2: 91, q3: 88, q4: 90 }
    expect(finalAcrossPeriods(grades, quarters, 'deped_k12')).toBe(90)
    // ...while the CHED modes keep the two decimals.
    expect(finalAcrossPeriods(grades, quarters, 'ched_percentage')).toBe(89.75)
  })

  it('rounds a .5 DepEd average up', () => {
    // (84 + 85)/2 = 84.5 -> 85
    expect(finalAcrossPeriods({ a: 84, b: 85 }, halves, 'deped_k12')).toBe(85)
  })

  it('re-normalizes over the quarters that have a grade', () => {
    // (25*80 + 25*90)/50 = 85.0 -- Q3/Q4 not yet graded
    expect(
      finalAcrossPeriods({ q1: 80, q2: 90, q3: null, q4: undefined }, quarters, 'deped_k12'),
    ).toBe(85)
  })

  it('honours uneven period weights', () => {
    // Prelim 30 @ 75, Midterm 30 @ 80, Finals 40 @ 90
    // = (2250 + 2400 + 3600)/100 = 82.5
    const terms = [
      { id: 'pre', weight_percent: 30 },
      { id: 'mid', weight_percent: 30 },
      { id: 'fin', weight_percent: 40 },
    ]
    const grades = { pre: 75, mid: 80, fin: 90 }
    expect(finalAcrossPeriods(grades, terms, 'ched_percentage')).toBe(82.5)
    expect(finalAcrossPeriods(grades, terms, 'deped_k12')).toBe(83)
  })

  it('counts a zero quarter grade instead of treating it as no data', () => {
    expect(finalAcrossPeriods({ a: 0, b: 80 }, halves, 'ched_percentage')).toBe(40)
  })

  it('averages ched_point grades on the point scale', () => {
    expect(finalAcrossPeriods({ a: 1.5, b: 2.0 }, halves, 'ched_point')).toBe(1.75)
  })

  it('coerces numeric strings in grades and weights', () => {
    const mixed = [{ id: 'a', weight_percent: 50 }, { id: 'b', weight_percent: '50' }]
    expect(finalAcrossPeriods({ a: '80', b: 90 }, mixed, 'ched_percentage')).toBe(85)
  })

  it('skips a period whose grade or weight is unusable', () => {
    const mixed = [
      { id: 'a', weight_percent: 50 },
      { id: 'badGrade', weight_percent: 50 },
      { id: 'badWeight', weight_percent: 'fifty' },
    ]
    expect(
      finalAcrossPeriods({ a: 90, badGrade: 'n/a', badWeight: 10 }, mixed, 'ched_percentage'),
    ).toBe(90)
  })

  it('returns null when no period has a grade', () => {
    expect(finalAcrossPeriods({}, quarters, 'deped_k12')).toBeNull()
    expect(finalAcrossPeriods({ q1: null }, quarters, 'deped_k12')).toBeNull()
  })

  it('returns null for missing arguments rather than throwing', () => {
    expect(finalAcrossPeriods(undefined, undefined)).toBeNull()
    expect(finalAcrossPeriods(null, [])).toBeNull()
  })

  it('defaults to the DepEd whole-number rounding', () => {
    expect(finalAcrossPeriods({ a: 90, b: 91 }, halves)).toBe(91)
  })
})

describe('DepEd preset', () => {
  it('ships weights that sum to 100 so grading setup can be saved', () => {
    expect(weightsValid(DEPED_COMPONENT_PRESET)).toBe(true)
    expect(DEPED_COMPONENT_PRESET.map((c) => c.weight_percent)).toEqual([30, 50, 20])
  })
})

describe('weightsValid', () => {
  it('rejects negative weights even when the sum still reaches 100', () => {
    // Pilot feedback: 120 + (-20) = 100 was accepted.
    expect(weightsValid([{ weight_percent: 120 }, { weight_percent: -20 }])).toBe(false)
  })
  it('rejects zero weights', () => {
    expect(weightsValid([{ weight_percent: 0 }, { weight_percent: 100 }])).toBe(false)
  })
  it('keeps the floating-point tolerance on the sum', () => {
    expect(weightsValid([
      { weight_percent: 20.5 }, { weight_percent: 20.5 }, { weight_percent: 59 },
    ])).toBe(true)
  })
})
