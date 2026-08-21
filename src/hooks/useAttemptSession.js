/**
 * The Firestore half of an attempt's life: opening one, keeping it, closing it.
 *
 * Owned by the logic lane (see OWNERSHIP.md). The rules are in
 * lib/quizAttempts.js; this file only writes.
 *
 * The shape change this introduces: an attempt document used to be created at
 * *submit* time, in one `addDoc`. It is now created when the student presses
 * Start, as `in_progress`, and updated when they submit. That is what makes a
 * timed quiz actually timed -- the deadline is derived from a server-stamped
 * `started_at`, so reloading the page no longer hands back the full clock --
 * and it is what gives reopens and away-events somewhere to be recorded.
 *
 * firestore.rules was widened to match, narrowly: a student may update their
 * own attempt only while it is still `in_progress`, and may not change
 * `student_id`, `quiz_id` or `started_at`.
 */
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { FOCUS_EVENT_CAP, expiryFrom } from '@/lib/quizAttempts'

/**
 * Open an attempt and return it.
 *
 * Two writes and a read, once per sitting. The read is the point: `started_at`
 * is a server timestamp, and a server timestamp cannot be read back from the
 * value you just wrote -- so the document is created, read, and then stamped
 * with a deadline derived from the time the *server* recorded. Computing the
 * deadline from `Date.now()` on the device would let a student with a wound-back
 * clock award themselves extra time on every attempt.
 *
 * The drawn paper is stored now rather than at submit, so that a teacher
 * editing the quiz mid-sitting cannot change the questions under the student.
 */
export async function startAttempt({ quiz, classId, studentId, questions, attemptNumber }) {
  const ref = await addDoc(collection(db, 'quiz_attempts'), {
    quiz_id: quiz.id,
    class_id: classId,
    student_id: studentId,
    module_id: quiz.module_id ?? null,
    attempt_number: attemptNumber,
    question_ids: questions.map((q) => q.id),
    status: 'in_progress',
    started_at: serverTimestamp(),
    reopen_count: 0,
    focus_events: [],
    focus_events_dropped: 0,
  })

  const snap = await getDoc(ref)
  const startedAtMs = snap.data()?.started_at?.toMillis?.() ?? Date.now()
  const expiresAtMs = expiryFrom(startedAtMs, quiz.time_limit_minutes)
  if (expiresAtMs) await updateDoc(ref, { expires_at_ms: expiresAtMs })

  return { id: ref.id, ...snap.data(), expires_at_ms: expiresAtMs ?? null }
}

/**
 * Note that the student came back to an attempt they had left.
 *
 * Counted, not punished. A dropped connection, a flat battery and a deliberate
 * walk-away are indistinguishable from here, and the teacher is the one who
 * should decide what a reopen means. `last_reopened_at` is server-stamped
 * because it is the field a teacher would quote.
 */
export function recordReopen(attemptId, { questionIndex = null, remainingSeconds = null } = {}) {
  return updateDoc(doc(db, 'quiz_attempts', attemptId), {
    reopen_count: increment(1),
    last_reopened_at: serverTimestamp(),
    reopens: arrayUnion({
      at: new Date().toISOString(),
      question_index: questionIndex,
      remaining_seconds: remainingSeconds,
    }),
  })
}

/**
 * Record one away-and-back: the student left this tab or app and returned.
 *
 * `storedCount` is how many events the document already holds. Past the cap the
 * event is counted instead of stored -- an attempt where someone toggled away
 * two hundred times is fully described by "200 times", and an unbounded array
 * on a document every teacher view reads is a cost with no reader.
 *
 * Fire-and-forget by design: the student is mid-quiz, and a failed write here
 * must never interrupt them or lose an answer.
 */
export function recordFocusEvent(attemptId, event, storedCount = 0) {
  const ref = doc(db, 'quiz_attempts', attemptId)
  if (storedCount >= FOCUS_EVENT_CAP) {
    return updateDoc(ref, { focus_events_dropped: increment(1) })
  }
  return updateDoc(ref, { focus_events: arrayUnion(event) })
}

/**
 * Close the attempt with its marks.
 *
 * `expired` records that the clock ran out rather than the student pressing
 * Submit. Both produce a real, graded attempt -- an expired attempt is still
 * the student's work and still counts -- but a teacher looking at a low score
 * should be able to see which of the two happened.
 */
export function finishAttempt(attemptId, { result, answers, expired = false }) {
  return updateDoc(doc(db, 'quiz_attempts', attemptId), {
    answers,
    per_question: result.per_question,
    // total_score is what every teacher view reads; `score` mirrors the
    // documented quiz_attempts schema. Both are required.
    total_score: result.total_score,
    score: result.total_score,
    total_possible: result.total_possible,
    score_ratio: result.score_ratio,
    has_essays_pending: result.has_essays,
    status: result.has_essays ? 'submitted' : 'graded',
    expired_at_submit: expired,
    submitted_at: serverTimestamp(),
  })
}

/**
 * Give one student another attempt at a quiz.
 *
 * A dotted path so two teachers granting to two students cannot overwrite each
 * other, and additive so that changing the class-wide allowance later does not
 * revoke the grant.
 */
export function grantExtraAttempt(quizId, studentId, by = 1) {
  return updateDoc(doc(db, 'quizzes', quizId), {
    [`extra_attempts.${studentId}`]: increment(by),
    updated_at: serverTimestamp(),
  })
}

/**
 * End an attempt the student never submitted.
 *
 * Marked, not deleted. Two reasons. The reopen history and the away-events on
 * this document are the only explanation anyone will ever have for why the
 * sitting was abandoned, and deleting the attempt deletes the explanation. And
 * a teacher who discards the wrong row should be able to see that they did.
 *
 * `discarded` is inert in lib/quizAttempts: neither open nor used. So the
 * student's slot is freed and they can start again -- which is the whole point,
 * because an abandoned untimed attempt otherwise blocks them forever, `Start`
 * resuming it instead of beginning a new one.
 *
 * The security rule permits this because teachers may update any attempt. The
 * same rule then stops the student writing to it: their clause requires the
 * stored status to still be `in_progress`, so a discarded attempt can no longer
 * be submitted over.
 */
export function discardAttempt(attemptId, { teacherId, reason = null } = {}) {
  return updateDoc(doc(db, 'quiz_attempts', attemptId), {
    status: 'discarded',
    discarded_at: serverTimestamp(),
    discarded_by: teacherId ?? null,
    discard_reason: reason,
  })
}
