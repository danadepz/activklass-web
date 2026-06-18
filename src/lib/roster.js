import { collection, documentId, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'

/** Fetch users docs by uid list (chunked — Firestore 'in' caps at 30 ids). */
export async function fetchUsersByIds(ids) {
  const users = []
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30)
    const snap = await getDocs(
      query(collection(db, 'users'), where(documentId(), 'in', chunk)),
    )
    snap.forEach((d) => users.push({ id: d.id, ...d.data() }))
  }
  return users
}

/** Find a registered student by exact email. Returns the user doc or null. */
export async function findStudentByEmail(email) {
  const snap = await getDocs(
    query(
      collection(db, 'users'),
      where('email', '==', email.trim().toLowerCase()),
      where('role', '==', 'student'),
    ),
  )
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
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
