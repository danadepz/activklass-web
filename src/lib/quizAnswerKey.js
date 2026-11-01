/**
 * Keeping the answers out of the quiz document (Group 7, audit F-06).
 *
 * `quizzes/{quizId}` is readable by every signed-in account and has to stay
 * that way -- the student class page lists it with
 * `where('class_ids','array-contains', classId)`, and a rule that scopes the
 * read through a `get()` cannot be evaluated for that query. The full
 * reasoning, and the emulator result that proved it, is in firestore.rules.
 *
 * So the quiz document stops carrying the answers instead:
 *
 *     quizzes/{quizId}     question text, option text, points, matching terms
 *     quiz_keys/{quizId}   which option is right -- teachers and the API only
 *
 * Ported from app/services/quiz_answer_keys.py, which the grading endpoint and
 * the migration both use. The two must agree about the shape; the Python copy
 * is the original.
 *
 * What stays in the quiz document, deliberately: an essay's `rubric`. It is
 * grading guidance rather than an answer, and the student is already shown it
 * on the feedback page -- moving it would buy no confidentiality and would
 * blank that panel for every historical attempt.
 */
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Split questions into the student-visible half and the protected half.
 *
 * Returns `{ questions, keys }`. Idempotent: splitting already-public
 * questions yields key entries with nothing in them, so a double save cannot
 * overwrite a good key with an empty one.
 *
 * Matching is the exception that needs care. The player has to render one row
 * per left-hand term and offer the right-hand terms as choices, so those
 * cannot live only in the key -- they are denormalised onto the public
 * question as `matching: { lefts, rights }`, UNPAIRED, with `rights` sorted
 * rather than left in pair order so the ordering itself does not give the
 * mapping away.
 */
export function splitQuestions(questions = []) {
  const keys = {}
  const publicQuestions = (questions ?? []).map((q) => {
    const qid = String(q.id)
    const entry = { id: qid, qtype: q.qtype }
    const { answer_key: answerKey, ...rest } = q
    const clean = { ...rest }

    if (q.qtype === 'mcq') {
      const correct = []
      clean.options = (q.options ?? []).map((o) => {
        const { is_correct: isCorrect, ...opt } = o
        if (isCorrect) correct.push(o.id)
        return opt
      })
      // Only recorded when this question actually named one -- see above.
      if (correct.length) entry.correct_option_ids = correct
    }

    if (answerKey != null) entry.answer_key = answerKey

    if (q.qtype === 'matching') {
      const pairs = answerKey?.pairs ?? []
      if (pairs.length) {
        clean.matching = {
          lefts: pairs.map((p) => p.left),
          rights: [...new Set(pairs.map((p) => String(p.right ?? '')))].sort(),
        }
      }
    }

    keys[qid] = entry
    return clean
  })
  return { questions: publicQuestions, keys }
}

/**
 * Put the key material back on the questions, for teacher views.
 *
 * Returns the shape the builder, the preview and the results panels already
 * read -- `options[].is_correct` and `answer_key` -- which is why those screens
 * needed no rewriting for the split, only a merge on load.
 *
 * A question with no key entry comes back unchanged rather than blanked: a
 * quiz half-written by an older client must still show the answers it does
 * have.
 */
export function mergeQuestions(questions = [], keys = {}) {
  return (questions ?? []).map((q) => {
    const entry = (keys ?? {})[String(q.id)]
    if (!entry) return q
    const out = { ...q }
    if (q.qtype === 'mcq' && entry.correct_option_ids) {
      const correct = new Set(entry.correct_option_ids)
      out.options = (q.options ?? []).map((o) => ({ ...o, is_correct: correct.has(o.id) }))
    }
    if (entry.answer_key !== undefined) out.answer_key = entry.answer_key
    return out
  })
}

/** True if any question still carries key material in the quiz document. */
export function hasInlineKeys(questions = []) {
  return (questions ?? []).some(
    (q) => q?.answer_key != null || (q?.options ?? []).some((o) => 'is_correct' in (o ?? {})),
  )
}

export class QuizKeyReadError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'QuizKeyReadError'
    this.cause = cause
  }
}

export class QuizKeyNotFoundError extends Error {
  constructor(quizId) {
    super(`Answer key for quiz "${quizId}" does not exist`)
    this.name = 'QuizKeyNotFoundError'
    this.quizId = quizId
  }
}

export class QuizKeyMalformedError extends Error {
  constructor(quizId, reason = 'invalid format') {
    super(`Answer key for quiz "${quizId}" is malformed: ${reason}`)
    this.name = 'QuizKeyMalformedError'
    this.quizId = quizId
  }
}

/** The key map for a quiz. Direct get, never a list (see firestore.rules).
 * Fail-closed: distinguishes success, not found, read failure, and malformed (G7-02).
 */
export async function loadAnswerKey(quizId) {
  let snap
  try {
    snap = await getDoc(doc(db, 'quiz_keys', quizId))
  } catch (err) {
    throw new QuizKeyReadError(`Failed to load answer key for quiz "${quizId}": ${err?.message || err}`, err)
  }
  if (!snap.exists()) {
    return null
  }
  const data = snap.data()
  if (!data || typeof data !== 'object') {
    throw new QuizKeyMalformedError(quizId, 'document data is not an object')
  }
  if (data.keys !== undefined && (typeof data.keys !== 'object' || data.keys === null)) {
    throw new QuizKeyMalformedError(quizId, 'keys field is not an object')
  }
  return data.keys ?? {}
}

/**
 * Load a quiz with its answers attached, for a teacher.
 *
 * Legacy (unmigrated) quizzes still hold their keys inline and are returned
 * as-is with no second read. Checked in that order, the same order as
 * `questions_for_grading()` on the server, so both sides of the migration look
 * identical to every caller.
 */
export async function loadQuizWithKey(quizId) {
  const snap = await getDoc(doc(db, 'quizzes', quizId))
  if (!snap.exists()) return null
  const quiz = { id: snap.id, ...snap.data() }
  return attachKeyIfNeeded(quiz)
}

/** `loadQuizWithKey`'s second half, for callers that already have the document. */
export async function attachKeyIfNeeded(quiz) {
  if (!quiz) return quiz
  const questions = quiz.questions ?? []
  if (!questions.length || hasInlineKeys(questions)) {
    return { ...quiz, _keyLoaded: true }
  }
  const hasObjective = questions.some((q) => q?.qtype !== 'essay')
  if (!hasObjective) {
    // Legitimately keyless/essay-only quizzes require no separated key document (V-05)
    return { ...quiz, _keyLoaded: true }
  }
  const keys = await loadAnswerKey(quiz.id)
  if (keys === null) {
    throw new QuizKeyNotFoundError(quiz.id)
  }
  return { ...quiz, questions: mergeQuestions(questions, keys), _keyLoaded: true }
}

/**
 * Write a quiz and its answer key as one batch.
 *
 * One batch, not two writes, because the alternative is a window in which the
 * quiz has new questions and the key still answers the old ones -- every
 * student sitting it in that window would be graded against the wrong paper.
 * A batch cannot half-apply, so that window does not exist.
 *
 * `fields` is everything else going onto the quiz document (title, class_ids,
 * status, ...). `questions` is the full question list WITH answers, exactly as
 * the builder holds it; the split happens here so no caller can forget it.
 *
 * `merge` is false for a create (`setDoc`) and true for an edit, matching what
 * the call sites did before. The key document is always a full `set` with no
 * merge: a question deleted from the quiz must lose its key, and merging would
 * leave the stale entry behind -- which is not just untidy, it is a key for a
 * question that no longer exists sitting in a document a teacher can read.
 */
export function writeQuizWithKey(
  quizId,
  fields,
  questions,
  { teacherId, schoolId = null, merge = false, keyLoaded, quiz } = {},
) {
  // Proven key-loaded state is load-bearing for updating existing separated quizzes (V-06).
  // A create (merge = false) creates a new quiz and key atomically, so prior load is not required.
  // An update (merge = true) MUST have proof of successful prior key load.
  const isLoaded = keyLoaded === true || quiz?._keyLoaded === true
  if (merge && !isLoaded) {
    throw new QuizKeyReadError(
      `Refusing to update quiz "${quizId}": proven key-loaded state is required for existing quizzes.`,
    )
  }
  if (keyLoaded === false) {
    throw new QuizKeyReadError(`Refusing to write quiz "${quizId}": prior answer key read failed.`)
  }
  const split = splitQuestions(questions)
  const batch = writeBatch(db)
  const quizRef = doc(db, 'quizzes', quizId)
  const payload = { ...fields, questions: split.questions, updated_at: serverTimestamp() }
  if (merge) batch.update(quizRef, payload)
  else batch.set(quizRef, payload)
  batch.set(doc(db, 'quiz_keys', quizId), {
    quiz_id: quizId,
    // The rules scope every read and write off this field, so it is not
    // optional -- a key document without it is unreadable by its own owner.
    teacher_id: teacherId ?? fields.teacher_id ?? null,
    school_id: schoolId ?? fields.school_id ?? null,
    class_ids: fields.class_ids ?? [],
    keys: split.keys,
    updated_at: serverTimestamp(),
  })
  return batch.commit()
}

/**
 * Delete a quiz and its answer key together.
 *
 * Batched for the same reason the write is, in the other direction: a key
 * document left behind by a deleted quiz is an orphan nobody will ever look
 * for, holding the answers to a paper that no longer exists.
 */
export function deleteQuizWithKey(quizId) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'quizzes', quizId))
  batch.delete(doc(db, 'quiz_keys', quizId))
  return batch.commit()
}
