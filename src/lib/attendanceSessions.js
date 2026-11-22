/**
 * Attendance sessions: which class meetings were planned, which were actually
 * held and recorded, and which were cancelled or moved.
 *
 * Pure -- no Firestore. The attendance page and useClassRisk feed it the
 * documents they already read from `classes/{classId}/attendance/{date}`.
 *
 * A day document may carry, beside `records`:
 *   session_status   'held' (default when absent) | 'cancelled' | 'rescheduled'
 *   rescheduled_to   on the ORIGINAL date's document: where the meeting moved
 *   rescheduled_from on the NEW date's document: where it came from
 *   cancel_reason    optional free text
 *
 * A cancelled or rescheduled-away date must hold no marks (firestore.rules
 * enforces it). Recorded sessions are blocked from cancellation/move so their
 * marks cannot be erased through the session controls.
 *
 * Unrecorded is never read as present or absent. A planned meeting with no
 * marks is "unconfirmed" -- the teacher has not said whether it happened.
 */
import { scheduleMeetings } from './schedule'

export const SESSION_STATUSES = ['held', 'cancelled', 'rescheduled']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }

export const sessionStatus = (day) => day?.session_status ?? 'held'
export const isIsoDate = (v) => typeof v === 'string' && ISO_DATE.test(v)

/** Recognised marks on a day document (present/late/absent/excused). */
export function markCount(day) {
  return Object.values(day?.records ?? {}).filter((r) => r?.status).length
}

/** Local-calendar ISO date of a Date; toISOString would shift a day near UTC midnight. */
function isoOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Scheduled weekdays as JS day numbers; free-text schedules yield none. */
export function scheduledWeekdays(schedule) {
  return new Set(scheduleMeetings(schedule).map((m) => WEEKDAY_INDEX[m.day]))
}

/** Every scheduled meeting date from `startIso` to `endIso`, inclusive. */
export function plannedMeetingDates(schedule, startIso, endIso) {
  const weekdays = scheduledWeekdays(schedule)
  if (!weekdays.size || !isIsoDate(startIso) || !isIsoDate(endIso)) return []
  const out = []
  const cursor = new Date(`${startIso}T00:00:00`)
  const end = new Date(`${endIso}T00:00:00`)
  while (cursor <= end) {
    if (weekdays.has(cursor.getDay())) out.push(isoOf(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/**
 * The class calendar, one entry per date, each in exactly one state:
 *   recorded     held, with at least one mark          -> counts toward attendance
 *   unconfirmed  planned or held, on/before today, no marks
 *   upcoming     planned or moved-in, after today, no marks
 *   cancelled    teacher cancelled it                  -> excluded
 *   rescheduled  moved away to `rescheduled_to`        -> excluded (the new date counts)
 *
 * `days` is `[{ date, ...docData }]`. The term start is the earliest stored
 * day unless `startIso` is given. Since 2026-11-22 a class
 * carries `start_date` (policy A1) and callers pass it; a legacy class without
 * one falls back to the earliest stored day, so meetings before that are not
 * counted -- never invented as missed. `start` / `startSource` ('class' |
 * 'first_record' | null) say which applied.
 *
 * `endIso` (the class's `end_date`, 2026-11-22 blocker fix): the LAST date a
 * meeting is planned. No planned meeting is generated after it, even when
 * today is later. Stored days after it -- a make-up moved past the end, marks
 * already recorded -- are kept exactly as before. No end date: plan to today.
 */
export function sessionLedger(days, schedule, todayIso, startIso, endIso) {
  const byDate = new Map()
  for (const d of days ?? []) {
    const date = d?.date ?? d?.id
    if (isIsoDate(date)) byDate.set(date, d)
  }
  const classStart = typeof startIso === 'string' && isIsoDate(startIso) ? startIso : null
  const start = classStart ?? [...byDate.keys()].sort()[0]
  const classEnd = typeof endIso === 'string' && isIsoDate(endIso) ? endIso : null
  const planUntil = classEnd && classEnd < todayIso ? classEnd : todayIso
  const planned = new Set(start ? plannedMeetingDates(schedule, start, planUntil) : [])
  const dates = [...new Set([...planned, ...byDate.keys()])].sort()

  const sessions = dates.map((date) => {
    const day = byDate.get(date)
    const status = sessionStatus(day)
    const marks = markCount(day)
    let state
    if (status === 'cancelled') state = 'cancelled'
    else if (status === 'rescheduled') state = 'rescheduled'
    else if (marks > 0) state = 'recorded'
    else state = date > todayIso ? 'upcoming' : 'unconfirmed'
    return {
      date,
      state,
      planned: planned.has(date),
      marks,
      rescheduledTo: day?.rescheduled_to ?? null,
      rescheduledFrom: day?.rescheduled_from ?? null,
    }
  })

  const counts = { planned: planned.size, recorded: 0, unconfirmed: 0, upcoming: 0, cancelled: 0, rescheduled: 0 }
  for (const s of sessions) counts[s.state] += 1
  return {
    sessions,
    counts,
    start: start ?? null,
    startSource: classStart ? 'class' : start ? 'first_record' : null,
    end: classEnd,
    endedBy: classEnd && classEnd < todayIso ? classEnd : null,
  }
}

/**
 * One student's attendance evidence across held sessions, oldest first.
 * `marks` is the chronological status list the rate and trend use; excused
 * and unrecorded sessions are counted, never turned into a mark.
 */
export function studentAttendanceEvidence(days, studentId) {
  const held = [...(days ?? [])]
    .filter((d) => sessionStatus(d) === 'held' && markCount(d) > 0)
    .sort((a, b) => String(a.date ?? a.id).localeCompare(String(b.date ?? b.id)))
  const statuses = []
  let excused = 0
  let notRecorded = 0
  for (const d of held) {
    const status = d.records?.[studentId]?.status
    if (!status) notRecorded += 1
    else if (status === 'excused') excused += 1
    else statuses.push(status)
  }
  return { heldSessions: held.length, statuses, excused, notRecorded }
}

/** Why `day` cannot be cancelled, or null. */
export function cancelBlocker(day) {
  // shortcut: a make-up (rescheduled_from) session cannot be cancelled or moved again;
  // undoing a move is an admin edit until a teacher-facing "undo" is designed.
  const status = sessionStatus(day)
  if (status === 'cancelled') return 'This session is already cancelled.'
  if (status === 'rescheduled') return 'This session was moved to another date.'
  if (day?.rescheduled_from) return 'This is a make-up session. Record it, or leave it unrecorded.'
  if (markCount(day) > 0) return 'Attendance is already recorded for this date. Cancelling is unavailable so the recorded marks are preserved.'
  return null
}

/**
 * Why the meeting on `fromDate` cannot move to `toDate`, or null.
 * `days` is the class's stored day documents. A target that already has a
 * document, or that is itself a regular meeting day, would merge two sessions
 * into one date -- refused rather than silently doubled up.
 */
export function rescheduleBlocker({ fromDate, toDate, days, schedule }) {
  if (!isIsoDate(toDate)) return 'Pick the new date.'
  if (toDate === fromDate) return 'Pick a different date from the original.'
  const byDate = new Map((days ?? []).map((d) => [d.date ?? d.id, d]))
  const from = byDate.get(fromDate)
  const blocked = cancelBlocker(from)
  if (blocked) return blocked
  const weekdays = scheduledWeekdays(schedule)
  const isMeetingDay = (iso) => weekdays.has(new Date(`${iso}T00:00:00`).getDay())
  if (!from && !isMeetingDay(fromDate)) return 'No meeting is planned on this date.'
  if (byDate.has(toDate)) return 'That date already has an attendance session.'
  if (isMeetingDay(toDate)) {
    return 'That date is already a regular meeting day for this class.'
  }
  return null
}
