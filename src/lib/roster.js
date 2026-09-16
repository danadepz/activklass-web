import { collection, documentId, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { api } from './api'
import { nameError } from './validation'

/**
 * How many ids one `documentId() in` query may carry.
 *
 * Firestore's own cap is 30, and this chunked at 30 until T-57. The rules
 * engine judges such a query per document, and the `users` rule spends
 * document lookups on each one, so a teacher's roster read was refused
 * outright -- permission-denied on the whole query, not a partial result --
 * at 19 ids and accepted at 18, measured against the live project as a solo
 * teacher whose one class had 21 students. Ten is Firestore's original `in`
 * limit and sits well inside that budget; a big section costs a couple more
 * round trips, which nobody notices. Every `documentId() in` read a teacher
 * makes should use this, not its own number.
 */
export const IN_CHUNK = 10

/**
 * Fetch users docs by uid list, IN_CHUNK ids per query.
 *
 * Ids are deduped and emptied first: a blank or non-string entry in a class's
 * student_ids makes the documentId() query throw outright, and most callers
 * don't catch, so one bad roster entry took the whole page's query down.
 */
export async function fetchUsersByIds(ids) {
  const clean = [...new Set(ids ?? [])].filter((id) => typeof id === 'string' && id.trim() !== '')
  const users = []
  for (let i = 0; i < clean.length; i += IN_CHUNK) {
    const chunk = clean.slice(i, i + IN_CHUNK)
    const snap = await getDocs(
      query(collection(db, 'users'), where(documentId(), 'in', chunk)),
    )
    snap.forEach((d) => users.push({ id: d.id, ...d.data() }))
  }
  return users
}

/**
 * What a lookup found: the student accounts, and whether the same key also
 * names a teacher.
 *
 * `teacherMatch` is the answer to a question the roster search never asked.
 * A student number and a teacher's ID number are different fields on
 * different documents, so one number can name a student AND a teacher with
 * nothing detecting it -- which is what a tester hit: she typed her own
 * teacher ID into Add Student and was handed a filled-in Grade 7 form for
 * the unrelated student who happens to carry that number. Both records were
 * real; only the silence was the bug. The flag rides along with every lookup
 * because the collision case is precisely the one where a student *was*
 * found, so "no match, then check" would never fire.
 */
function shapeLookup(res) {
  return { students: res?.students ?? [], teacherMatch: res?.teacher_match === true }
}

/**
 * Find registered students by exact student number, falling back to LRN.
 *
 * `students` is an ARRAY: the same number can legitimately exist at two
 * schools, so the caller disambiguates (prefer the teacher's own school_id)
 * rather than this helper guessing. Admin-issued accounts may have no email
 * at all -- the ID is the only key a teacher's class list reliably carries.
 */
export async function findStudentsByNumber(idText) {
  const needle = String(idText ?? '').trim()
  if (!needle) return { students: [], teacherMatch: false }
  // Through Flask since 2026-08-31: a teacher may read only the students they
  // handle (firestore.rules), and the one they are looking for here is, by
  // definition, not yet one of them. The endpoint answers exact keys only,
  // with the roster fields only.
  const res = await api(`/api/students/lookup?student_number=${encodeURIComponent(needle)}`)
  return shapeLookup(res)
}

/** Find a registered student by exact email. `student` is the user doc or null. */
export async function findStudentByEmail(email) {
  const needle = String(email ?? '').trim().toLowerCase()
  if (!needle) return { student: null, teacherMatch: false }
  const res = await api(`/api/students/lookup?email=${encodeURIComponent(needle)}`)
  const { students, teacherMatch } = shapeLookup(res)
  return { student: students[0] ?? null, teacherMatch }
}

/**
 * What to say when the thing a teacher typed names a teacher account.
 *
 * Said instead of offering the enrolment form, not alongside it: the whole
 * defect was that the form appeared. The second sentence matters as much as
 * the first -- a student whose number really does collide with some teacher's
 * ID still has to be enrollable, and their own email is the key that does not
 * collide.
 */
export function teacherAccountMessage(needle) {
  return String(needle ?? '').includes('@')
    ? 'That email belongs to a teacher account, not a student. Add the student using their own email address.'
    : 'That ID belongs to a teacher account, not a student. If a student really carries the same number, add them by email instead.'
}

/**
 * Roster membership goes through Flask, never a client arrayUnion/arrayRemove.
 *
 * The rules refuse every client write to classes.student_ids: the server
 * rewrites each student's teacher_ids in the same request
 * (services/roster_sync.py), and that field is what lets the teacher read the
 * student at all. A client-side roster write would enrol a student the
 * teacher then cannot see.
 */
export function addToRoster(classId, studentIds) {
  return api(`/api/classes/${classId}/roster`, { method: 'POST', body: { student_ids: studentIds } })
}

export function removeFromRoster(classId, studentId) {
  return api(`/api/classes/${classId}/roster/${studentId}`, { method: 'DELETE' })
}

/**
 * Is this student dropped from this one class? (T-70)
 *
 * A per-CLASS flag, not an account state -- `classes/{id}.dropped_student_ids`
 * -- so a dropout stays on the roster and in the record (student_ids is
 * untouched) but may no longer act on this one class: start a quiz, hand
 * work in, or open a contest. Their account and every other class they are
 * on are unaffected. The class owner may write any class field except
 * `student_ids`/`teacher_id` (firestore.rules), so a client toggles this one
 * directly rather than through Flask.
 */
export function isDroppedFromClass(clazz, studentId) {
  return (clazz?.dropped_student_ids ?? []).includes(studentId)
}

export function ageFromBirthdate(birthdate) {
  if (!birthdate) return null
  const born = new Date(birthdate)
  if (Number.isNaN(born.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - born.getFullYear()
  if (
    today.getMonth() < born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())
  ) {
    age -= 1
  }
  return age
}

export const STATUS_LABELS = {
  active: 'Active',
  needs_remediation: 'Needs Remediation',
  mastered: 'Mastered',
}

// Enrollment state (AC/IN) — distinct from the academic STATUS_LABELS above.
export const ENROLLMENT_STATUS_LABELS = {
  AC: 'Active',
  IN: 'Inactive',
}

// Roster remarks (CHED-style). Empty string = no remark.
export const REMARKS_OPTIONS = [
  'Shiftee',
  'Transferee',
  'New',
  'Old',
  'Cross-Enrollee',
  'Returnee',
]

/**
 * Which matched roster rows may hand their middle name to the account.
 *
 * The roster upload never creates accounts and never edits names -- except
 * this one gap, filled by request (T-27): a student whose account carries no
 * middle name yet gets the one the file gives them. Nothing else moves. A
 * middle name that is already on the account stays as it is, even if the file
 * spells it differently, and a value that fails the name rule is dropped
 * rather than failing the upload. Returns [{ uid, middle_name }].
 */
export function middleNamesToWrite(matched) {
  const out = []
  for (const { account, middle_name } of matched ?? []) {
    const text = String(middle_name ?? '').trim()
    if (!text || !account?.id) continue
    if (String(account.middle_name ?? '').trim()) continue
    if (nameError(text, { label: 'Middle name', required: false })) continue
    out.push({ uid: account.id, middle_name: text })
  }
  return out
}

/** Tiny CSV parser (handles quoted fields with commas). Returns array of rows. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}
