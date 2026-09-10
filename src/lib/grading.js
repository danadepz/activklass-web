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

/**
 * What passes, and which way the point scale runs (T-45, from a tester's
 * CIT-U CMRS). Two settings on the gradebook:
 * - `passing_percent`: the lowest weighted percent that passes in the CHED
 *   modes. Default 75. DepEd K-12 ignores it -- DepEd Order No. 8 s. 2015
 *   fixes 75 on the transmuted grade.
 * - `point_scale_direction`: 'ched' (1.0 is highest, 5.0 fails -- the default
 *   and what every gradebook meant before the field existed) or 'inverted'
 *   (5.0 is highest, 1.0 fails, as CIT-U reads it). 3.0 passes either way.
 *
 * Read them off any gradebook-shaped document -- a gradebook, a preset, a
 * student's entry, a loaded bundle -- through gradePolicy(), which fills the
 * defaults, so a document written before the fields existed computes exactly
 * as it always has. grading.test.js proves that.
 */
export const DEFAULT_PASSING_PERCENT = 75
export const PASSING_POINT = 3.0
export const POINT_SCALE_DIRECTIONS = [
  { value: 'ched', label: '1.0 is highest', hint: 'Standard CHED · 1.0 best, 3.0 passes, 5.0 fails' },
  { value: 'inverted', label: '5.0 is highest', hint: 'CIT-U style · 5.0 best, 3.0 passes, 1.0 fails' },
]

export function gradePolicy(source) {
  const pct = Number(source?.passing_percent)
  return {
    passing_percent: Number.isFinite(pct) && pct > 0 && pct < 100 ? pct : DEFAULT_PASSING_PERCENT,
    point_scale_direction: source?.point_scale_direction === 'inverted' ? 'inverted' : 'ched',
  }
}

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

/**
 * The CHED point ladder at the default pass mark: [percent lower bound, point].
 * The passing band runs 75–100. A different pass mark stretches these bounds
 * in proportion over its own band (pointScaleBands), so at 75 the ladder is
 * exactly the one every gradebook has always used -- integer arithmetic, no
 * rounding drift.
 */
const POINT_LADDER = [
  [96, 1.0], [94, 1.25], [91, 1.5], [88, 1.75], [85, 2.0], [82, 2.25], [79, 2.5], [76, 2.75], [75, 3.0],
]
const FAILING_POINT = 5.0

/* 'inverted' mirrors the scale around 3.0: 1.0 ↔ 5.0, 1.25 ↔ 4.75, 3.0 stays. */
const orientPoint = (point, direction) => (direction === 'inverted' ? round2(6 - point) : point)

/**
 * The score ranges behind the point scale under `policy`, best grade first:
 * [{ point, from, to }] with `from` inclusive and `to` exclusive (null on the
 * top band), ending with the failing band. What the Grade Config table shows
 * and what chedPointEquivalent walks, so the two cannot disagree.
 */
export function pointScaleBands(policy) {
  const { passing_percent, point_scale_direction } = gradePolicy(policy)
  const stretch = (lower) =>
    round2(
      passing_percent
        + ((lower - DEFAULT_PASSING_PERCENT) * (100 - passing_percent)) / (100 - DEFAULT_PASSING_PERCENT),
    )
  const bands = POINT_LADDER.map(([lower, point], i) => ({
    point: orientPoint(point, point_scale_direction),
    from: stretch(lower),
    to: i === 0 ? null : stretch(POINT_LADDER[i - 1][0]),
  }))
  bands.push({ point: orientPoint(FAILING_POINT, point_scale_direction), from: 0, to: passing_percent })
  return bands
}

/** Percentage → collegiate point scale under `policy` (default: 1.0 highest … 5.0 failed). */
export function chedPointEquivalent(percent, policy) {
  if (percent == null || !Number.isFinite(Number(percent))) return null
  const value = Number(percent)
  const bands = pointScaleBands(policy)
  return (bands.find((b) => value >= b.from) ?? bands[bands.length - 1]).point
}

/**
 * Whether a final grade in `mode` passes under `policy`; null without a grade.
 * The one definition of Passed / Failed -- every screen that counts or colours
 * a pass reads this, so a teacher-set pass mark cannot be honoured on the
 * record and ignored on the report.
 */
export function isPassingGrade(final, mode, policy) {
  const g = Number(final)
  if (final == null || !Number.isFinite(g)) return null
  const { passing_percent, point_scale_direction } = gradePolicy(policy)
  if (mode === 'ched_point') {
    return point_scale_direction === 'inverted' ? g >= PASSING_POINT : g <= PASSING_POINT
  }
  if (mode === 'deped_k12') return g >= DEFAULT_PASSING_PERCENT
  return g >= passing_percent
}

/**
 * Full pipeline for one student: components + scores + mode → final grade.
 * Returns { initial, final, descriptor, breakdown }. `policy` is the
 * gradebook's pass mark and scale direction (gradePolicy); omitted, the
 * defaults reproduce every grade computed before the fields existed.
 */
export function computeFinalGrade(components, studentScores, mode = 'deped_k12', policy) {
  const { grade: initial, breakdown } = periodGrade(components, studentScores)
  if (initial == null || !Number.isFinite(initial)) {
    return { initial: null, final: null, descriptor: null, breakdown }
  }
  if (mode === 'deped_k12') {
    const final = transmuteDepEd(initial)
    return { initial, final, descriptor: final == null ? null : depEdDescriptor(final), breakdown }
  }
  if (mode === 'ched_point') {
    const final = chedPointEquivalent(initial, policy)
    if (final == null) return { initial, final: null, descriptor: null, breakdown }
    return { initial, final, descriptor: isPassingGrade(final, mode, policy) ? 'Passed' : 'Failed', breakdown }
  }
  // ched_percentage: the weighted percent is the final grade.
  return {
    initial,
    final: initial,
    descriptor: isPassingGrade(initial, 'ched_percentage', policy) ? 'Passed' : 'Failed',
    breakdown,
  }
}

/**
 * Weights must each be positive and together sum to 100 before settings can
 * be saved (§1.7).
 *
 * Positive, not just summing: 120 and -20 also reach 100, and the pilot
 * teacher walkthrough proved someone will type it. A weight of 0 is a period
 * that never counts — delete the row instead.
 *
 * Tolerance on the sum, not equality: 20.5 + 20.5 + 59 is 99.99999999999999
 * in floating point, so `=== 100` rejected weight sets that are correct. The
 * 0.01 window matches the `balanced()` check routes/teacher/grading.jsx
 * already uses.
 */
export function weightsValid(components) {
  const rows = components ?? []
  if (rows.some((c) => !(Number(c.weight_percent) > 0))) return false
  const sum = rows.reduce((total, c) => total + (Number(c.weight_percent) || 0), 0)
  return Math.abs(sum - 100) < 0.01
}

const toHalfStep = (n) => Math.round(n * 2) / 2

/**
 * Scale every row's weight so they total `target`, each in proportion to what
 * it held — equally when they all sit at zero, so a fresh set of rows still
 * splits sensibly. Shares snap to the 0.5 grid the weight inputs use; the
 * last row absorbs the rounding residue so the total is exact, never 99.5.
 * Rows keep everything but weight_percent, which comes back as the string the
 * editor stores.
 */
function scaleWeightsTo(rows, target) {
  const weights = rows.map((r) => Number(r.weight_percent) || 0)
  const sum = weights.reduce((a, b) => a + b, 0)
  let remaining = round2(Math.max(0, target))
  return rows.map((r, i) => {
    const isLast = i === rows.length - 1
    const ideal = sum > 0 ? (weights[i] / sum) * target : target / rows.length
    // Never hand out more than is left, so the last row can't go negative.
    const share = isLast ? remaining : Math.min(remaining, Math.max(0, toHalfStep(ideal)))
    remaining = round2(remaining - share)
    return { ...r, weight_percent: String(share) }
  })
}

/**
 * Reactive weights (§1.7 editors): pin one row to what the teacher just set
 * and rescale every other row so the group still totals 100. The pinned cell
 * keeps the raw input string — rewriting "3." to "3" mid-keystroke makes
 * decimals untypeable — while the distribution reads it clamped to 0–100.
 */
export function rebalanceWeights(rows, index, rawValue) {
  const pinned = Math.min(100, Math.max(0, Number(rawValue) || 0))
  const others = scaleWeightsTo(rows.filter((_, i) => i !== index), 100 - pinned)
  let k = 0
  return rows.map((r, i) => (i === index ? { ...r, weight_percent: String(rawValue) } : others[k++]))
}

/** Removing a row hands its weight back to the survivors, keeping 100. */
export function redistributeWeights(rows) {
  return scaleWeightsTo(rows, 100)
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
