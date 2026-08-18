/**
 * Every user in the system, for the admin console.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Reads and writes Firestore
 * directly: firestore.rules grants isAdmin() read on any users/{uid} and update
 * on any profile, so listing, deactivating and re-roling need no endpoint.
 * Only account creation and password reset do -- see lib/admin.js.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const adminUsersKey = ['fs-admin-users']

export async function fetchAllUsers() {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const byLast = (a.last_name ?? '').localeCompare(b.last_name ?? '')
      return byLast !== 0 ? byLast : (a.first_name ?? '').localeCompare(b.first_name ?? '')
    })
}

export function useAdminUsers(options = {}) {
  return useQuery({
    ...options,
    queryKey: adminUsersKey,
    queryFn: fetchAllUsers,
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
