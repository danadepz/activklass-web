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
import { useEffect, useRef, useState } from 'react'
import {
  collection,
  deleteDoc,
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
  // Both fields in the query: the rules let a teacher read an attempt only
  // for a class they own, and they can prove that only from a class_id
  // filter on the query itself. The (quiz_id, class_id) composite index is
  // in the backend's firestore.indexes.json.
  const snap = await getDocs(
    query(collection(db, 'quiz_attempts'), where('quiz_id', '==', quizId), where('class_id', '==', classId)),
  )
  const byStudent = {}
  snap.docs.forEach((d) => {
    const a = d.data()
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

  // Read before writing: a score a teacher typed, or a recovery already
  // applied, must never be recomputed from the attempt underneath it.
  const existingSnap = await getDoc(assessmentRef)
  const existing = existingSnap.exists() ? existingSnap.data() : null

  const { scores, pendingEssays, notTaken, versionMismatch, kept } = quizScoreCells({
    attemptsByStudent: await attemptsByStudentFor(quiz.id, classId),
    students,
    totalPoints,
    // The teacher's choice, not this module's. It used to be hardcoded to the
    // best attempt, which quietly turned every retake into score-farming.
    scoringPolicy: quiz.scoring_attempt,
    existingScores: existing?.scores ?? {},
    existingRecovery: existing?.recovery ?? {},
  })

  await setDoc(
    assessmentRef,
    {
      ...assessmentFromQuiz({ quiz, mapping, totalPoints }),
      // Every student with evidence, plus every kept student's score carried
      // forward unchanged (see quizScoreCells) -- Firestore's merge replaces
      // this whole nested field when the object has no keys at all, so a
      // kept-only sync still has to hand back a non-empty map to avoid
      // wiping the scores it exists to protect. Publishing before anyone has
      // taken the quiz is simply a row with an empty map, which is fine: the
      // field does not exist yet, so there is nothing to wipe.
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
    // `scores` also carries the kept students' unchanged values (see
    // quizScoreCells), so they have to be subtracted back out here --
    // otherwise a kept score would be reported as newly "posted".
    written: Object.keys(scores).length - kept.length,
    pendingEssays: pendingEssays.length,
    notTaken: notTaken.length,
    versionMismatch: versionMismatch.length,
    kept: kept.length,
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
  const totals = { written: 0, pendingEssays: 0, notTaken: 0, versionMismatch: 0, kept: 0 }
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

/**
 * Undo what a publish did: delete the assessment row a quiz created in
 * every class it is mapped to, and re-sync entries so students stop reading
 * a score for a quiz that no longer exists.
 *
 * Checks every mapped class's period *before* deleting anything in any of
 * them. A quiz mapped to two classes where only one has a locked period
 * would otherwise leave the delete half-done -- one class's column gone,
 * the other's still there pointing at a quiz that no longer exists, with no
 * way to finish the job once the quiz doc itself is deleted. So this is all
 * or nothing: any locked period refuses the whole removal and names every
 * class it found locked, for the caller to say before touching Firestore.
 */
export async function removeQuizFromAllRecords({ quiz, classMappings }) {
  const entries = Object.entries(classMappings ?? {})

  const withPeriod = await Promise.all(
    entries.map(async ([classId, mapping]) => {
      const gbSnap = await getDoc(doc(db, 'gradebooks', classId))
      const gb = gbSnap.exists() ? gbSnap.data() : null
      const period = (gb?.periods ?? []).find((p) => p.id === mapping?.grading_period_id)
      return { classId, period }
    }),
  )

  const locked = withPeriod
    .filter(({ period }) => period?.locked)
    .map(({ classId, period }) => ({ classId, periodName: period.name }))
  if (locked.length) return { removed: [], locked }

  const removed = []
  for (const { classId } of withPeriod) {
    await deleteDoc(doc(db, 'gradebooks', classId, 'assessments', assessmentIdForQuiz(quiz.id)))
    try {
      await syncEntries(classId)
    } catch {
      /* Entries are derived; the next record save re-syncs them. */
    }
    removed.push(classId)
  }
  return { removed, locked: [] }
}

/**
 * Post a class's quiz scores on their own, the moment a teacher looks.
 *
 * Owner decision 2026-09-13: quiz marks should reach the class record --
 * and so the student's grade, the Performance tab and the risk snapshot --
 * without a button. A student's device may not write the gradebook (the
 * rules let them read their own `entries` and nothing else), so the trigger
 * is the teacher's screen: the class record page and a quiz's results view
 * both run this on open. It is the same sync the Post scores button runs,
 * and the same rules hold -- a locked period is skipped and said so, an
 * essay stays blank until it is marked, the scoring policy is the quiz's.
 *
 * Runs once per (class, set of quizzes) per mount, so a record page that
 * refetches after the post does not post again; `syncEntries` inside the sync
 * is what makes the student read the new mark. Silent unless it wrote
 * something or had to skip a class -- both are returned for the caller to
 * show in a line, not a toast: the teacher did not press anything.
 */
export function useAutoPostScores({ classId, quizzes = [], enabled = true, onPosted }) {
  const [state, setState] = useState({ status: 'idle', written: 0, kept: 0, skipped: [] })
  const ranFor = useRef('')
  const key = `${classId}|${quizzes.map((q) => q.id).sort().join(',')}`

  useEffect(() => {
    if (!enabled || !classId || quizzes.length === 0 || ranFor.current === key) return
    ranFor.current = key
    let cancelled = false
    setState({ status: 'posting', written: 0, kept: 0, skipped: [] })
    ;(async () => {
      let written = 0
      let kept = 0
      const skipped = []
      for (const quiz of quizzes) {
        try {
          const result = await syncQuizToClassRecord({ quiz, classId, mapping: quiz.class_mappings[classId] })
          if (result.skipped) skipped.push(`${quiz.title}: ${result.skipped}`)
          else {
            written += result.written ?? 0
            kept += result.kept ?? 0
          }
        } catch (err) {
          skipped.push(`${quiz.title}: ${err.message}`)
        }
      }
      if (cancelled) return
      setState({ status: 'done', written, kept, skipped })
      if (written > 0) onPosted?.()
    })()
    return () => {
      cancelled = true
    }
    // `key` stands in for classId + quizzes; onPosted is a callback the
    // caller may rebuild every render and must not retrigger the post.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key])

  return state
}
