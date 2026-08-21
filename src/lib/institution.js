/**
 * Absorption: an institution taking over the bill for a solo teacher.
 *
 * Owned by the logic lane (see OWNERSHIP.md). An admin offers a seat to one
 * named teacher; that teacher accepts or declines. Nothing happens because a
 * school subscribed, and nothing happens without the teacher's own action --
 * see the module docstring in api/institution.py for why (RA 10173, and
 * teachers who legitimately work at two schools).
 *
 * What accepting changes is only who pays:
 *   users/{uid}.school_id      <- the school
 *   subscriptions/{uid}.status <- 'cancelled', with superseded_by set
 * Classes, students, grades and the teacher's group are untouched.
 */
import { api } from './api'

/** Invites this school has sent, pending first. Admin only. */
export function fetchSchoolInvites() {
  return api('/api/institution/invites')
}

export function inviteTeacher(email) {
  return api('/api/institution/invites', { method: 'POST', body: { email } })
}

export function revokeInvite(inviteId) {
  return api(`/api/institution/invites/${inviteId}`, { method: 'DELETE' })
}

/**
 * Hand a teacher back to paying their own way.
 *
 * This is why accepting cancels the solo subscription rather than deleting it:
 * the record is still there, and release puts its status back.
 */
export function releaseMember(teacherId) {
  return api(`/api/institution/members/${teacherId}/release`, { method: 'POST' })
}

/** Invites waiting on the signed-in teacher. Empty for anyone else. */
export function fetchMyInvites() {
  return api('/api/institution/invites/mine')
}

export function acceptInvite(inviteId) {
  return api(`/api/institution/invites/${inviteId}/accept`, { method: 'POST' })
}

export function declineInvite(inviteId) {
  return api(`/api/institution/invites/${inviteId}/decline`, { method: 'POST' })
}

/**
 * Whether a subscription was stopped because a school took it over.
 *
 * The status is plain 'cancelled' -- deliberately, since
 * lib/superadminAnalytics.js:summarize() tallies with `if (status in byStatus)`
 * and an invented status would drop the subscriber out of every bucket while
 * still counting in the total. `superseded_by` is what distinguishes "your
 * school pays for this now" from "this lapsed".
 */
export function isAbsorbed(sub) {
  return sub?.status === 'cancelled' && !!sub?.superseded_by
}
