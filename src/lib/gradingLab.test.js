/**
 * Laboratory grading: the reference example from
 * Grading_Configuration_Analysis_Reference_and_Ours.pdf §2, plus the states
 * around it that decide whether a number lands on a report card.
 *
 * The reference says lecture counts twice and laboratory once, so the share
 * asserted at full precision is 100/3 exactly. DEFAULT_LAB_WEIGHT is that same
 * value; a teacher who types "33.33" into the box instead lands 0.0002 away,
 * which is below what any screen displays -- there is a test for that too.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LAB_WEIGHT,
  GRADING_PRESETS,
  LAB,
  LECTURE,
  LECTURE_LAB,
  componentTrack,
  computeFinalGrade,
  finalAcrossPeriods,
  gradePolicy,
  hasLab,
  incompleteTracks,
  labWeightError,
  periodGrade,
  transmuteDepEd,
} from './grading.js'

/* One component carrying one assessment marked out of `outOf`, so a raw score
   is normalised to a percent the way the record does it. */
const comp = (id, weight, track, score, outOf = 100) => ({
  id,
  name: id,
  weight_percent: weight,
  track,
  assessments: score == null ? [] : [{ id: `${id}-a`, total_points: outOf }],
})

const scoreMap = (...pairs) =>
  Object.fromEntries(pairs.map(([id, raw]) => [`${id}-a`, { status: 'graded', raw_score: raw }]))

const LAB_POLICY = { grading_structure: LECTURE_LAB, lab_weight_percent: 100 / 3 }

/* The reference's lecture result is given as a finished number (82.40 / 78.80),
   not as components -- so model it as one lecture component scored at it. */
const referencePeriod = (lecture, exercise, exam) => ({
  components: [
    comp('lec', 100, LECTURE, lecture),
    comp('ex', 70, LAB, exercise),
    comp('labexam', 30, LAB, exam),
  ],
  scores: scoreMap(['lec', lecture], ['ex', exercise], ['labexam', exam]),
})

describe('reference example (PDF section 2)', () => {
  const midterm = referencePeriod(82.4, 90, 88)
  const finals = referencePeriod(78.8, 85, 83)

  it('computes the midterm laboratory result at 70/30', () => {
    const { tracks } = periodGrade(midterm.components, midterm.scores, LAB_POLICY)
    expect(tracks.lecture).toBe(82.4)
    expect(tracks.lab).toBe(89.4) // 90 x 0.70 + 88 x 0.30
  })

  it('computes the finals laboratory result at 70/30', () => {
    const { tracks } = periodGrade(finals.components, finals.scores, LAB_POLICY)
    expect(tracks.lecture).toBe(78.8)
    expect(tracks.lab).toBe(84.4) // 85 x 0.70 + 83 x 0.30
  })

  it('combines lecture twice, laboratory once, at full precision', () => {
    const m = periodGrade(midterm.components, midterm.scores, LAB_POLICY)
    const f = periodGrade(finals.components, finals.scores, LAB_POLICY)
    // (82.40 x 2 + 89.40) / 3 and (78.80 x 2 + 84.40) / 3
    expect(m.tracks.combined_raw).toBeCloseTo((82.4 * 2 + 89.4) / 3, 10)
    expect(f.tracks.combined_raw).toBeCloseTo((78.8 * 2 + 84.4) / 3, 10)
    expect(m.tracks.combined_raw).toBeCloseTo(84.733333, 5)
    expect(f.tracks.combined_raw).toBeCloseTo(80.666666, 5)
  })

  it('displays the combined period grades as 84.73 and 80.67', () => {
    expect(periodGrade(midterm.components, midterm.scores, LAB_POLICY).grade).toBe(84.73)
    expect(periodGrade(finals.components, finals.scores, LAB_POLICY).grade).toBe(80.67)
  })

  it('reaches an overall 82.70 over equally weighted periods', () => {
    const policy = { ...LAB_POLICY, passing_percent: 75 }
    const m = computeFinalGrade(midterm.components, midterm.scores, 'ched_percentage', policy)
    const f = computeFinalGrade(finals.components, finals.scores, 'ched_percentage', policy)
    const periods = [
      { id: 'mid', weight_percent: 50 },
      { id: 'fin', weight_percent: 50 },
    ]
    expect(finalAcrossPeriods({ mid: m.final, fin: f.final }, periods, 'ched_percentage')).toBe(82.7)
  })

  it('still displays 84.73 when the share is typed as 33.33 rather than 100/3', () => {
    const typed = { grading_structure: LECTURE_LAB, lab_weight_percent: 33.33 }
    expect(periodGrade(midterm.components, midterm.scores, typed).grade).toBe(84.73)
  })

  it('normalises raw scores by each assessment perfect score', () => {
    // 45/50 is 90%, not 45 -- same laboratory result as the reference.
    const components = [comp('ex', 70, LAB, 45, 50), comp('labexam', 30, LAB, 88)]
    const scores = scoreMap(['ex', 45], ['labexam', 88])
    expect(periodGrade(components, scores, LAB_POLICY).tracks.lab).toBe(89.4)
  })
})

describe('configuration', () => {
  it('treats a component with no track as lecture, so old gradebooks are unchanged', () => {
    expect(componentTrack({ name: 'Lab Exam' })).toBe(LECTURE)
    expect(componentTrack({ name: 'Anything', track: LAB })).toBe(LAB)
  })

  it('defaults an unconfigured gradebook to lecture only', () => {
    const p = gradePolicy({})
    expect(p.grading_structure).toBe('lecture_only')
    expect(p.lab_weight_percent).toBe(DEFAULT_LAB_WEIGHT)
    expect(hasLab({})).toBe(false)
    expect(hasLab({ grading_structure: LECTURE_LAB })).toBe(true)
  })

  it('ignores an out-of-range laboratory share rather than grading with it', () => {
    expect(gradePolicy({ lab_weight_percent: 0 }).lab_weight_percent).toBe(DEFAULT_LAB_WEIGHT)
    expect(gradePolicy({ lab_weight_percent: 100 }).lab_weight_percent).toBe(DEFAULT_LAB_WEIGHT)
    expect(gradePolicy({ lab_weight_percent: 'x' }).lab_weight_percent).toBe(DEFAULT_LAB_WEIGHT)
    expect(gradePolicy({ lab_weight_percent: 40 }).lab_weight_percent).toBe(40)
  })

  it('rejects a laboratory share that switches a track off', () => {
    expect(labWeightError('')).toBeTruthy()
    expect(labWeightError(0)).toBeTruthy()
    expect(labWeightError(100)).toBeTruthy()
    expect(labWeightError('abc')).toBeTruthy()
    expect(labWeightError(40)).toBeNull()
  })

  it('honours a custom lecture-to-laboratory ratio', () => {
    const components = [comp('lec', 100, LECTURE, 80), comp('ex', 100, LAB, 90)]
    const scores = scoreMap(['lec', 80], ['ex', 90])
    const half = periodGrade(components, scores, { grading_structure: LECTURE_LAB, lab_weight_percent: 50 })
    expect(half.grade).toBe(85)
    const quarter = periodGrade(components, scores, { grading_structure: LECTURE_LAB, lab_weight_percent: 25 })
    expect(quarter.grade).toBe(82.5)
  })
})

describe('missing and partial scores', () => {
  const components = [
    comp('lec', 100, LECTURE, 80),
    comp('ex', 70, LAB, 90),
    comp('labexam', 30, LAB, null),
  ]

  it('never reads an ungraded laboratory as a zero', () => {
    const scores = scoreMap(['lec', 80])
    const { grade, tracks } = periodGrade(components, scores, LAB_POLICY)
    expect(tracks.lab).toBeNull()
    expect(tracks.lab_status).toBe('ungraded')
    // The lecture result stands alone; a zero laboratory would give 53.33.
    expect(grade).toBe(80)
    expect(incompleteTracks(tracks)).toEqual([LAB])
  })

  it('flags a half-graded laboratory and re-weights within it', () => {
    const scores = scoreMap(['lec', 80], ['ex', 90])
    const { grade, tracks } = periodGrade(components, scores, LAB_POLICY)
    expect(tracks.lab).toBe(90) // Lab Exam carries no data: Lab Exercise re-weighted
    expect(tracks.lab_status).toBe('partial')
    expect(grade).toBe(83.33)
    expect(incompleteTracks(tracks)).toEqual([LAB])
  })

  it('reports a laboratory that was never configured apart from one never graded', () => {
    const lectureOnlyRows = [comp('lec', 100, LECTURE, 80)]
    const { tracks } = periodGrade(lectureOnlyRows, scoreMap(['lec', 80]), LAB_POLICY)
    expect(tracks.lab_status).toBe('no_components')
    expect(incompleteTracks(tracks)).toEqual([])
  })

  it('returns no grade at all when neither track has data', () => {
    const { grade, tracks } = periodGrade(components, {}, LAB_POLICY)
    expect(grade).toBeNull()
    expect(tracks.combined_raw).toBeNull()
  })
})

describe('official conversion runs once on the combined result', () => {
  const components = [
    comp('lec', 100, LECTURE, 82.4),
    comp('ex', 70, LAB, 90),
    comp('labexam', 30, LAB, 88),
  ]
  const scores = scoreMap(['lec', 82.4], ['ex', 90], ['labexam', 88])

  it('transmutes the combined 84.73 under DepEd, not each track', () => {
    const r = computeFinalGrade(components, scores, 'deped_k12', LAB_POLICY)
    expect(r.initial).toBe(84.73)
    expect(r.final).toBe(87) // the 84.16 band
    expect(r.descriptor).toBe('Very Satisfactory')
  })

  it('leaves the combined percent alone under CHED raw percentage', () => {
    const r = computeFinalGrade(components, scores, 'ched_percentage', LAB_POLICY)
    expect(r.final).toBe(84.73)
    expect(r.descriptor).toBe('Passed')
  })

  it('maps the combined percent onto the CHED point scale', () => {
    const r = computeFinalGrade(components, scores, 'ched_point', LAB_POLICY)
    expect(r.initial).toBe(84.73)
    expect(r.final).toBe(2.25) // 84.73 misses the "85 and above" band by 0.27
  })

  it('is deterministic and idempotent', () => {
    const once = computeFinalGrade(components, scores, 'deped_k12', LAB_POLICY)
    const twice = computeFinalGrade(components, scores, 'deped_k12', LAB_POLICY)
    expect(twice).toEqual(once)
  })
})

describe('lecture-only classes are untouched', () => {
  const components = [
    { id: 'ww', weight_percent: 30, assessments: [{ id: 'a1', total_points: 100 }] },
    { id: 'pt', weight_percent: 50, assessments: [{ id: 'a2', total_points: 100 }] },
    { id: 'qa', weight_percent: 20, assessments: [{ id: 'a3', total_points: 100 }] },
  ]
  const scores = {
    a1: { status: 'graded', raw_score: 88 },
    a2: { status: 'graded', raw_score: 92 },
    a3: { status: 'graded', raw_score: 80 },
  }

  it('computes the same grade with no policy, an empty policy, and lecture_only', () => {
    const bare = periodGrade(components, scores)
    expect(bare.grade).toBe(88.4)
    expect(bare.tracks).toBeNull()
    expect(periodGrade(components, scores, {}).grade).toBe(88.4)
    expect(periodGrade(components, scores, { grading_structure: 'lecture_only' }).grade).toBe(88.4)
  })

  it('ignores a stray lab_weight_percent while the structure is lecture only', () => {
    expect(periodGrade(components, scores, { lab_weight_percent: 50 }).grade).toBe(88.4)
  })

  it('still ignores a track field a component happens to carry', () => {
    const tagged = components.map((c) => ({ ...c, track: LAB }))
    expect(periodGrade(tagged, scores).grade).toBe(88.4)
  })
})

describe('DepEd policy presets (Phase 2 section 6)', () => {
  it('keeps the DO 8 s. 2015 preset as the unchanged default structure', () => {
    const legacy = GRADING_PRESETS.find((p) => p.key === 'deped_k12')
    expect(legacy.periods).toHaveLength(4)
    expect(legacy.components.map((c) => c.weight_percent)).toEqual([30, 50, 20])
    // No "unverified" note: this one's basis is settled.
    expect(legacy.note).toBeUndefined()
  })

  it('offers the reported DO 015 s. 2026 structure as a separate, opt-in preset', () => {
    const do015 = GRADING_PRESETS.find((p) => p.key === 'deped_k12_do015')
    expect(do015).toBeTruthy()
    expect(do015.periods).toHaveLength(3)
    expect(do015.components.map((c) => c.weight_percent)).toEqual([20, 50, 30])
    expect(do015.periods.reduce((s, p) => s + p.weight_percent, 0)).toBeCloseTo(100, 10)
  })

  it('marks the DO 015 preset as unconfirmed rather than presenting it as settled', () => {
    const do015 = GRADING_PRESETS.find((p) => p.key === 'deped_k12_do015')
    expect(do015.note).toMatch(/confirm/i)
  })

  it('leaves the shipped transmutation table alone — it is separately sourced', () => {
    // The table came from the owner's copy of the official Table 4 and is
    // corroborated at the pass line; the weights above were not, which is why
    // only the weights were made opt-in.
    expect(transmuteDepEd(70)).toBe(75)
    expect(transmuteDepEd(69.99)).toBe(74)
    expect(transmuteDepEd(100)).toBe(100)
    expect(transmuteDepEd(0)).toBe(60)
  })
})
