/**
 * Writing a class task: an activity, assignment or paper exam a teacher puts
 * under a syllabus sub-module for ONE class, with an open time and a deadline.
 *
 * Owned by the Data/logic lane (see OWNERSHIP.md). Firestore-direct, like
 * every other record: `class_tasks/{taskId}` is authorised by the rule block
 * in ../activklass-backend/firestore.rules (the owner of `class_id` creates,
 * updates and deletes; an enrolled student reads what is published), proven
 * by lib/firestoreRules.test.js under `npm run test:rules`. Nothing here
 * touches a grade -- points on a task are informational and the record stays
 * by assessment (docs/plans/modules-content-and-deliverables.md, D2, D7).
 *
 * The reading side is lib/deliverables.js (pure) and hooks/useClassTasks.js.
 */
import {
  collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import { uploadAttachment } from './attachments'
import { notifyStudents } from './notifications'
import { syncEntries } from './gradebook'
import { assessmentFromTask, assessmentIdForTask, taskCountsTowardRecord } from './recordMapping'
import { KIND_LABEL, TASK_KINDS, taskHref } from './deliverables'

/** Key the teacher's task list is cached under (hooks/useClassTasks.js). */
export const classTasksKey = (classId) => ['fs-class-tasks', classId]

/**
 * The fields a task carries, from whatever the dialog holds. Only the shape
 * the schema names is written; an unknown key from a form is dropped rather
 * than stored, and blanks become the nulls the readers expect.
 */
function taskFields(input = {}) {
  const out = {}
  if ('title' in input) out.title = String(input.title ?? '').trim()
  if ('kind' in input) out.kind = TASK_KINDS.includes(input.kind) ? input.kind : 'other'
  if ('instructions_markdown' in input) out.instructions_markdown = String(input.instructions_markdown ?? '')
  if ('attachments' in input) out.attachments = Array.isArray(input.attachments) ? input.attachments : []
  if ('opens_at' in input) out.opens_at = input.opens_at || null
  if ('due_at' in input) out.due_at = input.due_at || null
  if ('points' in input) {
    const n = Number(input.points)
    out.points = input.points === '' || input.points == null || !Number.isFinite(n) ? null : n
  }
  if ('syllabus_id' in input) out.syllabus_id = input.syllabus_id || null
  if ('module_id' in input) out.module_id = input.module_id || null
  if ('topic_id' in input) out.topic_id = input.topic_id || null
  // Where the task counts in the class record (owner decision 2026-09-13):
  // a component and a period, both nullable -- a task with neither is for
  // the student's information only, as every task was before.
  if ('component_id' in input) out.component_id = input.component_id || null
  if ('grading_period_id' in input) out.grading_period_id = input.grading_period_id || null
  // The submission bin (plan section 9): a strict boolean, false unless true,
  // because the task_submissions rule reads `== true` and nothing else.
  if ('accepts_submissions' in input) out.accepts_submissions = input.accepts_submissions === true
  if ('status' in input) out.status = input.status === 'published' ? 'published' : 'draft'
  return out
}

/**
 * An id for a task that has not been saved yet.
 *
 * A file has to be uploaded under `task_files/{classId}/{taskId}/` before the
 * task document exists, because the dialog attaches files before the first
 * save. Allocating the id client-side (no write happens here) lets the
 * dialog upload against it and then createTask() under the same id.
 */
export function newTaskId() {
  return doc(collection(db, 'class_tasks')).id
}

/**
 * Create a task and return its id.
 *
 * `teacher_id` is stamped from the caller, not the form: the rule requires it
 * to equal the signed-in uid, and a task created under anyone else's id would
 * simply be refused. Defaults to a draft -- publishing is a separate, named
 * step because it notifies the roster.
 *
 * @param {object} args
 * @param {string} args.classId
 * @param {string} args.teacherId  the signed-in teacher's uid
 * @param {object} args.task  title, kind, instructions_markdown, attachments,
 *   opens_at, due_at, points, syllabus_id, module_id, topic_id, status
 * @param {string} [args.id]  from newTaskId(), when files were uploaded first
 * @returns {Promise<string>} the task id
 */
export async function createTask({ classId, teacherId, task, id }) {
  const fields = taskFields(task)
  const ref = id ? doc(db, 'class_tasks', id) : doc(collection(db, 'class_tasks'))
  await setDoc(ref, {
    class_id: classId,
    teacher_id: teacherId,
    syllabus_id: null,
    module_id: null,
    topic_id: null,
    kind: 'other',
    title: '',
    instructions_markdown: '',
    attachments: [],
    opens_at: null,
    due_at: null,
    points: null,
    status: 'draft',
    ...fields,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  })
  return ref.id
}

/**
 * Change a task's own fields. Editing a published task saves without
 * re-notifying: the students were told once, and a changed deadline shows on
 * their dashboard the next time it loads. `class_id` and `teacher_id` are
 * never rewritten here -- a task does not move between classes.
 */
export async function updateTask(taskId, changes) {
  await updateDoc(doc(db, 'class_tasks', taskId), {
    ...taskFields(changes),
    updated_at: serverTimestamp(),
  })
}

/**
 * Publish a task and tell the roster.
 *
 * The save comes first and the notification second, and the second is
 * best-effort: a refused or failed notification write is logged and
 * swallowed, because the task IS published at that point and telling the
 * teacher it was not would be false. The link is the class's Modules tab
 * with the task's sub-module highlighted -- the same deep link a review
 * guide's notification uses -- so a student lands on the task, not on a
 * page they then have to search.
 *
 * @param {object} args
 * @param {string} args.taskId
 * @param {object} args.task  the task as it will be published: class_id,
 *   kind, title, topic_id are read for the message and the link
 * @param {string} args.teacherId  the signed-in teacher's uid (created_by on
 *   each notification; the rule requires it)
 * @param {string[]} args.studentIds  the class roster (classes.student_ids)
 * @param {object} [args.changes]  any other edits to save in the same write
 */
export async function publishTask({ taskId, task, teacherId, studentIds = [], changes = {} }) {
  await updateTask(taskId, { ...changes, status: 'published' })
  const merged = { ...task, ...taskFields(changes) }
  const kind = KIND_LABEL[merged.kind] ?? KIND_LABEL.other
  try {
    await notifyStudents({
      studentIds,
      classId: merged.class_id,
      createdBy: teacherId,
      type: 'task_published',
      message: `New ${kind.toLowerCase()}: ${merged.title}`,
      link: taskHref(merged.class_id, merged.topic_id ?? null),
    })
  } catch (err) {
    // Never surfaced to the teacher: the publish succeeded. Kept for whoever
    // is asked why a student did not get the notice.
    console.error('class task published but the roster was not notified', err)
  }
}

/**
 * Put a published task's column in the class record.
 *
 * The same shape a quiz's publish creates (hooks/useQuizRecordSync.js): a
 * `gradebooks/{classId}/assessments/task-{id}` row with the task's title,
 * points, component and period, merged so a re-publish or a later edit
 * updates the row it made rather than adding a twin, and so marks a teacher
 * has already typed into it survive (`scores` is never in the merge). Scores
 * are typed on the record page as before -- a task has no answer key.
 *
 * Returns false when the task does not count toward the record (no
 * component, no period, or no points), which is not an error: the dialog
 * already said so. `syncEntries` is what makes the student's own screen
 * list the new column; a failure there is swallowed, as the quiz sync does,
 * because the column did land and the next record save re-syncs.
 */
export async function syncTaskToRecord({ classId, task }) {
  if (!taskCountsTowardRecord(task)) return false
  await setDoc(
    doc(db, 'gradebooks', classId, 'assessments', assessmentIdForTask(task.id)),
    { ...assessmentFromTask(task), created_at: serverTimestamp(), synced_at: serverTimestamp() },
    { merge: true },
  )
  try {
    await syncEntries(classId)
  } catch {
    /* derived; the next record save re-syncs */
  }
  return true
}

/** Remove a task. Irreversible; the screen confirms first, as deletes do elsewhere. */
export async function deleteTask(taskId) {
  await deleteDoc(doc(db, 'class_tasks', taskId))
}

/**
 * Upload one attachment for a task and return its download URL, ready to sit
 * in `attachments[]` as `{ title, resource_type: 'file', url }`.
 *
 * Under `task_files/{classId}/{taskId}/{fileName}` (storage.rules, cross-repo):
 * keyed by class, not by syllabus, so the file survives the class changing
 * its syllabus. A timestamp prefixes the name so two uploads of "template.pdf"
 * do not overwrite each other. Errors come out of uploadAttachment already
 * worded for a teacher; nothing is re-wrapped here.
 */
export async function uploadTaskFile(classId, taskId, file) {
  if (!classId || !taskId) throw new Error('Could not attach the file to this task. Close the dialog and try again.')
  const safeName = String(file?.name ?? 'file').replace(/[/\\]/g, '_')
  return uploadAttachment(`task_files/${classId}/${taskId}/${Date.now()}-${safeName}`, file)
}
