import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Create a persistent notification for one or more students (one doc each).
 * Best-effort: callers should not let a notification failure block their main
 * action. The notifications collection is governed by firestore.rules — the
 * teacher must own `classId`.
 *
 * type: 'attendance_contest' | 'grade_contest' | 'score' | string
 */
export async function notifyStudents({ studentIds, classId, createdBy, type, message, link }) {
  const ids = [...new Set(studentIds ?? [])].filter(Boolean)
  if (!ids.length) return
  // A writeBatch caps at 500 operations; past that commit() rejects and NOBODY
  // gets notified. Chunked so a large roster degrades into several commits.
  for (let i = 0; i < ids.length; i += 500) {
    const batch = writeBatch(db)
    for (const sid of ids.slice(i, i + 500)) {
      batch.set(doc(collection(db, 'notifications')), {
        user_id: sid,
        class_id: classId,
        created_by: createdBy,
        type,
        message,
        link: link ?? null,
        read: false,
        created_at: serverTimestamp(),
      })
    }
    await batch.commit()
  }
}
