/**
 * One class's tasks -- activities, assignments and paper exams -- for the
 * teacher's Modules tab.
 *
 * Owned by the Data/logic lane (see OWNERSHIP.md). The query is exactly the
 * shape the class_tasks rule can prove for a teacher: `where('class_id',
 * '==', classId)`, which teachesClass() judges from the class document. A
 * query by teacher_id would list across classes and the rule has no branch
 * for it. Drafts are included -- the teacher sees their own unpublished work;
 * the student's query (useStudentDeliverables) carries the status filter.
 *
 * Cache key ['fs-class-tasks', classId]; the write helpers in
 * lib/classTasks.js do not invalidate it themselves -- the screen that saved
 * calls `invalidateQueries({ queryKey: classTasksKey(classId) })` after, the
 * way the rest of the app does with ['fs-classes'].
 */
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { classTasksKey } from '@/lib/classTasks'
import { sortDeliverables, fromTask } from '@/lib/deliverables'

export { classTasksKey }

export async function fetchClassTasks(classId) {
  const snap = await getDocs(
    query(collection(db, 'class_tasks'), where('class_id', '==', classId)),
  )
  const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  // Deadline order, the same order the student sees, so the two sides agree
  // on "what comes next" without each sorting by its own rule.
  const order = new Map(sortDeliverables(tasks.map((t) => fromTask(t))).map((d, i) => [d.id, i]))
  return tasks.sort((a, b) => order.get(a.id) - order.get(b.id))
}

/**
 * @param {string} classId
 * @param {object} [options] passed through to useQuery
 * @returns the class's raw class_tasks documents (with `id`), deadline first;
 *   pass one to fromTask() for the chip, or to updateTask()/publishTask() as is
 */
export function useClassTasks(classId, options = {}) {
  return useQuery({
    ...options,
    queryKey: classTasksKey(classId),
    queryFn: () => fetchClassTasks(classId),
    enabled: !!classId && (options.enabled ?? true),
  })
}
