/**
 * The arithmetic behind Grade Config's Preview card (T-45 Tier 2), kept out
 * of grading.jsx so the route file exports only components (react-refresh)
 * and so the test can hold the simulation against computeFinalGrade
 * directly. Lives under routes/teacher/ for the reason student/gradeDisplay.js
 * does: src/lib is the Data lane, and this is one page's presentation.
 */
import { computeFinalGrade, gradePolicy, isPassingGrade, pointScaleBands } from '@/lib/grading'

/* Rows that survive the save: withIds() in grading.jsx drops anything
   without a name, so an unnamed row must not count toward the 100% check
   either -- otherwise you can park 20% on a nameless row, pass validation,
   and save a config that really only totals 80%. Every weight check runs on
   these rows, not the raw ones, and so does the preview. */
export function namedRows(rows) {
  return (rows ?? []).filter((r) => String(r.name ?? '').trim())
}

/** The 1.00 / 4.75 the point scale prints. */
export const fmtPoint = (p) => Number(p).toFixed(2)

/** How a final grade prints in each mode: "87", "2.50", "79.5". */
export function fmtFinal(value, mode) {
  if (value == null) return '—'
  if (mode === 'ched_point') return fmtPoint(value)
  if (mode === 'deped_k12') return String(Math.round(value))
  return String(Math.round(value * 100) / 100)
}

/*
 * The simulation itself. Every named component becomes one 100-point
 * assessment, each typed sample is that assessment's score, and the grade is
 * computed by the same function with the same policy the record uses -- so
 * what the preview says is what the record will say for those numbers.
 * Components without a sample are left out and the rest re-weighted, exactly
 * as ungraded work is in the record.
 */
export function simulateGrade(componentRows, samples, mode, policy) {
  const rows = namedRows(componentRows)
  const components = rows.map((r, i) => ({
    id: `c${i}`,
    name: String(r.name).trim(),
    weight_percent: Number(r.weight_percent) || 0,
    assessments: [{ id: `a${i}`, total_points: 100 }],
  }))
  const scores = {}
  const used = []
  rows.forEach((r, i) => {
    const raw = samples?.[i]
    const value = Number(raw)
    if (raw === '' || raw == null || !Number.isFinite(value)) return
    const clamped = Math.min(100, Math.max(0, value))
    scores[`a${i}`] = { status: 'graded', raw_score: clamped }
    used.push({ name: components[i].name, weight: components[i].weight_percent, score: clamped })
  })
  const result = computeFinalGrade(components, scores, mode, policy)
  return {
    ...result,
    used,
    passed: isPassingGrade(result.final, mode, policy),
    weightUsed: used.reduce((sum, u) => sum + u.weight, 0),
  }
}

/** The formula in words, from the numbers the simulation actually used; null with nothing typed. */
export function describeFormula(sim, mode, policy) {
  if (!sim.used.length || sim.initial == null) return null
  const { passing_percent, point_scale_direction } = gradePolicy(policy)
  const terms = sim.used.map((u) => `${u.weight} × ${u.score}`).join(' + ')
  const weights = sim.used.map((u) => u.weight).join(' + ')
  const lines = [`Weighted percent = (${terms}) ÷ (${weights}) = ${sim.initial}`]
  if (mode === 'deped_k12') {
    lines.push(`Transmuted per DepEd Order No. 8, s. 2015 → ${fmtFinal(sim.final, mode)} · ${sim.descriptor} · passes at 75`)
  } else if (mode === 'ched_point') {
    const bands = pointScaleBands(policy)
    const band = bands.find((b) => sim.initial >= b.from) ?? bands[bands.length - 1]
    const bandLabel = band.to == null || band.from > 0 ? `${band.from} and above` : `below ${band.to}`
    lines.push(
      `${sim.initial} falls in the “${bandLabel}” band → ${fmtFinal(sim.final, mode)}`
        + ` (${point_scale_direction === 'inverted' ? '5.0' : '1.0'} is highest)`
        + ` · passes at 3.00 ${point_scale_direction === 'inverted' ? 'or higher' : 'or lower'}`,
    )
  } else {
    lines.push(`The weighted percent is the grade → ${fmtFinal(sim.final, mode)} · passes at ${passing_percent} or higher`)
  }
  return lines
}
