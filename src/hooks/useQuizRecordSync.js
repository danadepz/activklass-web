/**
 * Writing a published quiz, and its scores, into the class record.
 *
 * Owned by the logic lane (see OWNERSHIP.md). The rules live in
 * lib/quizToRecord.js; this file is only the Firestore half.
 *
 * The publish modal has always collected a component and a grading period per
 * class, and has always told the teacher it would "create score records in
 * their gradebooks". On Flask it did -- `POST /quizzes/<id>/publish` built an
 * `Assessment` row before flipping the status. After the move to Firestore the
 * mapping was written to `quizzes/{id}.class_mappings` and read by nothing, so
 * the promise in the dialog stopped being true and every quiz mark went back
 * to being typed in by hand on the record page.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { fetchUsersByIds } from '@/lib/roster'
import { syncEntries } from '@/lib/gradebook'
import {
  assessmentFromQuiz,
  assessmentIdForQuiz,
  quizScoreCells,
  quizTotalPoints,
} from '@/lib/quizToRecord'

/** Attempts for one quiz in one class, keyed by student. */
async function attemptsByStudentFor(quizId, classId) {
  const snap = await getDocs(
    query(collection(db, 'quiz_attempts'), where('quiz_id', '==', quizId)),
  )
  const byStudent = {}
  snap.docs.forEach((d) => {
    const a = d.data()
    // Filtered in memory rather than as a second `where`: a two-field query
    // needs a composite index, and a quiz's attempts are one class-sized set.
    if (a.class_id !== classId) return
    ;(byStudent[a.student_id] ??= []).push(a)
  })
  return byStudent
}

/**
 * Create or refresh one class's record row for a quiz, and post its scores.
 *
 * `setDoc(..., { merge: true })` on a derived id is what makes this safe to
 * call from both publish and the results tab: the second call updates the row
 * the first one made instead of adding a twin. Scores are merged key by key,
 * so a mark a teacher corrected by hand for a student who has no attempt
 * survives -- only students this sync actually has evidence for are touched.
 *
 * Returns the per-student counts for the toast, plus `skipped` when the
 * gradebook will not accept the row at all.
 */
export async function syncQuizToClassRecord({ quiz, classId, mapping }) {
  const gbSnap = await getDoc(doc(db, 'gradebooks', classId))
  const gb = gbSnap.exists() ? gbSnap.data() : null
  if (!gb?.configured) {
    return { skipped: 'This class has no Grade Config yet.' }
  }

  const period = (gb.periods ?? []).find((p) => p.id === mapping?.grading_period_id)
  const component = (gb.components ?? []).find((c) => c.id === mapping?.component_id)
  if (!period || !component) {
    return { skipped: 'The grading period or component no longer exists.' }
  }
  // Matches the record page's own rule, and the Flask endpoint's before it: a
  // locked period is final. Writing into one would change a grade the teacher
  // has already declared finished, from a screen that does not show it.
  if (period.locked) {
    return { skipped: `${period.name} is locked — unlock it to post these scores.` }
  }

  const totalPoints = quizTotalPoints(quiz)
  const assessmentRef = doc(db, 'gradebooks', classId, 'assessments', assessmentIdForQuiz(quiz.id))

  const classSnap = await getDoc(doc(db, 'classes', classId))
  const studentIds = classSnap.exists() ? (classSnap.data().student_ids ?? []) : []
  const students = studentIds.length ? await fetchUsersByIds(studentIds) : []

  const { scores, pendingEssays, notTaken, versionMismatch } = quizScoreCells({
    attemptsByStudent: await attemptsByStudentFor(quiz.id, classId),
    students,
    totalPoints,
    // The teacher's choice, not this module's. It used to be hardcoded to the
    // best attempt, which quietly turned every retake into score-farming.
    scoringPolicy: quiz.scoring_attempt,
  })

  await setDoc(
    assessmentRef,
    {
      ...assessmentFromQuiz({ quiz, mapping, totalPoints }),
      // Only the students with evidence; an empty map here would still merge
      // cleanly, which is why publishing before anyone has taken the quiz is
      // simply a row with no scores.
      scores,
      created_at: serverTimestamp(),
      synced_at: serverTimestamp(),
    },
    { merge: true },
  )

  // `entries` is the only grade document the student can read, and it is
  // derived from the assessments above. Without this the teacher sees the
  // posted scores and the student still sees the class as ungraded.
  try {
    await syncEntries(classId)
  } catch {
    /* Entries are derived; the next record save re-syncs them. Failing the
       whole post over this would lose scores that did land. */
  }

  return {
    written: Object.keys(scores).length,
    pendingEssays: pendingEssays.length,
    notTaken: notTaken.length,
    versionMismatch: versionMismatch.length,
  }
}

/**
 * Run the sync for every class the quiz is mapped to.
 *
 * Failures are collected, not thrown: with three classes mapped, the second
 * one having a locked period should not cost the first and third their
 * scores, and the teacher needs to be told which class was left out.
 */
export async function syncQuizToAllRecords({ quiz, classMappings }) {
  const totals = { written: 0, pendingEssays: 0, notTaken: 0, versionMismatch: 0 }
  const skipped = []

  for (const [classId, mapping] of Object.entries(classMappings ?? {})) {
    try {
      const result = await syncQuizToClassRecord({ quiz, classId, mapping })
      if (result.skipped) {
        skipped.push(result.skipped)
        continue
      }
      for (const key of Object.keys(totals)) totals[key] += result[key] ?? 0
    } catch (err) {
      skipped.push(err.message)
    }
  }

  return { ...totals, skipped }
}
