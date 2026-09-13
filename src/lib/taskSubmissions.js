/**
 * A student's hand-in for a class task -- the submission bin.
 *
 * Owned by the Data/logic lane (OWNERSHIP.md). Decided in
 * docs/plans/modules-content-and-deliverables.md section 9 (owner,
 * 2026-09-13, reversing D7). The rule is `task_submissions` in
 * ../activklass-backend/firestore.rules; the schema is the backend's
 * docs/02-database-schema.md.
 *
 * The shape, and the four things this module is the one home for:
 *
 *   - `submissionId(taskId, studentId)` -- the document id is the pair,
 *     built here and never by hand (DATA-MODEL.md's composite-id rule), so
 *     a re-submit is an update of the same row, not a second row.
 *   - `isLate` -- derived at display from submitted_at against the task's
 *     due_at, never stored: a stored flag goes stale the moment a teacher
 *     moves the deadline.
 *   - `describeSubmission` -- the one sentence both the teacher's row and
 *     the student's chip print.
 *   - `submitWork` -- the write. Files are uploaded by the caller through
 *     lib/attachments.js first; this module never touches Storage.
 *
 * Nothing is graded here. Points stay in the class record (plan S9).
 */
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { formatDay, formatTime, parseWindowDate } from './deliverables'
import { submissionNoteError, taskAttachmentError } from './validation'

/** The document id: `{taskId}_{studentId}`. The only place it is built. */
export function submissionId(taskId, studentId) {
  return `${taskId}_${studentId}`
}

/**
 * When a submission landed, as a Date -- or null when it has no usable
 * time. Reads a Firestore Timestamp (toDate), a Date, a number, or an ISO
 * string, because a document read through the SDK carries the first and a
 * test fixture usually carries one of the others.
 */
export function submittedAt(submission) {
  const v = submission?.submitted_at
  if (v == null) return null
  const d = typeof v?.toDate === 'function' ? v.toDate() : v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Handed in after the deadline. False when either side is missing: a task
 * with no due_at cannot be late, and a submission with no time yet (the
 * server timestamp has not resolved on a fresh local write) is not accused.
 * Strict, as canStart() and stateOf() are: at the exact minute it is due,
 * it is on time.
 */
export function isLate(submission, task) {
  const at = submittedAt(submission)
  const due = parseWindowDate(task?.due_at)
  if (!at || !due) return false
  return at.getTime() > due.getTime()
}

/**
 * "Submitted · Fri 19 Sep, 3:12 PM", with " · late" when isLate says so,
 * and just "Submitted" while the server timestamp is still pending.
 */
export function describeSubmission(submission, task, now = Date.now()) {
  const at = submittedAt(submission)
  if (!at) return 'Submitted'
  const when = `${formatDay(at, now)}, ${formatTime(at)}`
  return `Submitted · ${when}${isLate(submission, task) ? ' · late' : ''}`
}

/**
 * Create or replace the student's submission for a task.
 *
 * One setDoc at the derived id: on a first submit it creates, on a
 * re-submit it replaces -- and the rule judges the second as an update,
 * checking that task_id, class_id and student_id are unchanged, which they
 * are because they are derived from the same arguments. `existing` is the
 * current document when re-submitting, for the counter; the rule does not
 * read it. submitted_at is a server timestamp, so `late` is judged against
 * the server's clock, not the student's.
 *
 * Throws a validation Error (a sentence a student can read) before any
 * write when the attachment or the note is not acceptable.
 *
 * @param {object} args
 * @param {string} args.taskId
 * @param {string} args.classId  the task's class_id, copied onto the row
 *   because it is the field the teacher's rule reads
 * @param {string} args.studentId  the signed-in student's uid
 * @param {{ title: string, resource_type: 'file'|'link', url: string }} args.attachment
 * @param {string} [args.note]
 * @param {object|null} [args.existing]  the student's current submission, if any
 */
export async function submitWork({ taskId, classId, studentId, attachment, note = '', existing = null }) {
  const problem = taskAttachmentError(attachment) || submissionNoteError(note)
  if (problem) throw new Error(problem)
  await setDoc(doc(db, 'task_submissions', submissionId(taskId, studentId)), {
    task_id: taskId,
    class_id: classId,
    student_id: studentId,
    attachment: {
      title: String(attachment.title ?? '').trim() || attachment.url,
      resource_type: attachment.resource_type,
      url: String(attachment.url).trim(),
    },
    note: String(note ?? '').trim(),
    submitted_at: serverTimestamp(),
    resubmitted_count: existing ? (Number(existing.resubmitted_count) || 0) + 1 : 0,
  })
}

/** The Storage folder a student's file for a task goes under (storage.rules). */
export function submissionFilePath(classId, taskId, studentId, fileName) {
  return `task_files/${classId}/${taskId}/submissions/${studentId}/${fileName}`
}
