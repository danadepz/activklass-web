/**
 * What is missing before a period's grades can be called finished.
 *
 * Phase 2 §5. The class record already shows per-cell state and the amber "!"
 * on a half-graded track, but nothing told a teacher *at the top of the page*
 * that a component has no assessments at all, that an assessment was published
 * and never marked, or which students are still unscored. Those are the gaps
 * that produce a confident-looking final grade built on almost no data.
 *
 * Pure, and deliberately NOT a second grade calculation: it reports on the
 * same bundle `lib/gradebook.js` computes from, and never decides a number.
 * The one rule it enforces everywhere is the system's existing one --
 *
 *   graded   : a real mark
 *   missing  : a real mark of zero, deliberately entered (counts as 0)
 *   excused  : excluded from both sides
 *   no score : NOT a zero -- excluded, and the thing this module reports
 *
 * -- so nothing here ever converts an absent score into a zero, and "missing"
 * (the teacher's explicit M) is never confused with "not yet scored".
 */
import { LAB, LECTURE, componentTrack, hasLab, weightsValid } from '@/lib/grading'

/** Severity ordering, worst first, so a caller can sort or cap the list. */
export const LEVELS = ['error', 'warn', 'info']

const byTrack = (components, track) =>
  (components ?? []).filter((c) => componentTrack(c) === track)

/** A score entry that represents a decision the teacher has actually made. */
const isRecorded = (score) =>
  !!score && (score.status === 'graded' || score.status === 'missing' || score.status === 'excused')

/** A score that contributes a mark (graded, or an explicit zero via `missing`). */
const isScored = (score) => !!score && (score.status === 'graded' || score.status === 'missing')

/**
 * Readiness findings for one grading period.
 *
 * `bundle` is lib/gradebook.js's loadBundle shape; `periodId` picks the period.
 * Returns `{ findings, counts, complete }` where `findings` is ordered worst
 * first and every entry carries enough identity for the UI to link to it.
 */
export function periodReadiness(bundle, periodId) {
  const components = bundle?.components ?? []
  const students = bundle?.students ?? []
  const allAssessments = bundle?.assessments ?? []
  const assessments = allAssessments.filter((a) => a.period_id === periodId)
  const labOn = hasLab(bundle?.policy)
  const findings = []
  const add = (level, code, text, extra = {}) => findings.push({ level, code, text, ...extra })

  const componentIds = new Set(components.map((c) => c.id))
  const periodIds = new Set((bundle?.periods ?? []).map((p) => p.id))

  /* --- configuration problems (error): a grade computed on these is wrong,
         not merely incomplete. ------------------------------------------- */
  if (labOn) {
    for (const [track, label] of [[LECTURE, 'Lecture'], [LAB, 'Laboratory']]) {
      const rows = byTrack(components, track)
      if (rows.length && !weightsValid(rows)) {
        add('error', 'weights_invalid', `${label} component weights do not total 100%.`, { track })
      }
    }
  } else if (components.length && !weightsValid(components)) {
    add('error', 'weights_invalid', 'Component weights do not total 100%.')
  }

  /* An assessment pointing at a component or period that no longer exists is
     a score that silently stops counting. Scanned across the whole class, not
     just this period, because an orphan has no period to belong to. */
  const orphans = allAssessments.filter(
    (a) => !componentIds.has(a.component_id) || !periodIds.has(a.period_id),
  )
  if (orphans.length) {
    add(
      'error',
      'orphan_assessment',
      `${orphans.length} assessment${orphans.length === 1 ? '' : 's'} `
        + `(${orphans.map((a) => a.title ?? 'Untitled').join(', ')}) `
        + 'point at a grading component or period that no longer exists, so their scores count toward nothing. '
        + 'Re-map them in Grade Configuration, or delete the column.',
      { assessmentIds: orphans.map((a) => a.id) },
    )
  }

  /* --- nothing to grade yet (warn) ----------------------------------------- */
  if (!assessments.length) {
    add('warn', 'period_empty', 'This period has no assessments yet, so it produces no grade.')
  }

  for (const component of components) {
    const mine = assessments.filter((a) => a.component_id === component.id)
    const label = `${component.name}${labOn ? ` (${componentTrack(component) === LAB ? 'laboratory' : 'lecture'})` : ''}`
    if (!mine.length) {
      add('warn', 'component_no_assessments',
        `${label} has no assessments in this period, so its ${component.weight_percent}% is re-weighted onto the others.`,
        { componentId: component.id })
      continue
    }
    const anyScored = mine.some((a) => students.some((s) => isScored(a.scores?.[s.student_id])))
    if (!anyScored) {
      add('warn', 'component_ungraded',
        `${label} has ${mine.length} assessment${mine.length === 1 ? '' : 's'} but no recorded scores yet — it is left out, not counted as zero.`,
        { componentId: component.id })
    }
  }

  /* A whole track with no graded work: the other track silently carries the
     entire period grade, which is the single most misleading state a
     laboratory class can be in. */
  if (labOn) {
    for (const [track, label] of [[LECTURE, 'Lecture'], [LAB, 'Laboratory']]) {
      const rows = byTrack(components, track)
      if (!rows.length) continue
      const ids = new Set(rows.map((c) => c.id))
      const mine = assessments.filter((a) => ids.has(a.component_id))
      const anyScored = mine.some((a) => students.some((s) => isScored(a.scores?.[s.student_id])))
      if (!anyScored) {
        add('warn', 'track_ungraded',
          `The ${label.toLowerCase()} half has no recorded scores in this period, so the other half carries the whole period grade.`,
          { track })
      }
    }
  }

  /* --- per-assessment grading progress ------------------------------------- */
  for (const a of assessments) {
    if (!componentIds.has(a.component_id)) continue // already reported as an orphan
    const recorded = students.filter((s) => isRecorded(a.scores?.[s.student_id])).length
    if (students.length === 0) break
    if (recorded === 0) {
      add('warn', 'assessment_ungraded',
        `"${a.title ?? 'Untitled'}" has no scores recorded for any of the ${students.length} students.`,
        { assessmentId: a.id })
    } else if (recorded < students.length) {
      add('info', 'assessment_partial',
        `"${a.title ?? 'Untitled'}" is scored for ${recorded} of ${students.length} students.`,
        { assessmentId: a.id, recorded, expected: students.length })
    }
  }

  /* --- per-student progress ------------------------------------------------ */
  const gradable = assessments.filter((a) => componentIds.has(a.component_id))
  const unscored = []
  let fullyScored = 0
  for (const s of students) {
    const n = gradable.filter((a) => isRecorded(a.scores?.[s.student_id])).length
    if (n === 0) unscored.push(s)
    else if (n === gradable.length) fullyScored += 1
  }
  if (gradable.length && unscored.length) {
    const names = unscored.slice(0, 4).map((s) => `${s.last_name}, ${s.first_name}`).join('; ')
    add('warn', 'students_unscored',
      `${unscored.length} student${unscored.length === 1 ? ' has' : 's have'} no recorded score in this period`
        + ` (${names}${unscored.length > 4 ? `, +${unscored.length - 4} more` : ''}).`,
      { studentIds: unscored.map((s) => s.student_id) })
  }

  const counts = {
    students: students.length,
    assessments: assessments.length,
    fullyScored,
    unscored: unscored.length,
  }
  return {
    findings: findings.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level)),
    counts,
    // "Complete" is a statement about data, not about policy: every component
    // carries graded work and every student has a mark. A caller that wants to
    // BLOCK on this must decide that for itself -- nothing here blocks.
    complete: findings.every((f) => f.level === 'info') && !!gradable.length && unscored.length === 0,
  }
}

/** One short line for a header chip: what still needs attention, or null. */
export function describeReadiness(readiness) {
  const errors = readiness.findings.filter((f) => f.level === 'error').length
  const warns = readiness.findings.filter((f) => f.level === 'warn').length
  if (errors) return `${errors} problem${errors === 1 ? '' : 's'} to fix`
  if (warns) return `${warns} thing${warns === 1 ? '' : 's'} need attention`
  if (readiness.complete) return null
  return null
}
