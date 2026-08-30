/**
 * Remediation as its own record, editable and publishable on its own terms.
 *
 * Before this, "remediation" was only a side effect: scaffolds.jsx generated a
 * quiz and dropped the teacher into the quiz editor, so Edit Remediation and
 * Publish Remediation were really Edit Quiz and Publish Quiz. A teacher could
 * not revise the guidance, change who it targets, or hold it back before
 * students saw it.
 *
 * How publication is enforced
 * ---------------------------
 * Students read `remediations` with `where('student_id', '==', uid)`, and
 * firestore.rules grants read on `resource.data.student_id == request.auth.uid`.
 * So a document with NO student_id is invisible to every student, by both the
 * query and the rule.
 *
 * A draft is therefore one parent document carrying `target_student_ids` and no
 * `student_id`. Publishing fans it out into one document per targeted student,
 * each with `student_id` set. Unpublishing deletes those and leaves the parent.
 *
 * That shape was chosen because it needs no change to the student pages, the
 * mobile app, or the security rules — none of which this lane owns. The
 * alternative (a `status` filter on the student side) would have left drafts
 * readable by anyone who queried directly.
 */
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const REMEDIATION_DRAFT = 'draft'
export const REMEDIATION_PUBLISHED = 'published'

/** Marks the parent record. Absence of `student_id` is what hides it. */
const PARENT_KIND = 'plan'
const ASSIGNMENT_KIND = 'assignment'

/**
 * Every remediation record for a class, split into the plans a teacher manages
 * and the per-student assignments a plan has produced.
 *
 * Assignments are counted, not listed: the teacher acts on the plan, and a
 * class of forty would otherwise bury it.
 */
export async function loadClassRemediations(classId) {
  const snap = await getDocs(
    query(collection(db, 'remediations'), where('class_id', '==', classId)),
  )
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

  const plans = all
    .filter((r) => r.kind === PARENT_KIND)
    .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0))

  const assignmentsByPlan = {}
  for (const row of all) {
    if (row.kind === PARENT_KIND || !row.plan_id) continue
    ;(assignmentsByPlan[row.plan_id] ??= []).push(row)
  }

  return {
    plans: plans.map((plan) => ({
      ...plan,
      assignments: assignmentsByPlan[plan.id] ?? [],
    })),
    /* Records written by /api/remediate before plans existed, and any older
       rows. Surfaced separately so they are visible rather than silently
       ignored -- they are already live for the student who owns them. */
    legacy: all.filter((r) => r.kind == null && r.student_id),
  }
}

/** A new plan, held back from students until it is published. */
export function createRemediationPlan({
  classId,
  teacherId,
  topicId,
  topicTitle,
  guidance = '',
  quizId = null,
  targetStudentIds = [],
  mastery = null,
}) {
  return addDoc(collection(db, 'remediations'), {
    kind: PARENT_KIND,
    // Deliberately absent: student_id. Setting it here would publish the draft
    // the moment it was created.
    class_id: classId,
    created_by: teacherId,
    topic_id: topicId ?? null,
    topic: topicTitle,
    title: `Remediation · ${topicTitle}`,
    guidance,
    recommended_quiz_id: quizId,
    target_student_ids: targetStudentIds,
    mastery_at_creation: mastery,
    status: REMEDIATION_DRAFT,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  })
}

/** Editable fields. Anything not listed here is not the teacher's to change. */
const EDITABLE = ['title', 'guidance', 'recommended_quiz_id', 'target_student_ids', 'topic']

export async function updateRemediationPlan(planId, patch) {
  const clean = {}
  for (const key of EDITABLE) {
    if (patch[key] !== undefined) clean[key] = patch[key]
  }
  if (!Object.keys(clean).length) return
  clean.updated_at = serverTimestamp()
  await updateDoc(doc(db, 'remediations', planId), clean)
}

/**
 * Fields copied onto each student's assignment when a plan is published.
 *
 * `fresh` decides whether created_at is stamped: a refresh of an assignment the
 * student already holds must not reset its age, or it jumps to the top of their
 * list every time the teacher fixes a typo.
 */
function assignmentFrom(plan, studentId, { fresh = true } = {}) {
  const base = {
    kind: ASSIGNMENT_KIND,
    plan_id: plan.id,
    // This is the field that makes it visible: the student query matches on it
    // and so does the security rule.
    student_id: studentId,
    class_id: plan.class_id,
    topic_id: plan.topic_id ?? null,
    topic: plan.topic ?? null,
    title: plan.title ?? null,
    guidance: plan.guidance ?? '',
    recommended_quiz_id: plan.recommended_quiz_id ?? null,
    created_by: plan.created_by ?? null,
    status: REMEDIATION_PUBLISHED,
    updated_at: serverTimestamp(),
  }
  if (fresh) base.created_at = serverTimestamp()
  return base
}

/**
 * Publish, or re-publish after an edit.
 *
 * Re-publishing reconciles rather than duplicating: students added since the
 * last publish gain an assignment, students removed lose theirs, and everyone
 * still targeted has their copy refreshed with the edited text. Publishing
 * twice must not give a student the same remediation twice.
 */
export async function publishRemediation(plan) {
  const targets = [...new Set(plan.target_student_ids ?? [])].filter(Boolean)
  if (!targets.length) {
    throw new Error('Pick at least one student before publishing.')
  }

  const existing = await getDocs(
    query(collection(db, 'remediations'), where('plan_id', '==', plan.id), where('class_id', '==', plan.class_id)),
  )
  const byStudent = {}
  existing.forEach((d) => {
    const data = d.data()
    if (data.student_id) byStudent[data.student_id] = d.id
  })

  const batch = writeBatch(db)
  for (const studentId of targets) {
    const existingId = byStudent[studentId]
    if (existingId) {
      batch.update(
        doc(db, 'remediations', existingId),
        assignmentFrom(plan, studentId, { fresh: false }),
      )
      delete byStudent[studentId]
    } else {
      batch.set(doc(collection(db, 'remediations')), assignmentFrom(plan, studentId))
    }
  }
  // Whatever is left was targeted before and is not now.
  for (const staleId of Object.values(byStudent)) {
    batch.delete(doc(db, 'remediations', staleId))
  }

  batch.update(doc(db, 'remediations', plan.id), {
    status: REMEDIATION_PUBLISHED,
    published_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  })
  await batch.commit()
  return targets.length
}

/**
 * Withdraw a published remediation.
 *
 * The assignments are deleted rather than flipped to draft: a document that
 * still carries student_id stays readable by that student whatever its status
 * says, and the student pages do not filter on status.
 */
export async function unpublishRemediation(plan) {
  const existing = await getDocs(
    query(collection(db, 'remediations'), where('plan_id', '==', plan.id), where('class_id', '==', plan.class_id)),
  )
  const batch = writeBatch(db)
  existing.forEach((d) => batch.delete(doc(db, 'remediations', d.id)))
  batch.update(doc(db, 'remediations', plan.id), {
    status: REMEDIATION_DRAFT,
    published_at: null,
    updated_at: serverTimestamp(),
  })
  await batch.commit()
}

/** Remove a plan and everything it published. */
export async function deleteRemediationPlan(plan) {
  const existing = await getDocs(
    query(collection(db, 'remediations'), where('plan_id', '==', plan.id), where('class_id', '==', plan.class_id)),
  )
  const batch = writeBatch(db)
  existing.forEach((d) => batch.delete(doc(db, 'remediations', d.id)))
  batch.delete(doc(db, 'remediations', plan.id))
  await batch.commit()
}

/** How many students a published plan currently reaches. */
export function reachOf(plan) {
  return (plan.assignments ?? []).filter((a) => a.student_id).length
}
