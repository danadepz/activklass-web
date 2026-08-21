import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'

/**
 * A teacher's classes, from Firestore.
 *
 * This replaces GET /api/classes, which read SQLAlchemy -- and that was not
 * merely an unmigrated endpoint, it was a second database answering a question
 * the first one owns. Every other class screen in the app reads the Firestore
 * `classes` collection; the Record and Attendance pickers read SQLite. A class
 * created in the app therefore never appeared in either picker, and the seeded
 * demo classes, which exist only in Firestore, appeared in neither.
 *
 * Archived classes are excluded, matching what the class list does with
 * `archived_at`. The Flask version took an `?archived=true` parameter that no
 * caller ever passed; it is not carried over, and adding it back is a filter
 * on the returned array rather than a second query.
 */
export async function loadTeacherClasses(teacherId) {
  if (!teacherId) return []
  const snap = await getDocs(
    query(collection(db, 'classes'), where('teacher_id', '==', teacherId)),
  )
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => !c.archived_at)
    .sort((a, b) => classLabel(a).localeCompare(classLabel(b)))
}

/**
 * What to call a class on screen.
 *
 * Firestore classes carry `subject_code`, `subject` and `section` but no
 * `name` -- `name` was a SQL column, and anything still reading it is reading
 * the old shape. The fallback chain keeps such a caller working rather than
 * rendering an empty heading.
 *
 * Duplicated from teacher/reports.jsx, which defined this privately. Left
 * duplicated rather than reaching into another lane's file to de-duplicate;
 * worth collapsing when someone owns both.
 */
export function classLabel(c) {
  if (!c) return 'Class'
  return c.subject_code
    ? `${c.subject_code} · ${c.section ?? ''}`.trim().replace(/ ·$/, '')
    : c.section || c.subject || c.name || 'Class'
}

/** How many students are enrolled. `student_ids` is the roster of record. */
export function studentCount(c) {
  return Array.isArray(c?.student_ids) ? c.student_ids.length : 0
}
