/**
 * Audited attendance writes (2026-11-22 academic policy A6 / B4 / C5).
 *
 * Every change to `classes/{classId}/attendance/{date}` -- a first recording,
 * a correction, a cancel, a restore, either half of a move -- is written in ONE
 * transaction with an immutable event in `classes/{classId}/attendance_audit`.
 * The day carries `last_audit_id`; firestore.rules refuses a day write without
 * a new event, and refuses an event whose before/after marks, statuses, actor
 * or time do not match what the write actually did. So the history is not
 * something this file promises -- it is something the rules check.
 *
 * Limits, stated rather than hidden: the Admin SDK (server scripts, seeds)
 * bypasses rules, and a day stored before this existed has no events for its
 * earlier changes -- its first audited write records the state it found.
 */
import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { isCalendarDate } from './classForm'
import { formatAcademicDate } from './academicDate'

const REASON_MAX = 500
const NOT_A_DATE = 'That is not a real calendar date. Pick another date.'

/** A refusal the page shows as-is, thrown before anything is written. */
function notADate() {
  return Object.assign(new Error(NOT_A_DATE), { userMessage: NOT_A_DATE })
}

/** Field-order-independent equality for one student's {status, remarks} entry. */
function sameEntry(a, b) {
  const norm = (v) => JSON.stringify(Object.keys(v ?? {}).sort().map((k) => [k, v[k]]))
  return norm(a) === norm(b)
}

/** Student ids whose entry was added, removed or changed between two records maps. */
export function changedStudents(before = {}, after = {}) {
  const ids = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  return [...ids].filter((id) => !(id in (before ?? {})) || !(id in (after ?? {})) || !sameEntry(before[id], after[id])).sort()
}

/**
 * The event describing `before` -> `after` for one day. `kind` is given for a
 * session change (cancel / restore / reschedule_out / reschedule_in); for marks
 * it is derived: 'correction' when any changed student already had a mark,
 * otherwise 'record'. The rules derive it the same way and refuse a mismatch.
 */
export function buildAuditEvent({ date, actorUid, before, after, kind, reason }) {
  const beforeRecords = before?.records ?? {}
  const afterRecords = after?.records ?? {}
  const studentIds = changedStudents(beforeRecords, afterRecords)
  const event = {
    date,
    actor_uid: actorUid,
    at: serverTimestamp(),
    kind: kind ?? (studentIds.some((id) => id in beforeRecords) ? 'correction' : 'record'),
    before_exists: !!before,
    before_records: beforeRecords,
    after_records: afterRecords,
    before_status: before?.session_status ?? 'held',
    after_status: after?.session_status ?? 'held',
    student_ids: studentIds,
  }
  const related = after?.rescheduled_to ?? after?.rescheduled_from ?? null
  if (related) event.related_date = related
  const why = String(reason ?? '').trim().slice(0, REASON_MAX)
  if (why) event.reason = why
  return event
}

/**
 * Apply one or more day changes atomically, each with its audit event.
 * `changes`: [{ date, next(current) -> full next day data, kind?, reason? }].
 * `next` receives the day as stored right now (or null) and may throw an Error
 * to refuse -- the transaction then writes nothing. Returns the events written.
 */
export async function writeAttendanceDays(db, classId, actorUid, changes) {
  // Real calendar days only (owner decision 2026-11-22); firestore.rules
  // refuses the same ids and links, this just says so before the round trip.
  if (changes.some((c) => !isCalendarDate(c.date))) throw notADate()
  return runTransaction(db, async (tx) => {
    const refs = changes.map((c) => doc(db, 'classes', classId, 'attendance', c.date))
    const snaps = []
    for (const ref of refs) snaps.push(await tx.get(ref))
    const events = []
    changes.forEach((change, i) => {
      const current = snaps[i].exists() ? snaps[i].data() : null
      const auditRef = doc(collection(db, 'classes', classId, 'attendance_audit'))
      const next = { ...change.next(current), date: change.date, last_audit_id: auditRef.id }
      for (const link of [next.rescheduled_to, next.rescheduled_from]) {
        if (link != null && !isCalendarDate(link)) throw notADate()
      }
      const event = buildAuditEvent({
        date: change.date, actorUid, before: current, after: next, kind: change.kind, reason: change.reason,
      })
      tx.set(refs[i], next)
      tx.set(auditRef, event)
      events.push({ id: auditRef.id, ...event })
    })
    return events
  })
}

/** Audit events for a class, newest first; one date when `date` is given. */
export async function fetchAttendanceAudit(db, classId, date) {
  const base = collection(db, 'classes', classId, 'attendance_audit')
  const snap = await getDocs(date ? query(base, where('date', '==', date)) : base)
  const millis = (t) => (t?.toMillis ? t.toMillis() : 0)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b.at) - millis(a.at))
}

const KIND_LABEL = {
  record: 'Recorded', correction: 'Corrected', cancel: 'Cancelled', restore: 'Restored',
  reschedule_out: 'Moved away', reschedule_in: 'Make-up created',
}

/** One line per event for a teacher or admin to read: what changed, for whom. */
export function describeAuditEvent(event, nameOf = (id) => id) {
  const label = KIND_LABEL[event.kind] ?? event.kind
  const changes = (event.student_ids ?? []).map((id) => {
    const from = event.before_records?.[id]?.status ?? 'none'
    const to = event.after_records?.[id]?.status ?? 'none'
    return `${nameOf(id)}: ${from} → ${to}`
  })
  return [label, changes.join('; '), event.related_date ? `(${formatAcademicDate(event.related_date)})` : '', event.reason ? `— ${event.reason}` : '']
    .filter(Boolean).join(' ')
}
