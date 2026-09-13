/**
 * Which syllabus a class teaches from -- the one resolver the class tabs share.
 *
 * A syllabus lives in two places (DATA-MODEL.md, rule 3). One saved from the
 * syllabus page is `syllabi/{classes.syllabus_id}` -- and that is the only one
 * a student reads, so anything that carries a topic id (a remediation, a
 * class task) must take its ids from it, or the student's screen can never
 * find the module it came from. The seed script writes
 * `classes/{id}/syllabus/current` instead and leaves `syllabus_id` empty
 * (SCI9 Newton); kept as the fallback so a seeded class is not told it has no
 * syllabus. `lib/studentData.js` reads in the same order for the student.
 *
 * Lived inline in scaffolds.jsx until the Modules tab needed the same read;
 * pulled out so there is one resolver on the teacher side, not two that drift.
 */
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * @param {string} classId
 * @param {object|null} clazz the classes/{classId} document, already read
 * @returns {Promise<{ id: string|null, data: object|null }>} the syllabus
 *   document and its id -- `id` is the `syllabi/{id}` id when that is where
 *   it came from, and null for the per-class fallback, which has no id of its
 *   own a task could point at
 */
export async function resolveSyllabus(classId, clazz) {
  if (clazz?.syllabus_id) {
    const s = await getDoc(doc(db, 'syllabi', clazz.syllabus_id))
    if (s.exists()) return { id: s.id, data: s.data() }
  }
  const cur = await getDoc(doc(db, 'classes', classId, 'syllabus', 'current'))
  return { id: null, data: cur.exists() ? cur.data() : null }
}
