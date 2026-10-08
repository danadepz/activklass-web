import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { api } from './api'

/**
 * Delete a class section through Flask. A client deleteDoc is refused by the
 * rules since 2026-08-31: the server has to take this teacher off every
 * former student's teacher_ids as the roster disappears
 * (services/roster_sync.py). Only the class document goes, as before.
 */
export function deleteClassSection(classId) {
  return api(`/api/classes/${classId}`, { method: 'DELETE' })
}

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

/**
 * Resolves the applicable term end date string (YYYY-MM-DD) for a class
 * from the school's configured term dates.
 *
 * Rules:
 *  - College classes specify `semester` ('1st', '2nd', 'summer'), which maps to
 *    `first_sem_end`, `second_sem_end`, or `summer_end`.
 *  - K-12 classes (where semester is null or empty) map to `school_year_end`.
 */
export function getTermEndDate(cls, termDates) {
  if (!cls || !termDates) return null
  const sem = cls.semester
  if (sem === '1st') return termDates.first_sem_end || null
  if (sem === '2nd') return termDates.second_sem_end || null
  if (sem === 'summer') return termDates.summer_end || null
  return termDates.school_year_end || null
}

function parseDateEndMs(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
}

function toMs(val) {
  if (val == null) return null
  if (typeof val.toMillis === 'function') return val.toMillis()
  if (val instanceof Date) return val.getTime()
  if (typeof val === 'object' && typeof val.seconds === 'number') return val.seconds * 1000
  if (typeof val === 'number') return val < 1e12 ? val * 1000 : val
  const parsed = Date.parse(val)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * T-138: Determines whether a class should be automatically archived.
 *
 * Returns true if:
 *  1. The class is not already archived (!cls.archived_at)
 *  2. The school configured an end date for the class's term
 *  3. `now` is after the term's end date
 *  4. The class has NOT had activity after the term end date (still in use)
 *  5. The teacher has NOT explicitly unarchived the class after the term ended
 *
 * Degrades safely: if no term end date is configured, returns false (never auto-archives).
 */
export function shouldAutoArchive(cls, termDates, now = Date.now()) {
  if (!cls || cls.archived_at) return false
  const endStr = getTermEndDate(cls, termDates)
  if (!endStr) return false

  const endMs = parseDateEndMs(endStr)
  if (endMs == null || now <= endMs) return false

  // Never auto-archive a class still in use: activity after term end keeps it active
  const lastActivityMs = toMs(cls.last_activity_at ?? cls.updated_at)
  if (lastActivityMs != null && lastActivityMs > endMs) return false

  // If a teacher manually unarchived the class after the term end date, honor their choice
  const unarchivedMs = toMs(cls.unarchived_at)
  if (unarchivedMs != null && unarchivedMs > endMs) return false

  return true
}

