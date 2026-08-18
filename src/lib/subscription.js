/**
 * Subscription status, usage and plan changes.
 *
 * Owned by the logic lane (see OWNERSHIP.md). These go through Flask rather
 * than Firestore for a specific reason: the plan decides the seat limits, so a
 * client that could write its own subscription document could grant itself an
 * unlimited institution plan. firestore.rules lets an owner read their record
 * but not update it, and the server applies limits from its own plan table.
 */
import { api } from './api'

/**
 * Which subscription applies to the signed-in user, resolved server-side.
 *
 * An admin's is their school's, found through users/{uid}.school_id; a solo
 * teacher's is keyed by their own uid. Asking the server means the client never
 * hardcodes a school id -- it used to, which worked only while a single school
 * existed.
 */
export function fetchMyOwnerId() {
  return api('/api/subscription/mine')
}

/** The plan catalogue, so the UI never invents a plan name or seat count. */
export function fetchPlans() {
  return api('/api/subscription/plans')
}

/** Status plus live seat usage, counted from the users collection. */
export function fetchSubscription(ownerId) {
  return api(`/api/subscription/${ownerId}`)
}

/** Limits are applied server-side from the catalogue, not sent from here. */
export function changePlan(ownerId, plan) {
  return api(`/api/subscription/${ownerId}/plan`, { method: 'POST', body: { plan } })
}

/**
 * Bytes actually stored, grouped by folder.
 *
 * Returns `{ available: false, reason }` when Firebase Storage was never
 * provisioned for the project, which is a state worth showing rather than an
 * error -- and better than rendering 0 B as though it had been measured.
 */
export function fetchStorageUsage() {
  return api('/api/admin/storage')
}

export function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}
