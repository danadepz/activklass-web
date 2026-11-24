import { collection, query, where } from 'firebase/firestore'

/**
 * The student's announcements read, in the one shape firestore.rules can prove.
 *
 * The rule lets a student read an announcement only when its `teacher_id` is
 * one of the student's own server-written `teacher_ids`. A list query is
 * allowed only if that holds for every document it could return, so a
 * `class_id`-only query is refused outright (the tab used to read "No
 * Announcements" while the bell still rang). Pinning `teacher_id` to the
 * class's own teacher makes it provable.
 *
 * Mirrored in activklass-mobile src/lib/studentAnnouncements.ts; the rules
 * suite (firestoreRules.test.js) runs this exact function against the
 * emulator, so a change here is proven there.
 */

/** A teacher id the query may carry, or null for a missing or malformed one. */
export function announcementTeacherId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\s/]/.test(value)
    ? value
    : null
}

/**
 * The query, or null when the class has no usable teacher id. Null means the
 * read cannot succeed: the caller shows "could not load", never an empty list.
 */
export function studentAnnouncementsQuery(db, classId, teacherId) {
  const tid = announcementTeacherId(teacherId)
  if (!tid || typeof classId !== 'string' || !classId) return null
  return query(
    collection(db, 'announcements'),
    where('class_id', '==', classId),
    where('teacher_id', '==', tid),
  )
}
