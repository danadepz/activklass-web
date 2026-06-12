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

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Percent earned for one student in one component, or null if no data. */
export function componentPercent(assessments, studentScores) {
  let earned = 0
  let possible = 0
  for (const assessment of assessments) {
    const score = studentScores[assessment.id]
    if (!score || score.status === 'excused') continue
    if (score.status === 'missing') {
      possible += assessment.total_points
    } else if (score.status === 'graded' && score.raw_score != null) {
      possible += assessment.total_points
      earned += score.raw_score
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
  for (const component of components) {
    const pct = componentPercent(component.assessments, studentScores)
    breakdown[component.id] = pct == null ? null : round2(pct)
    if (pct != null) {
      weighted += component.weight_percent * pct
      weightTotal += component.weight_percent
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
  if (initialGrade == null) return null
  for (const [lowerBound, transmuted] of DEPED_TRANSMUTATION_BANDS) {
    if (initialGrade >= lowerBound) return transmuted
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
  if (percent == null) return null
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
  if (initial == null) return { initial: null, final: null, descriptor: null, breakdown }
  if (mode === 'deped_k12') {
    const final = transmuteDepEd(initial)
    return { initial, final, descriptor: depEdDescriptor(final), breakdown }
  }
  if (mode === 'ched_point') {
    const final = chedPointEquivalent(initial)
    return { initial, final, descriptor: final <= 3.0 ? 'Passed' : 'Failed', breakdown }
  }
  // ched_percentage: the weighted percent is the final grade.
  return { initial, final: initial, descriptor: initial >= 75 ? 'Passed' : 'Failed', breakdown }
}

/** Weights must sum to exactly 100 before settings can be saved (§1.7). */
export function weightsValid(components) {
  return components.reduce((sum, c) => sum + Number(c.weight_percent || 0), 0) === 100
}
