import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase'

// The label a teacher already sees for a class elsewhere (announcements.jsx):
// "<subject_code> — <section>", falling back to subject, then to no label at
// all if the class can't be read.
async function classLabel(classId) {
  try {
    const snap = await getDoc(doc(db, 'classes', classId))
    if (!snap.exists()) return null
    const c = snap.data() || {}
    const name = c.section || c.subject
    if (c.subject_code) return name ? `${c.subject_code} — ${name}` : c.subject_code
    return name || null
  } catch {
    return null
  }
}

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
  const label = classId ? await classLabel(classId) : null
  const text = label && !message.startsWith(label) ? `${label} · ${message}` : message
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
        message: text,
        link: link ?? null,
        read: false,
        created_at: serverTimestamp(),
      })
    }
    await batch.commit()
  }
}
