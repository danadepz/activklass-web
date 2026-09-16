/**
 * Turning quiz attempts into class-record scores.
 *
 * Pure -- the Firestore writes live in hooks/useQuizRecordSync.js -- because
 * every rule below decides a number that lands on a report card, and those
 * rules need to be arguable without a project attached.
 *
 * Why this exists: the Flask version created an `Assessment` row inside
 * `POST /quizzes/<id>/publish` (see activklass-backend/app/api/quizzes.py),
 * so publishing a quiz put it in the gradebook. When quizzes moved to
 * Firestore the publish modal kept collecting the component/period mapping --
 * it still says it will "create score records in their gradebooks" -- but the
 * mapping was written onto the quiz document and nothing ever read it again.
 * This module is that lost half, rebuilt on Firestore.
 */
import { drawTotalPoints } from '@/lib/quizPool'

/** Attempts that never finished carry no score worth recording. */
const FINISHED = new Set(['graded', 'submitted'])

/** Which of a student's attempts becomes their mark. */
export const SCORING_BEST = 'best'
export const SCORING_LAST = 'last'
export const SCORING_FIRST = 'first'
export const SCORING_AVERAGE = 'average'

/**
 * The policies a teacher picks between, with the reason each exists.
 *
 * `best` is the default because it is what the results tab has always
 * displayed and what this module did before the setting existed -- changing
 * the meaning of existing quizzes would silently restate marks already given.
 */
export const SCORING_POLICIES = [
  { id: SCORING_BEST, label: 'Best attempt', hint: 'Rewards persistence. The default.' },
  { id: SCORING_LAST, label: 'Last attempt', hint: 'Makes a retake re-practice rather than score-farming.' },
  { id: SCORING_FIRST, label: 'First attempt', hint: 'The mark is the first sitting; later ones are practice.' },
  { id: SCORING_AVERAGE, label: 'Average of attempts', hint: 'Every sitting counts. Softens a single bad day.' },
]

const round2 = (n) => Math.round(n * 100) / 100

/** Finished attempts carrying a usable score, in attempt order. */
function scorable(attempts = []) {
  return attempts
    .filter(
      // `!= null` before the coercion: Number(null) is 0, which is finite, so a
      // scoreless attempt would otherwise be recorded as a zero.
      (a) => FINISHED.has(a?.status) && a?.total_score != null && Number.isFinite(Number(a.total_score)),
    )
    .sort((a, b) => (a.attempt_number ?? 0) - (b.attempt_number ?? 0))
}

/**
 * The attempt a recorded score should come from: the student's best.
 *
 * Not the latest. `attempts_allowed` is a teacher setting, the results tab
 * already reports "Best Score", and a record that disagrees with the screen
 * the teacher just looked at is the kind of discrepancy that gets a grade
 * contested. Ties break toward the later attempt so a re-take at the same
 * score still reads as the most recent evidence.
 */
export function bestAttempt(attempts = []) {
  const finished = scorable(attempts)
  if (!finished.length) return null
  return finished.reduce((best, a) => {
    const score = Number(a.total_score)
    const bestScore = Number(best.total_score)
    if (score > bestScore) return a
    if (score < bestScore) return best
    return (a.attempt_number ?? 0) >= (best.attempt_number ?? 0) ? a : best
  })
}

/**
 * The attempt that becomes this student's mark, under the quiz's policy.
 *
 * `average` has no single attempt behind it, so it returns a synthetic one:
 * the mean of the score *ratios*, scaled back onto the most recent attempt's
 * total. Averaging raw scores would be wrong the moment a quiz was edited
 * between sittings -- 8/10 and 8/20 are not the same performance, and their
 * raw mean, 8, is not a number that means anything.
 *
 * The synthetic attempt is marked `derived` so a caller can tell it apart from
 * a real one; it deliberately carries the latest paper's `total_possible`, so
 * the version check downstream still applies.
 */
export function attemptForScoring(attempts = [], policy = SCORING_BEST) {
  const finished = scorable(attempts)
  if (!finished.length) return null

  switch (policy) {
    case SCORING_FIRST:
      return finished[0]
    case SCORING_LAST:
      return finished[finished.length - 1]
    case SCORING_AVERAGE: {
      const latest = finished[finished.length - 1]
      const possible = Number(latest.total_possible)
      const ratios = finished.map((a) => {
        const p = Number(a.total_possible)
        if (Number.isFinite(p) && p > 0) return Number(a.total_score) / p
        // No total on the attempt: fall back to the latest paper's, which is
        // the only total we can defend using.
        return Number.isFinite(possible) && possible > 0 ? Number(a.total_score) / possible : 0
      })
      const mean = ratios.reduce((sum, r) => sum + r, 0) / ratios.length
      return {
        ...latest,
        derived: SCORING_AVERAGE,
        attempts_averaged: finished.length,
        total_score: Number.isFinite(possible) ? round2(mean * possible) : Number(latest.total_score),
        score_ratio: round2(mean * 100) / 100,
      }
    }
    case SCORING_BEST:
    default:
      return bestAttempt(attempts)
  }
}

/**
 * Build the `scores` map for the assessment doc from this quiz's attempts.
 *
 * Three deliberate refusals, each of which would otherwise put a wrong number
 * on a record:
 *
 * - **A student with no attempt is left alone**, not written as 0. The quiz
 *   may still be open, and a blank cell is honest where a zero is a claim.
 *   Teachers can still type the zero themselves once the quiz closes.
 * - **Attempts still holding unmarked essays are skipped.** Their
 *   `total_score` counts the objective items only, so recording it would post
 *   a score that silently rises later -- or worse, does not.
 * - **Attempts taken against a different version of the quiz are skipped.**
 *   If the quiz was edited after publishing, an older attempt was marked out
 *   of a different total and is not comparable to the assessment's
 *   `total_points`.
 *
 * A fourth refusal protects a human decision rather than a data gap: **a
 * student whose current score was typed by a teacher, or came from an
 * applied recovery, is left alone.** Those are read from the assessment's
 * existing `scores`/`recovery` maps, carried into the returned `scores` map
 * unchanged, and reported back as `kept`, so a sync that runs on every page
 * open (`useAutoPostScores`) never quietly restates a mark a person already
 * decided.
 *
 * Carrying the kept value forward, rather than simply leaving that student's
 * key out of the map, matters beyond bookkeeping: the caller writes this
 * whole object onto the assessment's `scores` field with a merge, and
 * Firestore's merge replaces a nested map field wholesale when the map it is
 * given for that field is *empty* -- there is no leaf path to merge on. A
 * class where every student's score is manual or recovered would otherwise
 * compute an empty `scores` object and the write would wipe the very scores
 * this function exists to protect.
 *
 * Each refusal is counted rather than swallowed, so the caller can say why a
 * class of 40 produced 31 scores.
 */
export function quizScoreCells({
  attemptsByStudent = {},
  students = [],
  totalPoints = null,
  scoringPolicy = SCORING_BEST,
  existingScores = {},
  existingRecovery = {},
}) {
  const scores = {}
  const pendingEssays = []
  const notTaken = []
  const versionMismatch = []
  const kept = []

  for (const student of students) {
    const id = student.student_id ?? student.id
    if (existingScores[id]?.manual || existingRecovery[id]) {
      if (existingScores[id]) scores[id] = existingScores[id]
      kept.push(id)
      continue
    }
    const attempts = attemptsByStudent[id] ?? []
    const best = attemptForScoring(attempts, scoringPolicy)

    if (!best) {
      notTaken.push(id)
      continue
    }
    if (best.status === 'submitted' || best.has_essays_pending) {
      pendingEssays.push(id)
      continue
    }
    const possible = Number(best.total_possible)
    if (totalPoints != null && Number.isFinite(possible) && possible !== Number(totalPoints)) {
      versionMismatch.push(id)
      continue
    }
    scores[id] = { status: 'graded', raw_score: Number(best.total_score) }
  }

  return { scores, pendingEssays, notTaken, versionMismatch, kept }
}

/**
 * Deterministic assessment id for a quiz, per class.
 *
 * The alternative -- `addDoc` plus a query on `source_quiz_id` -- makes
 * publishing twice, or publishing and then syncing, create a second row for
 * the same quiz. A derived id makes every write idempotent by construction,
 * and assessments are already scoped to one class by their subcollection.
 */
export const assessmentIdForQuiz = (quizId) => `quiz-${quizId}`

/**
 * The assessment document a quiz becomes.
 *
 * `scores` is deliberately absent: this is merged onto whatever row already
 * exists, and including an empty map here would wipe scores a teacher had
 * already corrected by hand.
 */
export function assessmentFromQuiz({ quiz, mapping, totalPoints }) {
  return {
    title: quiz.title || 'Untitled quiz',
    component_id: mapping.component_id,
    period_id: mapping.grading_period_id,
    kind: 'quiz',
    total_points: totalPoints,
    date_given: null,
    // What makes the row traceable back to the quiz -- and what stops the
    // record page from offering to delete it as if it were hand-entered.
    source_quiz_id: quiz.id,
  }
}

/**
 * Total marks a quiz is out of.
 *
 * Delegates to `drawTotalPoints` so a pooled quiz is marked out of the draw
 * (10 questions) rather than the pool (30). Because a pool must have equal
 * points per question, every student's paper is out of the same total and the
 * version check below still means what it says.
 */
export function quizTotalPoints(quiz) {
  return drawTotalPoints(quiz)
}

/** One sentence for the toast after a sync. */
export function describeSyncResult({ written = 0, pendingEssays = 0, notTaken = 0, versionMismatch = 0, kept = 0 } = {}) {
  const parts = [`${written} score${written === 1 ? '' : 's'} posted to the class record`]
  if (kept) parts.push(`${kept} kept as typed`)
  if (pendingEssays) parts.push(`${pendingEssays} waiting on essay marking`)
  if (notTaken) parts.push(`${notTaken} have not taken it`)
  if (versionMismatch) parts.push(`${versionMismatch} took an earlier version of this quiz`)
  return `${parts.join(' · ')}.`
}

/**
 * The quizzes whose scores a class's record should pick up on its own.
 *
 * Since 2026-09-13 (owner decision) a quiz's scores are posted whenever the
 * teacher opens the class record or the quiz's results, not only when the
 * Post scores button is pressed. The student cannot write the gradebook --
 * the rules let them read only their own `entries` -- so "automatic" means
 * "the next time the teacher looks", and this is what decides which quizzes
 * that look covers: published, assigned to the class, and mapped to a
 * component and period there (a quiz without a mapping has nowhere to land;
 * the button already says so).
 */
export function quizzesToAutoPost(quizzes = [], classId) {
  if (!classId) return []
  return quizzes.filter(
    (q) =>
      q?.status === 'published' &&
      (q.class_ids ?? []).includes(classId) &&
      !!q.class_mappings?.[classId],
  )
}
