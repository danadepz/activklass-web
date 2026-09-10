/**
 * How a student's grade is shown, by the gradebook's grading mode.
 *
 * `entries.mode` is stamped by syncEntries from `gradebooks.grading_mode`
 * (lib/gradebook.js). Two of the three modes are percentages — DepEd K-12
 * transmuted and CHED % — where higher is better and 75 passes. The third,
 * `ched_point`, is the collegiate 1.0–5.0 scale where LOWER is better and
 * 3.0 is the last passing point. Before this file the student pages rounded
 * every grade to a whole number (a 1.25 printed as "1") and coloured it by the
 * 75-or-above band, so every passing college student was painted red.
 *
 * Thresholds come from lib/grading.js (isPassingGrade, pointScaleBands) and
 * so agree with the teacher's record. Lives under routes/student/ for the
 * reason scaffolding.js does: src/lib is the Data lane.
 *
 * Every helper takes an optional `policy` -- the entry itself will do, since
 * syncEntries stamps `passing_percent` and `point_scale_direction` on it
 * beside `mode` (T-45). Without one the defaults apply: 75 passes, 1.0 is the
 * best point grade. On the 'inverted' scale (5.0 best) a grade is mirrored
 * around 3.0 before the bands below are read, so 4.75 colours as a 1.25 does.
 */
import { green, blueText, goldDeep, faint, red } from '@/theme'
import { gradePolicy, isPassingGrade, pointScaleBands } from '@/lib/grading'

export const POINT_SCALE = 'ched_point'
export const isPointScale = (mode) => mode === POINT_SCALE

/* A point grade read the standard way round (1.0 best), whatever the policy. */
function standardPoint(grade, policy) {
  return gradePolicy(policy).point_scale_direction === 'inverted' ? 6 - grade : grade
}

/** null when there is no grade; otherwise whether it passes in this mode. */
export function passes(grade, mode, policy) {
  if (grade == null) return null
  return isPassingGrade(grade, isPointScale(mode) ? mode : 'ched_percentage', policy)
}

/** "1.25" / "3.00" on the point scale; a whole number everywhere else. */
export function formatGrade(grade, mode) {
  if (grade == null) return '—'
  return isPointScale(mode) ? Number(grade).toFixed(2) : String(Math.round(grade))
}

/** What passing means, in the scale's own units. */
export function passNote(mode, policy) {
  const { passing_percent, point_scale_direction } = gradePolicy(policy)
  if (!isPointScale(mode)) return `${passing_percent} passes`
  return `${point_scale_direction === 'inverted' ? '5.00' : '1.00'} is highest · 3.00 passes`
}

export function gradeColor(grade, mode, policy) {
  if (grade == null) return faint
  if (isPointScale(mode)) {
    const g = standardPoint(grade, policy)
    if (g <= 1.5) return green
    if (g <= 2.25) return blueText
    if (g <= 3.0) return goldDeep
    return red
  }
  if (grade >= 90) return green
  if (grade >= 85) return blueText
  if (grade >= gradePolicy(policy).passing_percent) return goldDeep
  return red
}

/** Colour plus a descriptor, for the dashboard cards. */
export function gradeTone(grade, mode, policy) {
  if (grade == null) return { fg: faint, label: '—' }
  const fg = gradeColor(grade, mode, policy)
  if (isPointScale(mode)) {
    const g = standardPoint(grade, policy)
    if (g <= 1.5) return { fg, label: 'Excellent' }
    if (g <= 2.25) return { fg, label: 'Very Good' }
    if (g <= 3.0) return { fg, label: 'Passed' }
    return { fg, label: 'Failed' }
  }
  if (grade >= 90) return { fg, label: 'Outstanding' }
  if (grade >= 85) return { fg, label: 'Very Satisfactory' }
  if (grade >= gradePolicy(policy).passing_percent) return { fg, label: 'Satisfactory' }
  return { fg, label: 'Needs work' }
}

/**
 * A grade as 0–100, for the gauges and bars that only speak percent.
 *
 * A point grade has no exact inverse (each point covers a band of percents),
 * so the band's lower bound from pointScaleBands is used: at the default pass
 * mark 1.0 fills to 96, 3.0 to 75. A fail sits at 60, the floor a DepEd fail
 * also bottoms out at, so one failed college subject pulls a cross-class
 * average down the same distance one failed K-12 subject does.
 */
export function gradeAsPercent(grade, mode, policy) {
  if (grade == null) return null
  if (!isPointScale(mode)) return grade
  const g = standardPoint(grade, policy)
  // Bands read the standard way round, best first; the last one is the fail.
  const bands = pointScaleBands({ ...gradePolicy(policy), point_scale_direction: 'ched' })
  for (const b of bands.slice(0, -1)) if (g <= b.point) return b.from
  return 60
}
