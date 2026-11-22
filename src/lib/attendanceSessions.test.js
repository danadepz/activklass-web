import { describe, expect, it } from 'vitest'
import {
  cancelBlocker,
  plannedMeetingDates,
  rescheduleBlocker,
  sessionLedger,
  studentAttendanceEvidence,
} from './attendanceSessions'

// Synthetic fixtures only. 2026-11-02 is a Monday.
const MWF = { monday: [{ start: '08:00', end: '09:00' }], wednesday: [{ start: '08:00', end: '09:00' }], friday: [{ start: '08:00', end: '09:00' }] }
const mark = (status) => ({ status, remarks: '' })

describe('plannedMeetingDates · schedule recurrence', () => {
  it('lists every scheduled weekday in range, inclusive', () => {
    expect(plannedMeetingDates(MWF, '2026-11-02', '2026-11-09')).toEqual(
      ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09'],
    )
  })

  it('reads the typed schedule string the class form writes', () => {
    expect(plannedMeetingDates('TTh 1:00 PM – 2:30 PM', '2026-11-02', '2026-11-08')).toEqual(['2026-11-03', '2026-11-05'])
  })

  it('plans nothing for free text, or a bad range, rather than guessing', () => {
    expect(plannedMeetingDates('after lunch', '2026-11-02', '2026-11-30')).toEqual([])
    expect(plannedMeetingDates(MWF, 'nope', '2026-11-30')).toEqual([])
  })
})

describe('sessionLedger · planned vs confirmed', () => {
  const days = [
    { date: '2026-11-02', records: { s1: mark('present') } },
    { date: '2026-11-04', session_status: 'cancelled', records: {} },
    { date: '2026-11-06', session_status: 'rescheduled', rescheduled_to: '2026-11-07', records: {} },
    { date: '2026-11-07', rescheduled_from: '2026-11-06', records: { s1: mark('late') } },
    // 11-09 planned, never recorded
  ]

  it('puts each date in exactly one state', () => {
    const { sessions, counts } = sessionLedger(days, MWF, '2026-11-11')
    const state = Object.fromEntries(sessions.map((s) => [s.date, s.state]))
    expect(state).toEqual({
      '2026-11-02': 'recorded',
      '2026-11-04': 'cancelled',
      '2026-11-06': 'rescheduled',
      '2026-11-07': 'recorded',
      '2026-11-09': 'unconfirmed',
      '2026-11-11': 'unconfirmed',
    })
    expect(counts).toEqual({ planned: 5, recorded: 2, unconfirmed: 2, upcoming: 0, cancelled: 1, rescheduled: 1 })
  })

  it('keeps a future make-up date upcoming, not unconfirmed', () => {
    const { sessions } = sessionLedger(
      [{ date: '2026-11-02', records: { s1: mark('present') } }, { date: '2026-11-20', rescheduled_from: '2026-11-04', records: {} }],
      MWF, '2026-11-02',
    )
    expect(sessions.find((s) => s.date === '2026-11-20').state).toBe('upcoming')
  })

  it('reports nothing planned when no day is stored yet (no invented term start)', () => {
    expect(sessionLedger([], MWF, '2026-11-30').counts.planned).toBe(0)
  })
})

describe('studentAttendanceEvidence · missing records are not marks', () => {
  const days = [
    { date: '2026-11-06', records: { s1: mark('absent'), s2: mark('present') } },
    { date: '2026-11-02', records: { s1: mark('present'), s2: mark('present') } },
    { date: '2026-11-04', records: { s2: mark('present') } }, // s1 not recorded
    { date: '2026-11-05', records: { s1: mark('excused'), s2: mark('late') } },
    { date: '2026-11-09', session_status: 'cancelled', records: {} },
    { date: '2026-11-10', records: {} }, // nothing recorded for anyone: not held
  ]

  it('counts held sessions, keeps marks chronological, and discloses gaps', () => {
    expect(studentAttendanceEvidence(days, 's1')).toEqual({
      heldSessions: 4, statuses: ['present', 'absent'], excused: 1, notRecorded: 1,
    })
  })

  it('never turns an unrecorded student into a mark', () => {
    expect(studentAttendanceEvidence(days, 'nobody')).toEqual({ heldSessions: 4, statuses: [], excused: 0, notRecorded: 4 })
  })
})

describe('cancel and reschedule guards', () => {
  const days = [
    { date: '2026-11-02', records: { s1: mark('present') } },
    { date: '2026-11-04', records: {} },
    { date: '2026-11-07', rescheduled_from: '2026-11-06', records: {} },
  ]

  it('refuses to cancel a recorded, already-cancelled, moved or make-up session', () => {
    expect(cancelBlocker(days[0])).toMatch(/marks are preserved/)
    expect(cancelBlocker(days[0])).not.toMatch(/clear every mark/i)
    expect(cancelBlocker({ session_status: 'cancelled' })).toMatch(/already cancelled/)
    expect(cancelBlocker({ session_status: 'rescheduled' })).toMatch(/moved/)
    expect(cancelBlocker(days[2])).toMatch(/make-up/)
    expect(cancelBlocker(undefined)).toBeNull()
    expect(cancelBlocker(days[1])).toBeNull()
  })

  it('refuses duplicates: an existing session or a regular meeting day', () => {
    const ok = (fromDate, toDate) => rescheduleBlocker({ fromDate, toDate, days, schedule: MWF })
    expect(ok('2026-11-04', '2026-11-07')).toMatch(/already has/)
    expect(ok('2026-11-04', '2026-11-09')).toMatch(/regular meeting day/)
    expect(ok('2026-11-04', '2026-11-04')).toMatch(/different date/)
    expect(ok('2026-11-04', '')).toMatch(/Pick the new date/)
    expect(ok('2026-11-02', '2026-11-08')).toMatch(/marks are preserved/)
    expect(ok('2026-11-03', '2026-11-08')).toMatch(/No meeting is planned/)
    expect(ok('2026-11-04', '2026-11-08')).toBeNull() // Sunday make-up
    expect(ok('2026-11-11', '2026-11-08')).toBeNull() // planned meeting with no doc yet
  })
})
