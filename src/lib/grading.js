/**
 * Pure grade computation — Firestore-primary architecture computes grades
 * client-side in real time (PREPARE.md §1.6/§1.7), then saves the results to
 * the 'gradebooks' collection. No I/O here; keep it unit-testable.
 *
 * Semantics ported from the old backend GradeService:
 * - graded:  earned += raw_score, possible += total_points
 * - missing: possible += total_points (missing work scores zero)
 * - excused / no score yet: excluded from both sides
 * - Period grade re-normalizes over components that have data, so an
 *   ungraded component neither drags down nor inflates the grade.
 *
 * Grading modes (PREPARE.md §1.7 Grading Type Selector):
 * - 'deped_k12':     weighted percentage → DepEd Order No. 8 s. 2015 transmutation
 * - 'ched_percentage': raw weighted percentage, no transmutation
 * - 'ched_point':    percentage mapped to the 1.0–5.0 collegiate point scale
 */

export const GRADING_MODES = [
  { value: 'deped_k12', label: 'DepEd K-12 (weights + transmutation)' },
  { value: 'ched_percentage', label: 'CHED Tertiary — raw percentage' },
  { value: 'ched_point', label: 'CHED Tertiary — point scale (1.0–5.0)' },
]

// DepEd K-12 preset (DepEd Order No. 8, s. 2015 — core subjects).
export const DEPED_COMPONENT_PRESET = [
  { name: 'Written Works', weight_percent: 30 },
  { name: 'Performance Tasks', weight_percent: 50 },
  { name: 'Quarterly Assessments', weight_percent: 20 },
]

// One-click grading-setup presets (periods + components, each summing to 100%).
export const GRADING_PRESETS = [
  {
    key: 'deped_k12',
    label: 'DepEd K-12 — 4 Quarters',
    periods: [
      { name: 'Quarter 1', weight_percent: 25 },
      { name: 'Quarter 2', weight_percent: 25 },
      { name: 'Quarter 3', weight_percent: 25 },
      { name: 'Quarter 4', weight_percent: 25 },
    ],
    components: DEPED_COMPONENT_PRESET,
  },
  {
    key: 'college_terms',
    label: 'College — Prelim / Midterm / Finals',
    periods: [
      { name: 'Prelim', weight_percent: 30 },
      { name: 'Midterm', weight_percent: 30 },
      { name: 'Finals', weight_percent: 40 },
    ],
    components: [
      { name: 'Class Standing', weight_percent: 60 },
      { name: 'Major Exam', weight_percent: 40 },
    ],
  },
]

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Percent earned for one student in one component, or null if no data.
 *
 * An assessment whose total_points is missing or non-numeric is skipped rather
 * than added, which would poison the sum with NaN. NaN survived every guard
 * downstream -- `NaN != null` is true, and transmuteDepEd's bands all compare
 * false -- so one malformed assessment used to hand every student a saved
 * final grade of 60 / "Did Not Meet Expectations". Skipping matches the
 * existing "no score yet" semantics: excluded from both sides.
 */
export function componentPercent(assessments, studentScores) {
  let earned = 0
  let possible = 0
  for (const assessment of assessments ?? []) {
    const score = studentScores?.[assessment.id]
    if (!score || score.status === 'excused') continue
    const points = Number(assessment.total_points)
    if (!Number.isFinite(points)) continue
    if (score.status === 'missing') {
      possible += points
    } else if (score.status === 'graded' && score.raw_score != null) {
      const raw = Number(score.raw_score)
      if (!Number.isFinite(raw)) continue
      possible += points
      earned += raw
    }
  }
  if (possible === 0) return null
  return (earned / possible) * 100
}

/** Weighted period grade (pre-transmutation "Initial Grade"), or null. */
export function periodGrade(components, studentScores) {
  let weighted = 0
  let weightTotal = 0
  const breakdown = {}
  for (const component of components ?? []) {
    const pct = componentPercent(component.assessments, studentScores)
    const usable = pct != null && Number.isFinite(pct)
    breakdown[component.id] = usable ? round2(pct) : null
    const weight = Number(component.weight_percent)
    if (usable && Number.isFinite(weight)) {
      weighted += weight * pct
      weightTotal += weight
    }
  }
  if (weightTotal === 0) return { grade: null, breakdown }
  return { grade: round2(weighted / weightTotal), breakdown }
}

/**
 * DepEd Order No. 8, s. 2015 transmutation table: Initial Grade → Transmuted
 * Grade (60 = floor, 100 = ceiling). Table 1 of the order, expressed as the
 * lower bound of each initial-grade band.
 */
const DEPED_TRANSMUTATION_BANDS = [
  [100, 100], [98.4, 99], [96.8, 98], [95.2, 97], [93.6, 96],
  [92.0, 95], [90.4, 94], [88.8, 93], [87.2, 92], [85.6, 91],
  [84.0, 90], [82.4, 89], [80.8, 88], [79.2, 87], [77.6, 86],
  [76.0, 85], [74.4, 84], [72.8, 83], [71.2, 82], [69.6, 81],
  [68.0, 80], [66.4, 79], [64.8, 78], [63.2, 77], [61.6, 76],
  [60.0, 75], [56.0, 74], [52.0, 73], [48.0, 72], [44.0, 71],
  [40.0, 70], [36.0, 69], [32.0, 68], [28.0, 67], [24.0, 66],
  [20.0, 65], [16.0, 64], [12.0, 63], [8.0, 62], [4.0, 61],
  [0.0, 60],
]

/** Initial grade (0–100) → DepEd transmuted grade (60–100). */
export function transmuteDepEd(initialGrade) {
  const value = Number(initialGrade)
  // Without the finite check a NaN falls past every band to the 60 floor,
  // which reads as a real failing grade rather than as missing data.
  if (initialGrade == null || !Number.isFinite(value)) return null
  for (const [lowerBound, transmuted] of DEPED_TRANSMUTATION_BANDS) {
    if (value >= lowerBound) return transmuted
  }
  return 60
}

/** DepEd descriptor for a transmuted grade (DepEd Order No. 8 s. 2015). */
export function depEdDescriptor(transmutedGrade) {
  if (transmutedGrade == null) return null
  if (transmutedGrade >= 90) return 'Outstanding'
  if (transmutedGrade >= 85) return 'Very Satisfactory'
  if (transmutedGrade >= 80) return 'Satisfactory'
  if (transmutedGrade >= 75) return 'Fairly Satisfactory'
  return 'Did Not Meet Expectations'
}

/** Percentage → CHED collegiate point scale (1.0 highest … 5.0 failed). */
export function chedPointEquivalent(percent) {
  if (percent == null || !Number.isFinite(Number(percent))) return null
  if (percent >= 96) return 1.0
  if (percent >= 94) return 1.25
  if (percent >= 91) return 1.5
  if (percent >= 88) return 1.75
  if (percent >= 85) return 2.0
  if (percent >= 82) return 2.25
  if (percent >= 79) return 2.5
  if (percent >= 76) return 2.75
  if (percent >= 75) return 3.0
  return 5.0
}

/**
 * Full pipeline for one student: components + scores + mode → final grade.
 * Returns { initial, final, descriptor, breakdown }.
 */
export function computeFinalGrade(components, studentScores, mode = 'deped_k12') {
  const { grade: initial, breakdown } = periodGrade(components, studentScores)
  if (initial == null || !Number.isFinite(initial)) {
    return { initial: null, final: null, descriptor: null, breakdown }
  }
  if (mode === 'deped_k12') {
    const final = transmuteDepEd(initial)
    return { initial, final, descriptor: final == null ? null : depEdDescriptor(final), breakdown }
  }
  if (mode === 'ched_point') {
    const final = chedPointEquivalent(initial)
    if (final == null) return { initial, final: null, descriptor: null, breakdown }
    return { initial, final, descriptor: final <= 3.0 ? 'Passed' : 'Failed', breakdown }
  }
  // ched_percentage: the weighted percent is the final grade.
  return { initial, final: initial, descriptor: initial >= 75 ? 'Passed' : 'Failed', breakdown }
}

/**
 * Weights must sum to 100 before settings can be saved (§1.7).
 *
 * Tolerance, not equality: 20.5 + 20.5 + 59 is 99.99999999999999 in floating
 * point, so `=== 100` rejected weight sets that are correct. The 0.01 window
 * matches the `balanced()` check routes/teacher/grading.jsx already uses.
 */
export function weightsValid(components) {
  const sum = (components ?? []).reduce((total, c) => total + (Number(c.weight_percent) || 0), 0)
  return Math.abs(sum - 100) < 0.01
}

/**
 * Final grade across grading periods: each period's grade weighted by its
 * weight_percent, over periods that have a grade. DepEd finals are whole
 * numbers; CHED modes keep two decimals.
 */
export function finalAcrossPeriods(periodGrades, periods, mode = 'deped_k12') {
  let weighted = 0
  let weightTotal = 0
  for (const p of periods ?? []) {
    const raw = periodGrades?.[p.id]
    const g = Number(raw)
    const weight = Number(p.weight_percent)
    if (raw != null && Number.isFinite(g) && Number.isFinite(weight)) {
      weighted += weight * g
      weightTotal += weight
    }
  }
  if (weightTotal === 0) return null
  const avg = weighted / weightTotal
  return mode === 'deped_k12' ? Math.round(avg) : round2(avg)
}
