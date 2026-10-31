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
 * - 'deped_k12':     weighted percentage → DepEd Order No. 015 s. 2026 transmutation
 * - 'ched_percentage': raw weighted percentage, no transmutation
 * - 'ched_point':    percentage mapped to the 1.0–5.0 collegiate point scale
 *
 * DepEd Order No. 015, s. 2026 (signed 2026-06-04, effective SY 2026-2027)
 * replaced DO 8, s. 2015's transmutation table with an adjusted one, Table 4
 * "Adjusted Transmutation Table" -- a transition step toward a zero-based
 * grading system starting SY 2027-2028. The passing transmuted grade is
 * still 75, but it now takes an initial grade of 70.00 to reach it, not
 * 60.00 -- a raw 65, comfortably passing under the old table, now fails.
 */

export const GRADING_MODES = [
  { value: 'deped_k12', label: 'DepEd K-12 (weights + transmutation)' },
  { value: 'ched_percentage', label: 'CHED Tertiary — raw percentage' },
  { value: 'ched_point', label: 'CHED Tertiary — point scale (1.0–5.0)' },
]

/**
 * Course structure, separate from the institution's grading standard above
 * (PDF reference §2 "Lecture with Laboratory"). A DepEd class and a CHED
 * class can each be lecture-only or lecture-with-lab, so the two choices are
 * independent fields rather than six combined grading modes.
 *
 * A component's `track` says which half it belongs to. ABSENT MEANS LECTURE:
 * every component saved before this field existed is a lecture component, so
 * an untouched gradebook computes exactly as it always has. The track, not
 * the name, is the identity -- a component called "Lab Exam" with no track is
 * a lecture component, and renaming "Lab Exercise" to "Exercises" does not
 * move it out of the laboratory.
 */
export const LECTURE = 'lecture'
export const LAB = 'lab'
export const LECTURE_ONLY = 'lecture_only'
export const LECTURE_LAB = 'lecture_lab'

export const GRADING_STRUCTURES = [
  {
    value: LECTURE_ONLY,
    label: 'Lecture only',
    hint: 'One set of components. How every class is graded today.',
  },
  {
    value: LECTURE_LAB,
    label: 'Lecture with Laboratory',
    hint: 'Lecture and laboratory are weighted separately, then combined.',
  },
]

/**
 * The laboratory's share of the combined grade, as a percent; lecture takes
 * the rest. The reference profile is lecture twice, laboratory once -- 2/3
 * and 1/3 -- so the default is 100/3 exactly rather than a rounded 33.33,
 * which would put the reference example's combined grade 0.0002 off.
 *
 * Configurable because the ratio is a school policy, not arithmetic: see
 * `labWeightError` for the range a teacher may set.
 */
export const DEFAULT_LAB_WEIGHT = 100 / 3

/** The two components the reference laboratory template requires. */
export const LAB_COMPONENT_PRESET = [
  { name: 'Lab Exercise', weight_percent: 70, track: LAB, required: true },
  { name: 'Lab Exam', weight_percent: 30, track: LAB, required: true },
]

/** A component's track, defaulting to lecture (see the note above). */
export function componentTrack(component) {
  return component?.track === LAB ? LAB : LECTURE
}

/**
 * Why this laboratory share cannot be saved, or null. Both halves must carry
 * real weight: a 0 or a 100 is one of the two tracks switched off, which is
 * Lecture only / Laboratory only said in a way that still demands laboratory
 * components be configured and graded.
 */
export function labWeightError(value) {
  const n = Number(value)
  if (value === '' || value == null || !Number.isFinite(n)) {
    return 'Enter the laboratory share of the combined grade.'
  }
  if (!(n > 0) || !(n < 100)) return 'The laboratory share must be above 0% and below 100%.'
  return null
}

/**
 * What passes, and which way the point scale runs (T-45, from a tester's
 * description of his school's grading module). Two settings on the gradebook:
 * - `passing_percent`: the lowest weighted percent that passes in the CHED
 *   modes. Default 75. DepEd K-12 ignores it -- DepEd Order No. 015 s. 2026
 *   fixes 75 on the transmuted grade (DO 8 s. 2015 also fixed 75; only the
 *   table mapping an initial grade onto it changed).
 * - `point_scale_direction`: 'ched' (1.0 is highest, 5.0 fails -- the default
 *   and what every gradebook meant before the field existed) or 'inverted'
 *   (the reversed scale: 5.0 is highest, 1.0 fails). 3.0 passes either way.
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
  { value: 'inverted', label: '5.0 is highest', hint: 'Reversed scale · 5.0 best, 3.0 passes, 1.0 fails' },
]

export function gradePolicy(source) {
  const pct = Number(source?.passing_percent)
  /* The course structure rides along on the same object for one reason: every
     screen in the system already threads `policy` from the gradebook (or from
     the student's own entry doc) into the computation. Carrying the structure
     here means the record, the reports, the preview, the student pages and the
     parent app all learned laboratory grading without a new argument. */
  const lab = Number(source?.lab_weight_percent)
  return {
    passing_percent: Number.isFinite(pct) && pct > 0 && pct < 100 ? pct : DEFAULT_PASSING_PERCENT,
    point_scale_direction: source?.point_scale_direction === 'inverted' ? 'inverted' : 'ched',
    grading_structure: source?.grading_structure === LECTURE_LAB ? LECTURE_LAB : LECTURE_ONLY,
    lab_weight_percent: Number.isFinite(lab) && lab > 0 && lab < 100 ? lab : DEFAULT_LAB_WEIGHT,
  }
}

/** Whether `source` (a gradebook, preset, entry or policy) grades a laboratory. */
export function hasLab(source) {
  return gradePolicy(source).grading_structure === LECTURE_LAB
}

// DepEd K-12 preset component weights (DepEd Order No. 8, s. 2015 — core
// subjects). Unlike the transmutation table above, DO 015 s. 2026's effect
// on these weights has not been confirmed, so they are left as-is.
export const DEPED_COMPONENT_PRESET = [
  { name: 'Written Works', weight_percent: 30 },
  { name: 'Performance Tasks', weight_percent: 50 },
  { name: 'Quarterly Assessments', weight_percent: 20 },
]

// One-click grading-setup presets (periods + components, each summing to 100%).
export const GRADING_PRESETS = [
  {
    key: 'deped_k12',
    label: 'DepEd K-12 — 4 Quarters (DO 8, s. 2015 weights)',
    periods: [
      { name: 'Quarter 1', weight_percent: 25 },
      { name: 'Quarter 2', weight_percent: 25 },
      { name: 'Quarter 3', weight_percent: 25 },
      { name: 'Quarter 4', weight_percent: 25 },
    ],
    components: DEPED_COMPONENT_PRESET,
  },
  {
    /*
     * The structure DepEd Order No. 015, s. 2026 is REPORTED to introduce for
     * SY 2026-2027: three terms instead of four quarters, and 20 / 50 / 30 in
     * place of DO 8 s. 2015's 30 / 50 / 20.
     *
     * Offered as a preset a teacher must deliberately pick, and NOT made the
     * default, on purpose. The transmutation table this app already ships
     * (DEPED_TRANSMUTATION_BANDS) came from the owner's own copy of the
     * official Table 4; the weights and the three-term structure did not. Two
     * independent secondary sources agree on 20/50/30 and on three terms, but
     * no deped.gov.ph URL for the order could be retrieved (2026-10-31) --
     * a search of deped.gov.ph returns only Advisory No. 015 s. 2026, a
     * different document about a Math Camp.
     *
     * So: available to a school that has the order in hand, invisible to
     * everyone else, and changing nothing for a class already configured.
     * Switching an existing class to it would move every recorded grade, which
     * is exactly what an unverified policy claim must not do.
     *
     * TLE / MAPEH / EPP are reported as 20 / 60 / 20 -- edit the weights after
     * applying this preset for those subjects.
     */
    key: 'deped_k12_do015',
    label: 'DepEd K-12 — 3 Terms (DO 015, s. 2026 weights)',
    note: 'Reported structure for SY 2026-2027 — confirm against your school’s copy of the order before applying.',
    periods: [
      { name: 'Term 1', weight_percent: 100 / 3 },
      { name: 'Term 2', weight_percent: 100 / 3 },
      { name: 'Term 3', weight_percent: 100 / 3 },
    ],
    components: [
      { name: 'Written Works', weight_percent: 20 },
      { name: 'Performance Tasks', weight_percent: 50 },
      { name: 'Examinations', weight_percent: 30 },
    ],
  },
  {
    /* The reference profile from Grading_Configuration_Analysis (§2): lecture
       and laboratory graded apart, combined lecture-twice-laboratory-once.
       Periods are the two the reference example actually computes.

       Heads-up on "Prelim Exam": components repeat in EVERY period in this
       data model, so a component named after one period reads oddly in the
       others. The weights are the reference's (40/20/40) and are valid within
       a period; a school that runs Prelim as its own period should rename this
       row to "Prelim/Periodic Exam" or fold it into Class Standing. */
    key: 'lecture_lab',
    label: 'College — Lecture with Laboratory',
    grading_structure: LECTURE_LAB,
    lab_weight_percent: DEFAULT_LAB_WEIGHT,
    periods: [
      { name: 'Midterm', weight_percent: 50 },
      { name: 'Finals', weight_percent: 50 },
    ],
    components: [
      { name: 'Class Standing', weight_percent: 40, track: LECTURE },
      { name: 'Prelim Exam', weight_percent: 20, track: LECTURE },
      { name: 'Major Exam', weight_percent: 40, track: LECTURE },
      ...LAB_COMPONENT_PRESET,
    ],
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

/**
 * One track's weighted percent, UNROUNDED, plus what it was built from.
 *
 * Unrounded on purpose: with a laboratory this is an intermediate value that
 * gets combined with the other track before anything is reported, and rounding
 * both halves first moves the combined grade. `periodGrade` rounds once, at
 * the end, exactly where it always did.
 *
 * `graded` / `total` are how many of the track's components have any recorded
 * data, which is what tells a required-but-unassessed laboratory apart from a
 * laboratory that simply is not configured.
 */
function trackPercent(components, studentScores) {
  let weighted = 0
  let weightTotal = 0
  let graded = 0
  let total = 0
  const breakdown = {}
  for (const component of components ?? []) {
    total += 1
    const pct = componentPercent(component.assessments, studentScores)
    const usable = pct != null && Number.isFinite(pct)
    breakdown[component.id] = usable ? round2(pct) : null
    const weight = Number(component.weight_percent)
    if (usable && Number.isFinite(weight)) {
      graded += 1
      weighted += weight * pct
      weightTotal += weight
    }
  }
  return {
    raw: weightTotal === 0 ? null : weighted / weightTotal,
    breakdown,
    graded,
    total,
  }
}

/**
 * How far along one track's grading is. The states the teacher has to be able
 * to tell apart (§8D): a track with no components at all is not the same as
 * one whose components exist but have never been scored, and neither is the
 * same as a half-graded one.
 */
function trackStatus({ graded, total }) {
  if (total === 0) return 'no_components'
  if (graded === 0) return 'ungraded'
  return graded < total ? 'partial' : 'complete'
}

/**
 * Weighted period grade (pre-transmutation "Initial Grade"), or null.
 *
 * Lecture only -- the default, and every gradebook saved before laboratory
 * grading existed -- is the original single weighted mean, unchanged.
 *
 * Lecture with laboratory weights each track's components among themselves
 * (so each group's weights total 100% on their own), then combines the two
 * track results by the configured share. A track with no recorded data is
 * left out and the other re-weighted -- the same rule an ungraded component
 * has always followed, so a laboratory nobody has graded yet does NOT land as
 * a zero. `tracks.*_status` is what makes that visible instead of silent.
 */
export function periodGrade(components, studentScores, policy) {
  const { grading_structure, lab_weight_percent } = gradePolicy(policy)
  const rows = components ?? []

  if (grading_structure !== LECTURE_LAB) {
    const { raw, breakdown } = trackPercent(rows, studentScores)
    return { grade: raw == null ? null : round2(raw), breakdown, tracks: null }
  }

  const lecture = trackPercent(rows.filter((c) => componentTrack(c) === LECTURE), studentScores)
  const lab = trackPercent(rows.filter((c) => componentTrack(c) === LAB), studentScores)
  const breakdown = { ...lecture.breakdown, ...lab.breakdown }

  const lectureWeight = 100 - lab_weight_percent
  let weighted = 0
  let weightTotal = 0
  if (lecture.raw != null) {
    weighted += lectureWeight * lecture.raw
    weightTotal += lectureWeight
  }
  if (lab.raw != null) {
    weighted += lab_weight_percent * lab.raw
    weightTotal += lab_weight_percent
  }

  const tracks = {
    lecture: lecture.raw == null ? null : round2(lecture.raw),
    lab: lab.raw == null ? null : round2(lab.raw),
    lecture_status: trackStatus(lecture),
    lab_status: trackStatus(lab),
    lab_weight_percent,
    lecture_weight_percent: lectureWeight,
    // The combined percent before any rounding, for a caller that needs the
    // full-precision number (the formula lines, a regression test).
    combined_raw: weightTotal === 0 ? null : weighted / weightTotal,
  }
  return {
    grade: weightTotal === 0 ? null : round2(weighted / weightTotal),
    breakdown,
    tracks,
  }
}

/**
 * The tracks whose grade is missing although the track is configured --
 * `['lab']` for a laboratory class whose laboratory has never been scored.
 * Empty for a lecture-only class, so a caller can render it unconditionally.
 */
export function incompleteTracks(tracks) {
  if (!tracks) return []
  const out = []
  if (tracks.lecture_status === 'ungraded' || tracks.lecture_status === 'partial') out.push(LECTURE)
  if (tracks.lab_status === 'ungraded' || tracks.lab_status === 'partial') out.push(LAB)
  return out
}

/**
 * DepEd Order No. 015, s. 2026 transmutation table ("Table 4. Adjusted
 * Transmutation Table"): Initial Grade → Transmuted Grade (60 = floor,
 * 100 = ceiling), expressed as the lower bound of each initial-grade band.
 * Replaces DO 8, s. 2015's table for SY 2026-2027 -- the owner-supplied
 * table image is the source; every lower bound below is copied from it, not
 * derived. The step above 70 is roughly 1.18 points per transmuted point and
 * below 70 roughly 4.2-4.7 points, tightening the band around the new 70→75
 * pass line rather than scaling it evenly, so do not "fix" an apparently
 * uneven gap -- it is uneven in the source table too.
 */
const DEPED_TRANSMUTATION_BANDS = [
  [99.50, 100], [98.32, 99], [97.14, 98], [95.96, 97], [94.78, 96],
  [93.60, 95], [92.42, 94], [91.24, 93], [90.06, 92], [88.88, 91],
  [87.70, 90], [86.52, 89], [85.34, 88], [84.16, 87], [82.98, 86],
  [81.80, 85], [80.62, 84], [79.44, 83], [78.26, 82], [77.08, 81],
  [75.90, 80], [74.72, 79], [73.54, 78], [72.36, 77], [71.18, 76],
  [70.00, 75], [65.34, 74], [60.67, 73], [56.01, 72], [51.34, 71],
  [46.67, 70], [42.01, 69], [37.34, 68], [32.68, 67], [28.01, 66],
  [23.35, 65], [18.68, 64], [14.01, 63], [9.35, 62], [4.68, 61],
  [0.00, 60],
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

/** DepEd descriptor for a transmuted grade (unchanged by DO 015 s. 2026). */
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
  /* The lecture and laboratory halves are combined as RAW percents inside
     periodGrade, and the official conversion below runs once on the combined
     number. Converting each track and then averaging official grades would
     transmute twice and is not what any of the three standards describe. */
  const { grade: initial, breakdown, tracks } = periodGrade(components, studentScores, policy)
  if (initial == null || !Number.isFinite(initial)) {
    return { initial: null, final: null, descriptor: null, breakdown, tracks }
  }
  if (mode === 'deped_k12') {
    const final = transmuteDepEd(initial)
    return { initial, final, descriptor: final == null ? null : depEdDescriptor(final), breakdown, tracks }
  }
  if (mode === 'ched_point') {
    const final = chedPointEquivalent(initial, policy)
    if (final == null) return { initial, final: null, descriptor: null, breakdown, tracks }
    return { initial, final, descriptor: isPassingGrade(final, mode, policy) ? 'Passed' : 'Failed', breakdown, tracks }
  }
  // ched_percentage: the weighted percent is the final grade.
  return {
    initial,
    final: initial,
    descriptor: isPassingGrade(initial, 'ched_percentage', policy) ? 'Passed' : 'Failed',
    breakdown,
    tracks,
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
