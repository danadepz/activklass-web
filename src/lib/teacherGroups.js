/**
 * Teacher groups: solo teachers at one school working as a unit.
 *
 * Owned by the logic lane (see OWNERSHIP.md). These go through Flask rather
 * than Firestore because group membership decides who a teacher shares work
 * with, and the code that grants it must not be writable by whoever holds it.
 * firestore.rules denies clients these collections outright -- the Admin SDK
 * behind these endpoints is the only writer.
 *
 * Group membership is NOT a school seat. It lives on `teacher_group_id`, while
 * billing lives on `school_id`; see lib/institution.js and the module docstring
 * in api/teacher_groups.py for why conflating them would bill a school for
 * teachers it never bought seats for.
 */
import { api } from './api'

/** Same alphabet the server mints from: no O/0/I/1, because codes get read aloud. */
export const GROUP_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/

export const JOIN_MODES = [
  { key: 'approval', label: 'Approve each request', hint: 'You review everyone who enters the code.' },
  { key: 'open', label: 'Anyone with the code', hint: 'The code alone is enough to join.' },
]

/** `{ group, pending_request }` — group is null when the caller has none. */
export function fetchMyGroup() {
  return api('/api/teacher-groups/mine')
}

export function createGroup({ name, joinMode = 'approval' }) {
  return api('/api/teacher-groups', { method: 'POST', body: { name, join_mode: joinMode } })
}

/**
 * Redeem a code. Resolves to `{ joined: true, group }` on an open group, or
 * `{ joined: false, request_id }` when the owner has to approve first -- the
 * caller has to handle both, since one lands them in the group and the other
 * lands them in a queue.
 */
export function joinGroup(code) {
  return api('/api/teacher-groups/join', { method: 'POST', body: { code } })
}

export function approveRequest(requestId) {
  return api(`/api/teacher-groups/requests/${requestId}/approve`, { method: 'POST' })
}

export function denyRequest(requestId) {
  return api(`/api/teacher-groups/requests/${requestId}/deny`, { method: 'POST' })
}

/** Mints a new code and drops the old one, so a leaked code stops working. */
export function rotateGroupCode() {
  return api('/api/teacher-groups/code/rotate', { method: 'POST' })
}

export function leaveGroup() {
  return api('/api/teacher-groups/leave', { method: 'POST' })
}
