/**
 * The arithmetic behind Grade Config's Preview card (T-45 Tier 2), kept out
 * of grading.jsx so the route file exports only components (react-refresh)
 * and so the test can hold the simulation against computeFinalGrade
 * directly. Lives under routes/teacher/ for the reason student/gradeDisplay.js
 * does: src/lib is the Data lane, and this is one page's presentation.
 */
import {
  LAB,
  componentTrack,
  computeFinalGrade,
  finalAcrossPeriods,
  gradePolicy,
  incompleteTracks,
  isPassingGrade,
  pointScaleBands,
} from '@/lib/grading'

/* Rows that survive the save: withIds() in grading.jsx drops anything
   without a name, so an unnamed row must not count toward the 100% check
   either -- otherwise you can park 20% on a nameless row, pass validation,
   and save a config that really only totals 80%. Every weight check runs on
   these rows, not the raw ones, and so does the preview. */
export function namedRows(rows) {
  return (rows ?? []).filter((r) => String(r.name ?? '').trim())
}

const round2 = (n) => Math.round(n * 100) / 100

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
    // Carried so a laboratory row simulates in the laboratory half, under the
    // same policy the record computes with.
    track: componentTrack(r),
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
    used.push({
      name: components[i].name,
      weight: components[i].weight_percent,
      score: clamped,
      track: components[i].track,
    })
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
  const lines = []
  if (sim.tracks) {
    /* With a laboratory the single weighted mean is not what happened: each
       track is weighted among its own components first, and only then are the
       two combined. Spelling out all three steps is the point of the panel. */
    for (const [label, key] of [['Lecture', 'lecture'], ['Laboratory', 'lab']]) {
      const rows = sim.used.filter((u) => (key === 'lab' ? u.track === LAB : u.track !== LAB))
      if (!rows.length) {
        lines.push(`${label}: no sample scores typed, so it is left out and the other track carries the grade.`)
        continue
      }
      const t = rows.map((u) => `${u.weight} × ${u.score}`).join(' + ')
      const w = rows.map((u) => u.weight).join(' + ')
      lines.push(`${label} = (${t}) ÷ (${w}) = ${sim.tracks[key]}`)
    }
    const { lecture, lab, lecture_weight_percent: lw, lab_weight_percent: bw } = sim.tracks
    if (lecture != null && lab != null) {
      lines.push(
        `Combined = (${lecture} × ${round2(lw)}% + ${lab} × ${round2(bw)}%) = ${sim.initial}`,
      )
    } else {
      lines.push(`Combined = ${sim.initial} (only one track has scores, so it is not re-weighted)`)
    }
  } else {
    const terms = sim.used.map((u) => `${u.weight} × ${u.score}`).join(' + ')
    const weights = sim.used.map((u) => u.weight).join(' + ')
    lines.push(`Weighted percent = (${terms}) ÷ (${weights}) = ${sim.initial}`)
  }
  if (mode === 'deped_k12') {
    lines.push(`Transmuted per DepEd Order No. 015, s. 2026 → ${fmtFinal(sim.final, mode)} · ${sim.descriptor} · passes at 75`)
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

/* ---------------------------------------------------------------------------
 * The whole-course simulator (Phase 2).
 *
 * `simulateGrade` above answers one period. The reference system's simulator
 * answers the COURSE: every configured period, each period's lecture and
 * laboratory halves, the combined period grade, and the overall grade the
 * student would actually be given -- which is the number a teacher is
 * deciding about when they set weights, and the one the single-period card
 * could never show.
 *
 * It computes nothing of its own. Each period goes through `computeFinalGrade`
 * and the periods are combined by `finalAcrossPeriods` -- the exact pair
 * lib/gradebook.js uses for the real record (`gradeForPeriod` + `buildSummary`).
 * `previewMatchesGradebook.test.js` holds the two against each other on the
 * same inputs, because a simulator that drifts from the gradebook is worse
 * than no simulator: it is a promise the record then breaks.
 * ------------------------------------------------------------------------ */

/** A sample typed into the simulator, clamped to 0-100, or null if blank. */
function sampleValue(raw) {
  if (raw === '' || raw == null) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return Math.min(100, Math.max(0, n))
}

/**
 * One period's simulated result, plus the per-component contributions a
 * teacher needs to see to understand where the number came from.
 */
function simulatePeriod(componentRows, periodSamples, mode, policy) {
  const rows = namedRows(componentRows)
  const components = rows.map((r, i) => ({
    id: `c${i}`,
    name: String(r.name).trim(),
    weight_percent: Number(r.weight_percent) || 0,
    track: componentTrack(r),
    assessments: [{ id: `a${i}`, total_points: 100 }],
  }))
  const scores = {}
  const contributions = []
  rows.forEach((r, i) => {
    const score = sampleValue(periodSamples?.[i])
    /* A blank is NOT a zero. It is left out of `scores` entirely, which is
       exactly how the record treats work that has not been graded yet, and
       why the remaining components get re-weighted rather than diluted. A
       typed 0, by contrast, is a real mark and counts as one. */
    if (score != null) scores[`a${i}`] = { status: 'graded', raw_score: score }
    contributions.push({
      id: `c${i}`,
      name: components[i].name,
      weight: components[i].weight_percent,
      track: components[i].track,
      score,
      graded: score != null,
    })
  })

  const result = computeFinalGrade(components, scores, mode, policy)
  const counted = contributions.filter((c) => c.graded)
  return {
    ...result,
    contributions,
    countedCount: counted.length,
    componentCount: contributions.length,
    weightUsed: counted.reduce((sum, c) => sum + c.weight, 0),
    passed: isPassingGrade(result.final, mode, policy),
    // Which tracks are configured but not fully sampled -- the same helper the
    // class record's amber "!" reads, so the two cannot disagree.
    incomplete: incompleteTracks(result.tracks),
  }
}

/**
 * The full course simulation: every configured period plus the overall grade.
 *
 * `samples` is keyed by period index then component index:
 * `{ 0: { 0: '85', 1: '78' }, 1: { ... } }`.
 *
 * `periods` are the rows from the Grading Periods editor; unnamed ones are
 * dropped by `namedRows`, exactly as they are at save time.
 */
export function simulateAllPeriods(periodRows, componentRows, samples, mode, policy) {
  const periods = namedRows(periodRows)
  const results = periods.map((p, pi) => {
    const sim = simulatePeriod(componentRows, samples?.[pi], mode, policy)
    return {
      index: pi,
      id: `p${pi}`,
      name: String(p.name).trim(),
      weight: Number(p.weight_percent) || 0,
      ...sim,
    }
  })

  /* The overall grade is combined from the periods the same way the Summary
     tab does it: `finalAcrossPeriods` over each period's FINAL (converted)
     grade, weighted by the period weight, skipping periods with no grade. */
  const byId = {}
  for (const r of results) if (r.final != null) byId[r.id] = r.final
  const overall = finalAcrossPeriods(
    byId,
    results.map((r) => ({ id: r.id, weight_percent: r.weight })),
    mode,
  )

  return {
    periods: results,
    overall,
    overallPassed: isPassingGrade(overall, mode, policy),
    gradedPeriods: results.filter((r) => r.final != null).length,
    // True once at least one sample is typed anywhere -- what the panel uses
    // to decide between its empty state and a result.
    hasAnySample: results.some((r) => r.countedCount > 0),
  }
}

/**
 * What is wrong with, or merely incomplete about, the simulated setup -- the
 * §5 warnings, computed from the same simulation the numbers come from.
 *
 * Severity is deliberate: `error` is a configuration that cannot produce a
 * correct grade and is already blocked at save time; `warn` is a real gap a
 * teacher should see but which must not block drafting.
 */
export function previewWarnings(sim, { labOn = false } = {}) {
  const out = []
  if (!sim.periods.length) {
    out.push({ level: 'error', text: 'No grading periods are named yet, so there is nothing to compute.' })
    return out
  }
  if (!sim.periods[0].componentCount) {
    out.push({ level: 'error', text: 'No components are named yet, so there is nothing to weight.' })
    return out
  }

  const empty = sim.periods.filter((p) => p.countedCount === 0)
  if (empty.length === sim.periods.length) return out // untouched form: not a warning
  for (const p of empty) {
    out.push({ level: 'warn', text: `${p.name} has no sample scores, so it is left out of the overall grade.` })
  }

  for (const p of sim.periods) {
    if (p.countedCount === 0) continue
    if (p.countedCount < p.componentCount) {
      const missing = p.contributions.filter((c) => !c.graded).map((c) => c.name).join(', ')
      out.push({
        level: 'warn',
        text: `${p.name} is part-sampled — ${missing} left blank, so the rest are re-weighted. A blank is not a zero.`,
      })
    }
    if (labOn) {
      for (const track of p.incomplete) {
        const label = track === LAB ? 'laboratory' : 'lecture'
        out.push({
          level: 'warn',
          text: `${p.name}: the ${label} half has no sample scores, so the other half carries the whole period.`,
        })
      }
    }
  }

  if (sim.gradedPeriods > 0 && sim.gradedPeriods < sim.periods.length) {
    out.push({
      level: 'warn',
      text: `Overall grade is provisional — ${sim.gradedPeriods} of ${sim.periods.length} periods have scores.`,
    })
  }
  return out
}
