/**
 * Everything the signed-in student has to finish, across every class they
 * are on: quizzes with a window, and published class tasks -- one list,
 * deadline first, for the dashboard's "Up next" panel and its calendar.
 *
 * Owned by the Data/logic lane (see OWNERSHIP.md). Reads are Firestore-direct
 * and each is the shape its rule can prove:
 *
 *   classes       where('student_ids', 'array-contains', uid)  -- the roster
 *   quizzes       where('class_ids', 'array-contains', classId), per class
 *                 (readable by any signed-in user; drafts and quizzes not
 *                 assigned to this student are dropped here, as the class
 *                 page drops them)
 *   class_tasks   where('class_id', 'in', chunk) + where('status', '==',
 *                 'published'), chunked at IN_CHUNK -- both filters are what
 *                 the student branch of the rule reads, and lib/roster.js
 *                 explains why ten, not thirty
 *   quiz_attempts where('student_id', '==', uid), once -- to mark a quiz done
 *   task_submissions where('student_id', '==', uid), once -- to mark a task
 *                 done (the submission bin, plan section 9); the rule lets a
 *                 student read their own rows and nothing else
 *
 * Every per-class and per-chunk read goes through Promise.allSettled, so one
 * class that fails (a rule refusal, a bad id) costs that class's items and
 * nothing else -- the T-57 lesson, where one class blanked the whole
 * Students page. The failed classes are returned beside the items so the
 * panel can say so; the reason goes to the console, never to the screen.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { IN_CHUNK } from '@/lib/roster'
import { assignedToStudent, fromQuiz, fromTask, sortDeliverables } from '@/lib/deliverables'

export const studentDeliverablesKey = (studentId) => ['fs-student-deliverables', studentId]

/** What the student's screens call a class: "SCI9 · Science 9". */
export function studentClassName(c) {
  const subject = c?.subject || c?.section || c?.name || ''
  return c?.subject_code ? `${c.subject_code} · ${subject}`.replace(/ · $/, '') : subject || 'Class'
}

const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))

async function fetchQuizzesFor(classId) {
  return docs(await getDocs(query(collection(db, 'quizzes'), where('class_ids', 'array-contains', classId))))
}

async function fetchPublishedTasks(classIds) {
  return docs(await getDocs(query(
    collection(db, 'class_tasks'),
    where('class_id', 'in', classIds),
    where('status', '==', 'published'),
  )))
}

/**
 * Fold the settled reads into one list. Pure, so the T-57 shape -- one class
 * refused, the rest shown -- is tested without Firestore.
 *
 * @param {object} args
 * @param {object[]} args.classes  the student's classes, with `id`
 * @param {PromiseSettledResult<object[]>[]} args.quizResults  one per class, in order
 * @param {string[][]} args.taskChunks  the class-id chunks the task reads were made for
 * @param {PromiseSettledResult<object[]>[]} args.taskResults  one per chunk, in order
 * @param {object[]} args.attempts  the student's own quiz_attempts
 * @param {object[]} [args.submissions]  the student's own task_submissions
 * @param {string} args.studentId
 * @param {number|Date} [args.now]
 */
export function assembleDeliverables({ classes, quizResults, taskChunks, taskResults, attempts, submissions = [], studentId, now = Date.now() }) {
  const byId = new Map(classes.map((c) => [c.id, c]))
  const failedIds = new Set()
  const items = []

  quizResults.forEach((r, i) => {
    const c = classes[i]
    if (r.status !== 'fulfilled') { failedIds.add(c.id); return }
    for (const q of r.value) {
      if (q.status !== 'published' && q.status !== 'closed') continue
      if (!assignedToStudent(q, studentId)) continue
      const own = (attempts ?? []).filter((a) => a.quiz_id === q.id && a.class_id === c.id)
      items.push(fromQuiz(q, { classId: c.id, className: studentClassName(c), attempts: own, now }))
    }
  })

  const submissionByTask = new Map((submissions ?? []).map((sub) => [sub.task_id, sub]))
  taskResults.forEach((r, i) => {
    if (r.status !== 'fulfilled') { taskChunks[i].forEach((id) => failedIds.add(id)); return }
    for (const t of r.value) {
      const c = byId.get(t.class_id)
      items.push(fromTask(t, { className: studentClassName(c), now, submission: submissionByTask.get(t.id) ?? null }))
    }
  })

  const failed = classes.filter((c) => failedIds.has(c.id)).map((c) => ({ classId: c.id, label: studentClassName(c) }))
  return { items: sortDeliverables(items), failed }
}

export async function fetchStudentDeliverables(studentId) {
  const classes = docs(await getDocs(query(collection(db, 'classes'), where('student_ids', 'array-contains', studentId))))
  const classIds = classes.map((c) => c.id)
  const taskChunks = []
  for (let i = 0; i < classIds.length; i += IN_CHUNK) taskChunks.push(classIds.slice(i, i + IN_CHUNK))

  const [quizResults, taskResults, attempts, submissions] = await Promise.all([
    Promise.allSettled(classes.map((c) => fetchQuizzesFor(c.id))),
    Promise.allSettled(taskChunks.map(fetchPublishedTasks)),
    // Without attempts every quiz simply reads as not done; the list still shows.
    getDocs(query(collection(db, 'quiz_attempts'), where('student_id', '==', studentId))).then(docs).catch((err) => {
      console.error('Deliverables: quiz attempts did not load', err)
      return []
    }),
    // Same for submissions: without them every task reads as not yet handed in.
    getDocs(query(collection(db, 'task_submissions'), where('student_id', '==', studentId))).then(docs).catch((err) => {
      console.error('Deliverables: task submissions did not load', err)
      return []
    }),
  ])

  quizResults.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`Deliverables: quizzes for class ${classes[i].id} did not load`, r.reason)
  })
  taskResults.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`Deliverables: tasks for classes ${taskChunks[i].join(', ')} did not load`, r.reason)
  })

  return assembleDeliverables({ classes, quizResults, taskChunks, taskResults, attempts, submissions, studentId })
}

/**
 * @param {object} [options] passed through to useQuery
 * @returns {{ data: { items: Deliverable[], failed: { classId, label }[] } }}
 *   `items` is every deliverable in deadline order -- hand it to bucket() for
 *   the dashboard sections; `failed` names the classes whose reads were
 *   refused, so the panel can say "Some of your classes could not be loaded"
 *   instead of quietly showing less.
 */
export function useStudentDeliverables(options = {}) {
  const { profile } = useAuth()
  const studentId = profile?.id
  return useQuery({
    ...options,
    queryKey: studentDeliverablesKey(studentId),
    queryFn: () => fetchStudentDeliverables(studentId),
    enabled: !!studentId && (options.enabled ?? true),
  })
}
