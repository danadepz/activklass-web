/**
 * Developer-tier subscriber management.
 *
 * Everything here goes through the Flask API rather than Firestore, because
 * firestore.rules now permits subscription writes only to the super admin
 * claim, and the server is what applies plan limits from its own catalogue.
 * A client that could write limits could grant a customer anything.
 *
 * Distinct from lib/admin.js: that is a school ADMIN managing users inside one
 * institution — a customer. This is us deciding which customers exist.
 */
import { api } from './api'

/** The plan catalogue, so the UI never invents a plan name or seat count. */
export function fetchPlans() {
  return api('/api/superadmin/plans')
}

/** Every institution and solo teacher, with live seat usage. */
export function fetchSubscribers() {
  return api('/api/superadmin/subscribers')
}

/**
 * Onboard a subscriber.
 *
 * For an institution this creates three things at once — the school, an admin
 * account that can sign in, and the subscription — because a subscription on
 * its own leaves a customer with nothing to log into.
 */
export function createSubscriber({
  type,
  plan,
  status,
  name,
  email,
  password,
  firstName,
  lastName,
  schoolYear,
}) {
  return api('/api/superadmin/subscribers', {
    method: 'POST',
    body: {
      type,
      plan,
      status,
      name,
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      school_year_current: schoolYear || null,
    },
  })
}

/**
 * Approve a school's access request from /register.
 *
 * One call, one batch on the server: the school, its subscription on trial
 * with the seats the school chose, the requester promoted to its admin, and
 * the request marked approved. Every field in `overrides` is optional and
 * defaults to what the request says -- name, campus, school_year_current,
 * teacher_seats, student_seats.
 */
export function approveRequest(requestId, overrides = {}) {
  return api(`/api/superadmin/requests/${requestId}/approve`, {
    method: 'POST',
    body: overrides,
  })
}

/**
 * Send the school's welcome email again, without re-running the approval.
 *
 * Approve refuses to run twice on the same request -- that guard is what
 * stops a second school being created -- so this is the only way to confirm
 * an email actually landed after the fact. Reads the school, subscription
 * and admin the approval itself wrote, never the original request.
 */
export function resendApprovalNotice(requestId) {
  return api(`/api/superadmin/requests/${requestId}/resend-notice`, { method: 'POST' })
}

/**
 * Email a self-registered teacher once their ID check is approved.
 *
 * verifications.jsx flips verification_status itself, straight to Firestore
 * -- the rules let the super admin claim do that with no plan or seat
 * decision for Flask to own. This is the one part of the job that has to
 * happen here anyway: the mail credentials only the server holds. Call it
 * right after that write lands; a failure here means the letter did not go
 * out, not that the approval failed. The endpoint has no re-approval guard
 * to run into, so this same call is also the "resend" action on an already-
 * approved teacher -- unlike the school side, nothing here needs a separate
 * resend endpoint.
 */
export function notifyTeacherApproval(uid) {
  return api(`/api/superadmin/teachers/${uid}/notify-approval`, { method: 'POST' })
}

/**
 * Change plan, status, or negotiated seat limits.
 *
 * Send only what changes. `limits` is merged onto the current values, so a
 * partial override never drops the keys it does not mention; pass null for a
 * seat key to make it unlimited.
 */
export function updateSubscriber(ownerId, { plan, status, limits } = {}) {
  const body = {}
  if (plan !== undefined) body.plan = plan
  if (status !== undefined) body.status = status
  if (limits !== undefined) body.limits = limits
  return api(`/api/superadmin/subscribers/${ownerId}`, { method: 'PATCH', body })
}

export const SUBSCRIBER_STATUSES = ['trial', 'active', 'suspended', 'cancelled']

export const SEAT_KEYS = [
  { key: 'teacher_seats', label: 'Teacher seats' },
  { key: 'student_seats', label: 'Student seats' },
  { key: 'storage_gb', label: 'Storage (GB)' },
]
