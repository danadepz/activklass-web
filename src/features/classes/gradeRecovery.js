/**
 * Applying a remediation result back onto the mark it was prescribed for.
 *
 * The policy arithmetic is in lib/remediationRecovery.js; this file is the
 * Firestore half and the audit trail.
 *
 * The audit trail is not optional. A recovery changes a score a teacher
 * already recorded, from a page that is not the record. Without a sibling
 * `recovery` map, the gradebook would be one where marks change with no
 * visible cause -- which is the first thing anyone reviewing the system will
 * ask about, and the first thing a contested grade turns on. `scores` holds
 * what counts; `recovery` holds what it used to be, what raised it, under
 * which policy, and who pressed the button.
 *
 * Computing and writing are separate on purpose: the teacher is shown exactly
 * which students a policy would move, and by how much, before anything is
 * written. Choosing a grade policy blind and finding out afterwards is not a
 * decision anyone should have to make about someone else's report card.
 */
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { syncEntries } from '@/lib/gradebook'
import { attemptForScoring, quizTotalPoints } from '@/lib/quizToRecord'
import { CAPPED_REPLACE, planRecovery, recoveryCap } from '@/lib/remediationRecovery'
import { REMEDIATION_PUBLISHED } from '@/features/classes/remediation'

/**
 * Each student's counted percentage on the practice quiz.
 *
 * Percentage, not raw score: the remediation quiz is a different length from
 * the assessment it repairs, so the only comparable figure is the ratio. The
 * attempt is chosen by the practice quiz's own scoring policy, by the same
 * call the record sync makes -- the two screens must not disagree about what a
 * student scored.
 */
async function remediationPercents(quizId, classId) {
  const quizSnap = await getDoc(doc(db, 'quizzes', quizId))
  if (!quizSnap.exists()) throw new Error('The practice quiz no longer exists.')
  const quiz = { id: quizId, ...quizSnap.data() }
  const total = quizTotalPoints(quiz)
  if (!total) throw new Error('The practice quiz is worth no points.')

  const snap = await getDocs(query(collection(db, 'quiz_attempts'), where('quiz_id', '==', quizId), where('class_id', '==', classId)))
  const byStudent = {}
  snap.docs.forEach((d) => {
    const a = d.data()
    if (a.class_id !== classId) return
    ;(byStudent[a.student_id] ??= []).push(a)
  })

  const pcts = {}
  for (const [studentId, attempts] of Object.entries(byStudent)) {
    const counted = attemptForScoring(attempts, quiz.scoring_attempt)
    if (counted) pcts[studentId] = (Number(counted.total_score) / total) * 100
  }
  return pcts
}

/**
 * The assessments in a class record a recovery could be applied to, and the
 * ceiling this class recovers to.
 *
 * Every assessment is offered, not only the quiz-sourced ones: the failing
 * mark a remediation was prescribed for is often a hand-entered long test, and
 * restricting recovery to rows this system happened to create would make the
 * feature useless in exactly those cases. Locked periods are returned and
 * marked rather than hidden, so the teacher can see why the row they wanted is
 * not selectable.
 *
 * `cap` rides along because it comes off the same gradebook document: the
 * class's own pass mark (recoveryCap), which is what the dialog's Ceiling
 * field starts at. Before this the dialog started at 75 for every class.
 */
export async function loadRecoveryTargets(classId) {
  const gbSnap = await getDoc(doc(db, 'gradebooks', classId))
  const gb = gbSnap.exists() ? gbSnap.data() : {}
  const periods = gb.periods ?? []
  const components = gb.components ?? []

  const snap = await getDocs(collection(db, 'gradebooks', classId, 'assessments'))
  const targets = snap.docs
    .map((d) => {
      const a = d.data()
      const period = periods.find((p) => p.id === a.period_id)
      return {
        id: d.id,
        title: a.title ?? 'Untitled',
        total_points: Number(a.total_points) || 0,
        period_name: period?.name ?? 'Unknown period',
        locked: Boolean(period?.locked),
        component_name: components.find((c) => c.id === a.component_id)?.name ?? '',
        source_quiz_id: a.source_quiz_id ?? null,
        graded_count: Object.values(a.scores ?? {}).filter((s) => s?.status === 'graded').length,
        recovered_count: Object.keys(a.recovery ?? {}).length,
      }
    })
    .sort((a, b) => a.period_name.localeCompare(b.period_name) || a.title.localeCompare(b.title))
  return { targets, cap: recoveryCap(gb) }
}

/**
 * What a policy would do, without writing anything.
 *
 * Three gates, all of which have to hold before a recovery is even computed:
 *
 * - the plan must be **published**, because an unpublished plan is one no
 *   student has been given and no student can have completed;
 * - the grading period must be **unlocked**, matching the record page's own
 *   rule that a locked period is final;
 * - the student must be **targeted by the plan**, so a recovery cannot reach
 *   someone who was never told to remediate.
 *
 * `cap` is the teacher's chosen ceiling; left out, it is the class's own pass
 * mark, read off the gradebook this function loads anyway.
 */
export async function previewRecovery({
  plan,
  classId,
  assessmentId,
  policy = CAPPED_REPLACE,
  cap,
}) {
  if (plan?.status !== REMEDIATION_PUBLISHED) {
    throw new Error('Publish the remediation before recovering marks with it.')
  }
  if (!plan.recommended_quiz_id) {
    throw new Error('This plan has no practice quiz to recover marks from.')
  }

  const snap = await getDoc(doc(db, 'gradebooks', classId, 'assessments', assessmentId))
  if (!snap.exists()) throw new Error('That assessment is no longer in the class record.')
  const assessment = snap.data()

  const gbSnap = await getDoc(doc(db, 'gradebooks', classId))
  const gb = gbSnap.data() ?? {}
  const period = (gb.periods ?? []).find((p) => p.id === assessment.period_id)
  if (period?.locked) {
    throw new Error(`${period.name} is locked — unlock it before recovering marks.`)
  }

  return {
    assessment,
    ...planRecovery({
      targetStudentIds: plan.target_student_ids ?? [],
      scores: assessment.scores ?? {},
      totalPoints: Number(assessment.total_points),
      remediationPctByStudent: await remediationPercents(plan.recommended_quiz_id, classId),
      policy,
      cap: Number.isFinite(cap) ? cap : recoveryCap(gb),
    }),
  }
}

/** Recover marks on one assessment for everyone a published plan targets. */
export async function applyRecoveryToAssessment({
  plan,
  classId,
  assessmentId,
  policy = CAPPED_REPLACE,
  cap,
  teacherId,
}) {
  const { recoveries, notAttempted, noOriginal, noImprovement } = await previewRecovery({
    plan,
    classId,
    assessmentId,
    policy,
    cap,
  })

  const entries = Object.entries(recoveries)
  if (entries.length) {
    // Dotted paths so only the recovered students' keys are touched: a
    // whole-map write would clobber marks the quiz sync or another teacher
    // changed between the read above and this write.
    const updates = {}
    for (const [studentId, result] of entries) {
      updates[`scores.${studentId}`] = { status: 'graded', raw_score: result.applied_score }
      updates[`recovery.${studentId}`] = {
        ...result,
        remediation_id: plan.id,
        remediation_quiz_id: plan.recommended_quiz_id,
        applied_by: teacherId ?? null,
        // Server clock, not the browser's: this is the timestamp anyone
        // auditing a changed grade will read.
        applied_at: serverTimestamp(),
      }
    }
    await updateDoc(doc(db, 'gradebooks', classId, 'assessments', assessmentId), updates)
    try {
      await syncEntries(classId)
    } catch {
      /* Derived; the next record save re-syncs. */
    }
  }

  return {
    applied: entries.length,
    notAttempted: notAttempted.length,
    noOriginal: noOriginal.length,
    noImprovement: noImprovement.length,
  }
}

/**
 * Put one student's original mark back.
 *
 * The counterpart that makes the audit trail worth keeping: a recovery applied
 * under the wrong policy, or to the wrong assessment, has to be undoable
 * without the teacher having to remember what the score used to be. The
 * `recovery` entry is deleted with the same dotted path that wrote it.
 */
export async function revertRecovery({ classId, assessmentId, studentId }) {
  const assessmentRef = doc(db, 'gradebooks', classId, 'assessments', assessmentId)
  const snap = await getDoc(assessmentRef)
  const entry = snap.data()?.recovery?.[studentId]
  if (!entry) throw new Error('There is no recovery recorded for this student.')

  await updateDoc(assessmentRef, {
    [`scores.${studentId}`]: { status: 'graded', raw_score: entry.original_score },
    [`recovery.${studentId}`]: deleteField(),
  })
  try {
    await syncEntries(classId)
  } catch {
    /* Derived; the next record save re-syncs. */
  }
}
