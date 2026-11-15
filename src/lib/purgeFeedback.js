/**
 * T-256: what the Super Admin is told after a purge.
 *
 * The backend (api/superadmin.py, services/purge_operations.py) answers 200
 * only when every sign-in account and record is confirmed gone
 * (`state: 'completed'`). A purge that stopped partway answers 502 with
 * `state: 'incomplete'`, the step it stopped at and the accounts still left;
 * its accounts stay disabled and the same Purge button resumes it. A paid
 * school or one with classes answers 409 and nothing changes.
 *
 * Kept apart from lib/superadmin.js so the wording is testable on its own.
 */

/** A purge response counts as success only when the server says completed. */
export function purgeResultMessage(result, what) {
  if (result?.state === 'completed') {
    return { ok: true, message: `${what} purged. Sign-in accounts and records are removed.` }
  }
  return {
    ok: false,
    message: 'The purge did not confirm it finished. Refresh the list and check before purging again.',
  }
}

/** True when the error is a purge that stopped partway and can be retried. */
export function isIncompletePurge(err) {
  return err?.body?.state === 'incomplete'
}

/** The message for a failed purge call: incomplete, refused, or anything else. */
export function purgeErrorMessage(err, fallback) {
  if (isIncompletePurge(err)) {
    const left = err.body.auth_cleanup_failed ?? []
    const accounts = left.length ? ` Accounts still to remove: ${left.join(', ')}.` : ''
    return `${err.body.message || 'Purge not finished.'}${accounts} Use Retry purge to finish it.`
  }
  return err?.message || fallback
}
