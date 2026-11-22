/**
 * Official quiz excusals (2026-11-22 academic policy A4 / B5 / C6).
 *
 * `classes/{classId}/quiz_excusals/{quizId}_{studentId}` says whether the
 * class's teacher has excused one student from one quiz. Granting and revoking
 * flip `excused`; nothing is deleted and no attempt, score or assignment is
 * touched. Each change is written in one transaction with an immutable event
 * in `quiz_excusal_events`, and firestore.rules refuses either without the
 * other. Only the class's teacher writes them or reads the events -- a school
 * admin has no access (C6); a student may read their own excusal state.
 *
 * An excused quiz leaves the missing-work numerator AND denominator
 * (riskSignals.missedQuizCounts / workEvidence); nothing else changes.
 */
import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'

export const excusalId = (quizId, studentId) => `${quizId}_${studentId}`

/** Grant (`excused: true`) or revoke (`false`) one excusal, with its event. */
export async function setQuizExcusal(db, classId, actorUid, { quizId, studentId, excused, reason }) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'classes', classId, 'quiz_excusals', excusalId(quizId, studentId))
    const snap = await tx.get(ref)
    const current = snap.exists() ? snap.data().excused === true : false
    if (current === excused) throw new Error(excused ? 'This student is already excused from this quiz.' : 'This student is not excused from this quiz.')
    const eventRef = doc(collection(db, 'classes', classId, 'quiz_excusal_events'))
    tx.set(ref, {
      quiz_id: quizId, student_id: studentId, excused,
      updated_by: actorUid, updated_at: serverTimestamp(), last_event_id: eventRef.id,
    })
    const event = { quiz_id: quizId, student_id: studentId, action: excused ? 'grant' : 'revoke', actor_uid: actorUid, at: serverTimestamp() }
    const why = String(reason ?? '').trim().slice(0, 500)
    if (why) event.reason = why
    tx.set(eventRef, event)
    return eventRef.id
  })
}

/** Teacher: every excusal state in the class, as { [studentId]: Set(quizId) } of the excused ones. */
export async function fetchClassExcusals(db, classId) {
  const snap = await getDocs(collection(db, 'classes', classId, 'quiz_excusals'))
  return excusedByStudent(snap.docs.map((d) => d.data()))
}

/** Student: their own excused quiz ids in one class (the rule needs the filter). */
export async function fetchMyExcusals(db, classId, studentId) {
  const snap = await getDocs(query(collection(db, 'classes', classId, 'quiz_excusals'), where('student_id', '==', studentId)))
  return excusedByStudent(snap.docs.map((d) => d.data()))[studentId] ?? new Set()
}

export function excusedByStudent(rows) {
  const out = {}
  for (const r of rows ?? []) if (r?.excused) (out[r.student_id] ??= new Set()).add(r.quiz_id)
  return out
}

/** Teacher only: grant/revoke history, newest first; one quiz when `quizId` is given. */
export async function fetchExcusalEvents(db, classId, quizId) {
  const base = collection(db, 'classes', classId, 'quiz_excusal_events')
  const snap = await getDocs(quizId ? query(base, where('quiz_id', '==', quizId)) : base)
  const millis = (t) => (t?.toMillis ? t.toMillis() : 0)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b.at) - millis(a.at))
}
