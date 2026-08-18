/**
 * Admin identity operations that need the server.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Everything else the admin console
 * does -- listing users, deactivating, changing a role -- writes Firestore
 * directly, because firestore.rules already grants isAdmin() read and update on
 * any users/{uid}.
 *
 * These three cannot work that way. Creating an account and changing someone
 * else's password are Firebase Auth operations, and Auth has no client API for
 * acting on another user; only the Admin SDK can, and only from a server.
 */
import { api } from './api'

/** Creates the Auth account and the users/{uid} profile together. */
export function createUser({ email, password, role, firstName, lastName, extra = {} }) {
  return api('/api/admin/users', {
    method: 'POST',
    body: {
      email,
      password,
      role,
      first_name: firstName,
      last_name: lastName,
      ...extra,
    },
  })
}

/**
 * Creates many accounts in one request.
 *
 * Returns { created, failed, summary } and reports every row by index, because
 * partial success is the normal outcome of a real upload -- one malformed row
 * must not discard the rest, and the admin needs to know which line to fix.
 * A response with zero created rows arrives as a 400; the caller should read
 * `err.body` for the same per-row detail.
 */
export function bulkCreateUsers(users) {
  return api('/api/admin/users/bulk', { method: 'POST', body: { users } })
}

/**
 * Sets a new password. Existing sessions keep working -- Firebase does not
 * revoke tokens on a password change. To actually lock someone out, disable
 * the account as well.
 */
export function resetPassword(uid, password) {
  return api(`/api/admin/users/${uid}/password`, {
    method: 'POST',
    body: { password },
  })
}

/**
 * Disables or re-enables the Auth account, revoking live sessions on disable.
 *
 * Distinct from users/{uid}.status: status hides someone from rosters, this
 * stops them signing in. Deactivating should do both -- status alone leaves a
 * working login.
 */
export function setAccountDisabled(uid, disabled) {
  return api(`/api/admin/users/${uid}/disabled`, {
    method: 'POST',
    body: { disabled },
  })
}
