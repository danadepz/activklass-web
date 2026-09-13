/**
 * The teacher's view of one task's submission bin.
 *
 * Owned by the Data/logic lane (OWNERSHIP.md). The query carries BOTH
 * fields: the rule proves a teacher's read through teachesClass(class_id),
 * so a task_id-only query is refused even for the owner -- the engine
 * cannot prove class_id from a filter the query does not carry (rule 4 in
 * DATA-MODEL.md, T-57). The (class_id, task_id) composite index is in the
 * backend's firestore.indexes.json. Verified in lib/firestoreRules.test.js.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const taskSubmissionsKey = (classId, taskId) => ['fs-task-submissions', classId, taskId]

export async function fetchTaskSubmissions(classId, taskId) {
  const snap = await getDocs(query(
    collection(db, 'task_submissions'),
    where('class_id', '==', classId),
    where('task_id', '==', taskId),
  ))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * @param {string} classId
 * @param {string} taskId
 * @param {object} [options] passed through to useQuery
 * @returns {{ data: object[] }} one row per student who has submitted,
 *   each carrying student_id, attachment, note, submitted_at,
 *   resubmitted_count -- join to the roster on student_id; the students
 *   with no row are the ones who have not handed in.
 */
export function useTaskSubmissions(classId, taskId, options = {}) {
  return useQuery({
    ...options,
    queryKey: taskSubmissionsKey(classId, taskId),
    queryFn: () => fetchTaskSubmissions(classId, taskId),
    enabled: !!classId && !!taskId && (options.enabled ?? true),
  })
}
