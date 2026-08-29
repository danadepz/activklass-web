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
 * Thresholds mirror lib/grading.js (chedPointEquivalent, computeFinalGrade)
 * and the teacher's reports.jsx. Lives under routes/student/ for the reason
 * scaffolding.js does: src/lib is the Data lane.
 */
import { green, blueText, goldDeep, faint, red } from '@/theme'

export const POINT_SCALE = 'ched_point'
export const isPointScale = (mode) => mode === POINT_SCALE

/** null when there is no grade; otherwise whether it passes in this mode. */
export function passes(grade, mode) {
  if (grade == null) return null
  return isPointScale(mode) ? grade <= 3.0 : grade >= 75
}

/** "1.25" / "3.00" on the point scale; a whole number everywhere else. */
export function formatGrade(grade, mode) {
  if (grade == null) return '—'
  return isPointScale(mode) ? Number(grade).toFixed(2) : String(Math.round(grade))
}

/** What passing means, in the scale's own units. */
export function passNote(mode) {
  return isPointScale(mode) ? '1.00 is highest · 3.00 passes' : '75 passes'
}

export function gradeColor(grade, mode) {
  if (grade == null) return faint
  if (isPointScale(mode)) {
    if (grade <= 1.5) return green
    if (grade <= 2.25) return blueText
    if (grade <= 3.0) return goldDeep
    return red
  }
  if (grade >= 90) return green
  if (grade >= 85) return blueText
  if (grade >= 75) return goldDeep
  return red
}

/** Colour plus a descriptor, for the dashboard cards. */
export function gradeTone(grade, mode) {
  if (grade == null) return { fg: faint, label: '—' }
  const fg = gradeColor(grade, mode)
  if (isPointScale(mode)) {
    if (grade <= 1.5) return { fg, label: 'Excellent' }
    if (grade <= 2.25) return { fg, label: 'Very Good' }
    if (grade <= 3.0) return { fg, label: 'Passed' }
    return { fg, label: 'Failed' }
  }
  if (grade >= 90) return { fg, label: 'Outstanding' }
  if (grade >= 85) return { fg, label: 'Very Satisfactory' }
  if (grade >= 75) return { fg, label: 'Satisfactory' }
  return { fg, label: 'Needs work' }
}

/**
 * A grade as 0–100, for the gauges and bars that only speak percent.
 *
 * A point grade has no exact inverse (each point covers a band of percents),
 * so the band's lower bound from chedPointEquivalent is used: 1.0 fills to 96,
 * 3.0 to 75. A 5.0 sits at 60, the floor a DepEd fail also bottoms out at, so
 * one failed college subject pulls a cross-class average down the same
 * distance one failed K-12 subject does.
 */
const POINT_BANDS = [[1.0, 96], [1.25, 94], [1.5, 91], [1.75, 88], [2.0, 85], [2.25, 82], [2.5, 79], [2.75, 76], [3.0, 75]]
export function gradeAsPercent(grade, mode) {
  if (grade == null) return null
  if (!isPointScale(mode)) return grade
  for (const [point, pct] of POINT_BANDS) if (grade <= point) return pct
  return 60
}
