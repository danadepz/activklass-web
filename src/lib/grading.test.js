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
  chedPointEquivalent,
  computeFinalGrade,
  finalAcrossPeriods,
  gradePolicy,
  isPassingGrade,
  pointScaleBands,
  rebalanceWeights,
  redistributeWeights,
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

const rows = (...weights) => weights.map((w, i) => ({ id: `r${i}`, name: `Row ${i}`, weight_percent: String(w) }))
const total = (rs) => rs.reduce((s, r) => s + (Number(r.weight_percent) || 0), 0)

describe('rebalanceWeights', () => {
  it('rescales the other rows in proportion and keeps the total at exactly 100', () => {
    const next = rebalanceWeights(rows(30, 50, 20), 0, '40')
    expect(next[0].weight_percent).toBe('40')
    // 50:20 ratio over the remaining 60 → 43 : 17 (0.5-grid).
    expect(Number(next[1].weight_percent)).toBeCloseTo(43, 1)
    expect(Number(next[2].weight_percent)).toBeCloseTo(17, 1)
    expect(total(next)).toBe(100)
  })
  it('two rows behave as complements', () => {
    const next = rebalanceWeights(rows(60, 40), 1, '25')
    expect(next[0].weight_percent).toBe('75')
    expect(total(next)).toBe(100)
  })
  it('splits equally when every other row sits at zero', () => {
    const next = rebalanceWeights(rows(0, 0, 0), 0, '40')
    expect(next[1].weight_percent).toBe('30')
    expect(next[2].weight_percent).toBe('30')
  })
  it('pinning a row at 100 zeroes the rest', () => {
    const next = rebalanceWeights(rows(30, 50, 20), 1, '100')
    expect(next[0].weight_percent).toBe('0')
    expect(next[2].weight_percent).toBe('0')
    expect(total(next)).toBe(100)
  })
  it('keeps the raw string in the edited cell so decimals stay typeable', () => {
    const next = rebalanceWeights(rows(30, 50, 20), 0, '30.')
    expect(next[0].weight_percent).toBe('30.')
    expect(total(next)).toBe(100)
  })
  it('never sends a row negative when rounding overshoots', () => {
    const next = rebalanceWeights(rows(25, 25, 25, 25, 25), 0, '99')
    expect(next.every((r) => Number(r.weight_percent) >= 0)).toBe(true)
    expect(total(next)).toBe(100)
  })
  it('a single row keeps whatever was typed', () => {
    expect(rebalanceWeights(rows(100), 0, '70')[0].weight_percent).toBe('70')
  })
})

describe('redistributeWeights', () => {
  it('hands a removed row weight back to the survivors, keeping 100', () => {
    const next = redistributeWeights(rows(50, 20).map((r) => ({ ...r })))
    // 50:20 ratio scaled to 100 → 71.5 : 28.5 on the 0.5 grid.
    expect(total(next)).toBe(100)
    expect(Number(next[0].weight_percent)).toBeGreaterThan(Number(next[1].weight_percent))
  })
  it('splits 100 equally across all-zero rows', () => {
    const next = redistributeWeights(rows(0, 0))
    expect(next.map((r) => r.weight_percent)).toEqual(['50', '50'])
  })
})

// ---------------------------------------------------------------------------
// T-45: a teacher-set pass mark and a point scale that can run either way.
// The last block is the one that matters: a gradebook written before the
// fields existed must compute exactly what it computed before.
// ---------------------------------------------------------------------------

describe('gradePolicy — the pass mark and scale direction, with defaults', () => {
  it('fills 75 and 1.0-is-highest when the fields are absent or unusable', () => {
    for (const source of [
      undefined,
      null,
      {},
      { passing_percent: 'x', point_scale_direction: 'sideways' },
      { passing_percent: 0 },
      { passing_percent: 100 },
      { passing_percent: -5, point_scale_direction: null },
    ]) {
      expect(gradePolicy(source)).toEqual({ passing_percent: 75, point_scale_direction: 'ched' })
    }
  })

  it('keeps a stored pass mark and direction, coercing a numeric string', () => {
    expect(gradePolicy({ passing_percent: 60, point_scale_direction: 'inverted' })).toEqual({
      passing_percent: 60,
      point_scale_direction: 'inverted',
    })
    expect(gradePolicy({ passing_percent: '60' }).passing_percent).toBe(60)
  })
})

describe('chedPointEquivalent — the ladder every existing gradebook has used', () => {
  const LADDER = [
    [100, 1.0], [96, 1.0], [95.99, 1.25], [94, 1.25], [91, 1.5], [88, 1.75], [85, 2.0],
    [82, 2.25], [79, 2.5], [76, 2.75], [75, 3.0], [74.99, 5.0], [0, 5.0],
  ]

  it('is unchanged with no policy, an empty one, or the defaults spelled out', () => {
    for (const [pct, point] of LADDER) {
      expect(chedPointEquivalent(pct)).toBe(point)
      expect(chedPointEquivalent(pct, {})).toBe(point)
      expect(chedPointEquivalent(pct, { passing_percent: 75, point_scale_direction: 'ched' })).toBe(point)
    }
  })

  it('returns null without a usable percent', () => {
    expect(chedPointEquivalent(null)).toBeNull()
    expect(chedPointEquivalent(NaN)).toBeNull()
    expect(chedPointEquivalent('x', { point_scale_direction: 'inverted' })).toBeNull()
  })

  it('mirrors the scale around 3.0 when 5.0 is highest', () => {
    const inverted = { point_scale_direction: 'inverted' }
    expect(chedPointEquivalent(96, inverted)).toBe(5.0)
    expect(chedPointEquivalent(94, inverted)).toBe(4.75)
    expect(chedPointEquivalent(85, inverted)).toBe(4.0)
    expect(chedPointEquivalent(76, inverted)).toBe(3.25)
    expect(chedPointEquivalent(75, inverted)).toBe(3.0)
    expect(chedPointEquivalent(74.99, inverted)).toBe(1.0)
  })

  it('stretches the passing band in proportion over a lower pass mark', () => {
    // At 60 the bounds become 60 / 61.6 / 66.4 / 71.2 / 76 / 80.8 / 85.6 / 90.4 / 93.6.
    const at60 = { passing_percent: 60 }
    expect(chedPointEquivalent(60, at60)).toBe(3.0)
    expect(chedPointEquivalent(59.99, at60)).toBe(5.0)
    expect(chedPointEquivalent(66.4, at60)).toBe(2.5)
    expect(chedPointEquivalent(76, at60)).toBe(2.0)
    expect(chedPointEquivalent(93.59, at60)).toBe(1.25)
    expect(chedPointEquivalent(93.6, at60)).toBe(1.0)
  })
})

describe('pointScaleBands — the table Grade Config shows', () => {
  it('is contiguous, best grade first, and ends with the failing band at the pass mark', () => {
    for (const policy of [undefined, { passing_percent: 60 }, { passing_percent: 60, point_scale_direction: 'inverted' }]) {
      const bands = pointScaleBands(policy)
      expect(bands).toHaveLength(10)
      expect(bands[0].to).toBeNull()
      for (let i = 1; i < bands.length; i++) expect(bands[i].to).toBe(bands[i - 1].from)
      expect(bands[bands.length - 1].from).toBe(0)
      expect(bands[bands.length - 1].to).toBe(gradePolicy(policy).passing_percent)
      // Every band's lower bound maps back to its own grade, so the table and
      // the computation cannot disagree.
      for (const b of bands) expect(chedPointEquivalent(b.from, policy)).toBe(b.point)
    }
  })

  it('lists 1.0 first the standard way and 5.0 first inverted', () => {
    expect(pointScaleBands().map((b) => b.point)).toEqual([1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 5.0])
    expect(pointScaleBands({ point_scale_direction: 'inverted' }).map((b) => b.point)).toEqual([
      5.0, 4.75, 4.5, 4.25, 4.0, 3.75, 3.5, 3.25, 3.0, 1.0,
    ])
  })
})

describe('isPassingGrade — the one Passed / Failed test', () => {
  it('reads the direction on the point scale; 3.0 passes both ways', () => {
    expect(isPassingGrade(3.0, 'ched_point')).toBe(true)
    expect(isPassingGrade(3.25, 'ched_point')).toBe(false)
    expect(isPassingGrade(1.0, 'ched_point')).toBe(true)
    const inverted = { point_scale_direction: 'inverted' }
    expect(isPassingGrade(3.0, 'ched_point', inverted)).toBe(true)
    expect(isPassingGrade(2.75, 'ched_point', inverted)).toBe(false)
    expect(isPassingGrade(5.0, 'ched_point', inverted)).toBe(true)
    expect(isPassingGrade(1.0, 'ched_point', inverted)).toBe(false)
  })

  it('reads the pass mark on percentages, and DepEd stays at 75 whatever is stored', () => {
    expect(isPassingGrade(75, 'ched_percentage')).toBe(true)
    expect(isPassingGrade(74.99, 'ched_percentage')).toBe(false)
    expect(isPassingGrade(60, 'ched_percentage', { passing_percent: 60 })).toBe(true)
    expect(isPassingGrade(59.99, 'ched_percentage', { passing_percent: 60 })).toBe(false)
    expect(isPassingGrade(74, 'deped_k12', { passing_percent: 60 })).toBe(false)
    expect(isPassingGrade(75, 'deped_k12', { passing_percent: 60 })).toBe(true)
  })

  it('is null without a grade', () => {
    expect(isPassingGrade(null, 'ched_point')).toBeNull()
    expect(isPassingGrade('x', 'ched_percentage')).toBeNull()
  })
})

describe('computeFinalGrade — a gradebook without the new fields computes exactly as before', () => {
  // Five score sets across all three modes; the expected values are the
  // hand-computed ones already pinned above, and the policy-less call must
  // equal the empty-policy and the spelled-out-defaults calls, field for field.
  const scoreSets = [
    { w1: graded(24), p1: graded(45), q1: graded(40) }, // initial 85
    { w1: graded(24), p1: graded(45) }, // initial 86.25
    { w1: graded(20) }, // initial 66.67
    { w1: missing }, // initial 0
    {}, // nothing recorded
  ]
  const expectedFinal = {
    deped_k12: [90, 91, 79, 60, null],
    ched_percentage: [85, 86.25, 66.67, 0, null],
    ched_point: [2.0, 2.0, 5.0, 5.0, null],
  }
  const expectedDescriptor = {
    deped_k12: ['Outstanding', 'Outstanding', 'Fairly Satisfactory', 'Did Not Meet Expectations', null],
    ched_percentage: ['Passed', 'Passed', 'Failed', 'Failed', null],
    ched_point: ['Passed', 'Passed', 'Failed', 'Failed', null],
  }

  for (const mode of ['deped_k12', 'ched_percentage', 'ched_point']) {
    it(`${mode}: no policy, an empty policy and the defaults all give the pre-T-45 result`, () => {
      scoreSets.forEach((scores, i) => {
        const bare = computeFinalGrade(depedCore(), scores, mode)
        expect(bare.final).toBe(expectedFinal[mode][i])
        expect(bare.descriptor).toBe(expectedDescriptor[mode][i])
        expect(computeFinalGrade(depedCore(), scores, mode, {})).toEqual(bare)
        expect(
          computeFinalGrade(depedCore(), scores, mode, { passing_percent: 75, point_scale_direction: 'ched' }),
        ).toEqual(bare)
      })
    })
  }

  it('honours the direction and the pass mark in the CHED modes', () => {
    const scores = { w1: graded(24), p1: graded(45) } // initial 86.25
    const low = { w1: graded(20) } // initial 66.67
    const inverted = computeFinalGrade(depedCore(), scores, 'ched_point', { point_scale_direction: 'inverted' })
    expect(inverted).toMatchObject({ initial: 86.25, final: 4.0, descriptor: 'Passed' })
    const invertedLow = computeFinalGrade(depedCore(), low, 'ched_point', { point_scale_direction: 'inverted' })
    expect(invertedLow).toMatchObject({ final: 1.0, descriptor: 'Failed' })
    // At a 60 pass mark 66.67 sits in the 66.4 band: 2.5 standard, 3.5 inverted, a pass either way.
    expect(computeFinalGrade(depedCore(), low, 'ched_point', { passing_percent: 60 })).toMatchObject({ final: 2.5, descriptor: 'Passed' })
    expect(
      computeFinalGrade(depedCore(), low, 'ched_point', { passing_percent: 60, point_scale_direction: 'inverted' }),
    ).toMatchObject({ final: 3.5, descriptor: 'Passed' })
    expect(computeFinalGrade(depedCore(), low, 'ched_percentage', { passing_percent: 60 })).toMatchObject({ final: 66.67, descriptor: 'Passed' })
  })

  it('DepEd K-12 ignores the policy entirely', () => {
    const policy = { passing_percent: 60, point_scale_direction: 'inverted' }
    expect(computeFinalGrade(depedCore(), { w1: graded(20) }, 'deped_k12', policy)).toEqual(
      computeFinalGrade(depedCore(), { w1: graded(20) }, 'deped_k12'),
    )
  })
})
