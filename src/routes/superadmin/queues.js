import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * The two things waiting on a developer, and the keys they are cached under.
 *
 * They live here rather than in the two pages that render them because the
 * tab bar counts them: a badge fetched separately would be a second read of
 * the same collection, free to drift from the list it is describing — the
 * queue would sit at "3" while the page below it showed nothing left. One
 * query key each, one cache entry each, invalidated by whichever page acts.
 *
 * Firestore-direct, like the pages: firestore.rules lets the super admin
 * claim — and nobody else — read a teacher's verification fields or the
 * requests collection.
 */

/** Solo teachers who registered themselves and are waiting on an ID check. */
export const PENDING_TEACHERS_KEY = ['sa-verifications']

/** Schools asking to be let in — the "Institution" path on /register. */
export const PENDING_REQUESTS_KEY = ['sa-requests']

/** The last few approvals, so a notice can be copied again after its dialog
    is gone. A lost email must not mean a locked-out customer. */
export const APPROVED_TEACHERS_KEY = ['sa-verifications-approved']

export async function fetchPendingTeachers() {
  const snap = await getDocs(
    query(
      collection(db, 'users'),
      where('role', '==', 'teacher'),
      where('verification_status', '==', 'pending'),
    ),
  )
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort(
      (a, b) =>
        (a.verification_submitted_at?.seconds ?? 0) - (b.verification_submitted_at?.seconds ?? 0),
    )
}

export async function fetchApprovedTeachers() {
  const snap = await getDocs(
    query(
      collection(db, 'users'),
      where('role', '==', 'teacher'),
      where('verification_status', '==', 'approved'),
    ),
  )
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.verification_reviewed_at?.seconds ?? 0) - (a.verification_reviewed_at?.seconds ?? 0))
    .slice(0, 8)
}

export async function fetchPendingRequests() {
  const snap = await getDocs(
    query(collection(db, 'subscription_requests'), where('status', '==', 'pending')),
  )
  const rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.created_at?.seconds ?? 0) - (b.created_at?.seconds ?? 0))
  // T-82: a request may already point at a pending school that paid for its
  // year at sign-up (Option B). The console needs to know before it lets a
  // superadmin edit seats out from under a price that was already charged,
  // or declines the request as a bare write when a refund is actually owed
  // -- both read this field, below.
  return Promise.all(
    rows.map(async (r) => {
      if (!r.school_id) return r
      const schoolSnap = await getDoc(doc(db, 'schools', r.school_id))
      return { ...r, school_payment_status: schoolSnap.exists() ? (schoolSnap.data().payment_status ?? null) : null }
    }),
  )
}
