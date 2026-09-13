/**
 * Where a quiz or a class task lands in the class record.
 *
 * Owner decision 2026-09-13: a quiz, activity, assignment or exam should
 * connect to a grade component on its own. Two halves:
 *
 *  - `suggestMapping` guesses the component from the *kind* and the
 *    component's *name* -- a quiz to "Quizzes" or "Written Works", an
 *    activity to "Performance Tasks", an exam to "Quarterly Assessment" or
 *    "Major Exam" -- and the first period that is not locked. A guess, shown
 *    in a select the teacher can change; never stored as a rule. Component
 *    names are the teacher's own (DepEd's three, CHED's two, or whatever
 *    Grade Config was given), so a stored per-kind default would need a new
 *    gradebook field through POST /api/grading-setup (cross-repo, the T-45
 *    trap); a name match gets the pre-fill for nothing and misses only on
 *    unusual names, where the teacher picks once.
 *
 *  - `assessmentFromTask` is the record column a published task creates,
 *    the way `assessmentFromQuiz` does for a quiz. Scores are typed on the
 *    record page as before -- a task has no answer key -- but the column is
 *    already there with the right title, points, component and period,
 *    instead of being typed a second time under + Add assessment.
 *
 * Pure. The writes live in lib/classTasks.js (tasks) and
 * hooks/useQuizRecordSync.js (quizzes).
 */

/**
 * Name patterns per kind, in the order to try them. `assignment` shares the
 * activity list: on DepEd's scale both are Performance Tasks, and on CHED's
 * both are Class Standing. The last pattern of each list is the broad one.
 */
const NAME_PATTERNS = {
  quiz: [/quiz/i, /written/i, /\bww\b/i, /class standing/i],
  activity: [/performance/i, /activit/i, /\bpt\b/i, /class standing/i],
  assignment: [/assign/i, /performance/i, /activit/i, /\bpt\b/i, /class standing/i],
  exam: [/exam/i, /quarterly/i, /major/i, /periodic/i, /final/i],
  other: [],
}

/** The component whose name best fits the kind, else the first one. */
export function suggestComponent(components = [], kind) {
  if (!components.length) return null
  for (const re of NAME_PATTERNS[kind] ?? []) {
    const hit = components.find((c) => re.test(c?.name ?? ''))
    if (hit) return hit
  }
  return components[0]
}

/** The first period still open for scores, else the first one. */
export function suggestPeriod(periods = []) {
  if (!periods.length) return null
  return periods.find((p) => !p?.locked) ?? periods[0]
}

/**
 * A `{ component_id, grading_period_id }` for the dialog to open on, or null
 * when the gradebook is not set up -- the same condition the quiz publish
 * modal calls hasGradeConfig.
 */
export function suggestMapping(gradebook, kind) {
  if (!gradebook?.configured || !gradebook.components?.length || !gradebook.periods?.length) return null
  return {
    component_id: suggestComponent(gradebook.components, kind).id,
    grading_period_id: suggestPeriod(gradebook.periods).id,
  }
}

/** The record row's id for a task -- derived, so a re-publish merges into it. */
export function assessmentIdForTask(taskId) {
  return `task-${taskId}`
}

/**
 * Whether a task has what a record column needs: a component, a period and
 * points to be out of. Without points there is nothing to score against; the
 * dialog says so beside the field.
 */
export function taskCountsTowardRecord(task) {
  return !!task?.component_id && !!task?.grading_period_id && Number(task?.points) > 0
}

/**
 * The record column a published task creates. `scores` is deliberately
 * absent, as in assessmentFromQuiz: merged onto an existing row, an empty
 * map would wipe marks already typed.
 */
export function assessmentFromTask(task) {
  return {
    title: task.title || 'Untitled task',
    component_id: task.component_id,
    period_id: task.grading_period_id,
    kind: task.kind ?? 'other',
    total_points: Number(task.points),
    // The date part of the deadline, which is what the record's date column
    // means for a hand-entered row.
    date_given: task.due_at ? String(task.due_at).slice(0, 10) : null,
    // Traceable back to the task, and what tells the record page this
    // column is reproducible rather than hand-entered.
    source_task_id: task.id,
  }
}
