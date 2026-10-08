/**
 * Every user at the admin's OWN school, for the admin console.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Reads and writes Firestore
 * directly: firestore.rules grants isAdmin() read/update on a users/{uid}
 * profile only when its school_id matches the caller's own (T-126 --
 * `isAdmin()` alone used to open every user on the platform to any admin of
 * any school). The query below must carry the same filter the rule proves,
 * or an unscoped `getDocs(collection(db, 'users'))` is refused outright --
 * Firestore denies a whole list request it cannot statically prove matches
 * the rule for every possible result, the same reason roster reads chunk at
 * `IN_CHUNK` in lib/roster.js. Listing, deactivating and re-roling need no
 * endpoint; only account creation and password reset do -- see lib/admin.js.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const adminUsersKey = ['fs-admin-users']

export async function fetchAllUsers(schoolId) {
  if (!schoolId) return []
  const snap = await getDocs(query(collection(db, 'users'), where('school_id', '==', schoolId)))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const byLast = (a.last_name ?? '').localeCompare(b.last_name ?? '')
      return byLast !== 0 ? byLast : (a.first_name ?? '').localeCompare(b.first_name ?? '')
    })
}

export function useAdminUsers(schoolId, options = {}) {
  return useQuery({
    ...options,
    queryKey: [...adminUsersKey, schoolId],
    queryFn: () => fetchAllUsers(schoolId),
    enabled: Boolean(schoolId),
  })
}

/**
 * `status` controls visibility in rosters and pickers. It does NOT stop anyone
 * signing in -- that is the Auth account's disabled flag, set through
 * lib/admin.js. Deactivating a person means doing both.
 */
export function setUserStatus(uid, status) {
  return updateDoc(doc(db, 'users', uid), { status, updated_at: serverTimestamp() })
}

export function setUserRole(uid, role) {
  return updateDoc(doc(db, 'users', uid), { role, updated_at: serverTimestamp() })
}
