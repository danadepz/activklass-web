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
