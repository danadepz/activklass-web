/**
 * Whether a wording edit to a published quiz is safe to save (T-74,
 * maykel_64440-91 / triplecookiemonster-92).
 *
 * A published quiz has already been sat, so anything besides the words a
 * student reads is off limits: a question's id and type, its points, and --
 * for multiple choice -- which option is marked correct. Any of those needs
 * a regrade of every finished attempt (the player and the score sync both
 * read them), which is a bigger, separate piece of work; this is what keeps
 * a small "fix the typo" edit from silently becoming that.
 *
 * Pure and Firebase-free so it is testable without a project behind it --
 * see historyEvents.js (Class detail lane) for the same reasoning.
 */
export function wordingEditError(before = [], after = []) {
  if (before.length !== after.length) {
    return 'Questions cannot be added or removed here.'
  }
  const byId = new Map(before.map((q) => [q.id, q]))
  for (const q of after) {
    const orig = byId.get(q.id)
    if (!orig) return 'A question here does not match the published quiz.'
    if (orig.qtype !== q.qtype) return `"${orig.text}" cannot change question type here.`
    if (Number(orig.points) !== Number(q.points)) return `"${orig.text}" cannot change its points here.`
    if (orig.qtype === 'mcq') {
      const origOptions = orig.options ?? []
      const newOptions = q.options ?? []
      if (origOptions.length !== newOptions.length) {
        return `"${orig.text}" cannot add or remove an option here.`
      }
      for (let i = 0; i < origOptions.length; i += 1) {
        if ((origOptions[i].id ?? null) !== (newOptions[i].id ?? null)) {
          return `"${orig.text}"'s options cannot be reordered here.`
        }
        if (!!origOptions[i].is_correct !== !!newOptions[i].is_correct) {
          return `"${orig.text}" cannot change which option is correct here.`
        }
      }
    } else if (JSON.stringify(orig.answer_key ?? null) !== JSON.stringify(q.answer_key ?? null)) {
      return `"${orig.text}" cannot change its answer key here.`
    }
  }
  return null
}

/**
 * Applies a wording edit to a quiz's questions for saving (T-74). `edits` is
 * the modal's row state -- `{ text, options: [{ text }] }` per question, in
 * question order.
 *
 * A question with no `options` key (short_answer, essay, true_false...) must
 * come out with no `options` key either -- writing `options: undefined`
 * passes `wordingEditError` (it never looks at options for a non-mcq
 * question) but is refused client-side by the Firestore SDK before the
 * write ever reaches the rules, which surfaced to the teacher as a generic
 * connection error. Only touch `options` when the original question had it.
 */
export function applyWordingEdits(questions = [], edits = []) {
  return questions.map((q, i) => {
    const next = { ...q, text: edits[i]?.text ?? q.text }
    if (q.options) {
      next.options = q.options.map((o, k) => ({ ...o, text: edits[i]?.options?.[k]?.text ?? o.text }))
    }
    return next
  })
}

/**
 * The sentence that refuses "Back to draft" once anyone has started the
 * quiz -- exact count, so the teacher knows why closing it is the option
 * left. `null` when there is nothing to refuse.
 */
export function backToDraftRefusal(startedCount) {
  if (!startedCount) return null
  return `${startedCount} student${startedCount === 1 ? ' has' : 's have'} already started this quiz, so it can't go back to a draft. Close it instead, or fix the wording below.`
}

/**
 * Applies a scoring edit to a published quiz's questions (T-261). `edits` is
 * one row per question, in order: `{ points, correct, tf, answersText }` --
 * `correct` is the mcq option id marked right, `tf` the true/false answer,
 * `answersText` the accepted short answers one per line. Text, ids, types and
 * option order never change here; that is what lets the server regrade an
 * attempt against the same paper it sat.
 */
export function applyScoringEdits(questions = [], edits = []) {
  return questions.map((q, i) => {
    const e = edits[i] ?? {}
    const next = { ...q, points: Number(e.points ?? q.points) }
    if (q.qtype === 'mcq' && e.correct != null) {
      next.options = (q.options ?? []).map((o) => ({ ...o, is_correct: o.id === e.correct }))
    } else if (q.qtype === 'true_false' && typeof e.tf === 'boolean') {
      next.answer_key = { value: e.tf }
    } else if (q.qtype === 'short_answer' && typeof e.answersText === 'string') {
      next.answer_key = { answers: e.answersText.split('\n').map((s) => s.trim()).filter(Boolean) }
    }
    return next
  })
}

/**
 * The warning a teacher reads before a regrade (T-261), from the server's
 * preview. Names how many students finished, how many marks move, and each
 * one that moves -- never "some scores may change".
 */
export function describeRegrade(preview, nameOf = (id) => id) {
  const { students = 0, finished_attempts: finished = 0, in_progress: open = 0, attempts = [] } = preview ?? {}
  const moved = attempts.filter((a) => a.changed)
  const lines = []
  if (!finished) {
    lines.push('No student has finished this quiz yet, so no mark changes.')
  } else {
    lines.push(
      `${students} student${students === 1 ? ' has' : 's have'} finished this quiz (${finished} attempt${finished === 1 ? '' : 's'}). ` +
        (moved.length
          ? `Saving will change ${moved.length} of those marks:`
          : 'None of their marks change.'),
    )
    for (const a of moved) {
      lines.push(`${nameOf(a.student_id)}, attempt ${a.attempt_number ?? '?'}: ${a.before ?? 0}/${a.before_possible ?? 0} → ${a.after}/${a.after_possible}`)
    }
  }
  if (open) {
    lines.push(`${open} student${open === 1 ? ' is' : 's are'} taking it now and will be marked with the new answers when they submit.`)
  }
  return lines
}
