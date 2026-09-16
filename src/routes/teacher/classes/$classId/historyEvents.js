/**
 * The class record's slice of the Logs page: assessment and gradebook
 * documents turned into activity events.
 *
 * Pure and Firebase-free on purpose -- `history.jsx` imports `@/lib/firebase`
 * at module scope for every other read on the page, which needs a live
 * project to run and is why nothing there has a test today. Lifting just the
 * event shaping out here, the way `lib/quizToRecord.js` keeps its rules apart
 * from `hooks/useQuizRecordSync.js`'s Firestore calls, makes it testable
 * without one.
 *
 * There is no audit_logs collection (see history.jsx's own note on
 * `loadHistory`): an assessment document is asked to carry its own history
 * instead, in `changes` (stamped by the class record's `saveAll` on every
 * save with a dirty cell) and the gradebook document's `override_changes`.
 * Neither field records what a score used to be -- only what changed and
 * when.
 */

function toDate(ts) {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000)
  if (typeof ts === 'string') {
    const d = new Date(ts)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * One assessment document (gradebooks/{classId}/assessments/{id}) into the
 * events it carries: "Added assessment" from its own `created_at`, "Quiz
 * scores posted" from `synced_at` on a quiz-linked column, and one "Scores
 * recorded" per entry in `changes`.
 */
export function assessmentEvents(assessment) {
  const events = []
  const title = assessment.title ?? 'Untitled'

  const created = toDate(assessment.created_at)
  if (created) {
    events.push({ ts: created, kind: 'record', actor: 'You', summary: `Added assessment · ${title}`, detail: `/${assessment.total_points ?? 0}` })
  }

  if (assessment.source_quiz_id) {
    const synced = toDate(assessment.synced_at)
    if (synced) {
      events.push({ ts: synced, kind: 'record', actor: 'You', summary: `Quiz scores posted · ${title}`, detail: null })
    }
  }

  for (const change of assessment.changes ?? []) {
    const ts = toDate(change.at)
    if (!ts) continue
    const n = change.student_ids?.length ?? 0
    events.push({ ts, kind: 'record', actor: 'You', summary: `Scores recorded · ${title} · ${n} student${n === 1 ? '' : 's'}`, detail: null })
  }

  return events
}

/**
 * A gradebook document's `override_changes` into events -- one per saved
 * override edit, naming the students it touched (from `nameById`, already
 * built from the class roster) rather than the whole gradebook.
 */
export function overrideEvents(gb, nameById = {}) {
  const events = []
  for (const change of gb?.override_changes ?? []) {
    const ts = toDate(change.at)
    if (!ts) continue
    const names = (change.student_ids ?? []).map((id) => nameById[id] ?? 'A student').join(', ')
    const period = gb.periods?.find((p) => p.id === change.period_id)?.name ?? 'a period'
    events.push({ ts, kind: 'record', actor: 'You', summary: `Override set · ${names || 'a student'}`, detail: period })
  }
  return events
}
