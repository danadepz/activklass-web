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
    expect(counts).toEqual({
      planned: 5, recorded: 2, unconfirmed: 2, upcoming: 0, cancelled: 1, rescheduled: 1,
      makeup: 1, makeup_recorded: 1, makeup_unconfirmed: 0, makeup_upcoming: 0, // the 11-07 make-up, also in recorded
    })
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

  it('counts from the class start date when there is one, as unconfirmed -- never as absent', () => {
    const recorded = [{ date: '2026-11-09', records: { s1: mark('present') } }]
    const withStart = sessionLedger(recorded, MWF, '2026-11-11', '2026-11-02')
    expect(withStart.counts).toMatchObject({ planned: 5, recorded: 1, unconfirmed: 4 })
    expect(withStart).toMatchObject({ start: '2026-11-02', startSource: 'class' })
    const legacy = sessionLedger(recorded, MWF, '2026-11-11')
    expect(legacy.counts).toMatchObject({ planned: 2, recorded: 1, unconfirmed: 1 })
    expect(legacy).toMatchObject({ start: '2026-11-09', startSource: 'first_record' })
    expect(sessionLedger([], MWF, '2026-11-11')).toMatchObject({ start: null, startSource: null })
    // A malformed start is ignored rather than trusted.
    expect(sessionLedger(recorded, MWF, '2026-11-11', 'soon').startSource).toBe('first_record')
    // Unrecorded is never a mark: the student's evidence is unchanged by the start date.
    expect(studentAttendanceEvidence(recorded, 's1')).toEqual({ heldSessions: 1, statuses: ['present'], excused: 0, notRecorded: 0 })
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

describe('class end date bounds planned meetings (blocker fix, 2026-11-22)', () => {
  // MWF from Mon 2 Nov 2026. Recorded Mon 2 and Wed 4.
  const recorded = [
    { date: '2026-11-02', records: { s1: mark('present') } },
    { date: '2026-11-04', records: { s1: mark('absent') } },
  ]

  it('past end: no planned meeting after the end date, even though today is later', () => {
    const l = sessionLedger(recorded, MWF, '2026-11-20', '2026-11-02', '2026-11-06')
    expect(l.sessions.filter((s) => s.planned).map((s) => s.date)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06'])
    expect(l.counts).toMatchObject({ planned: 3, recorded: 2, unconfirmed: 1 })
    expect(l).toMatchObject({ end: '2026-11-06', endedBy: '2026-11-06' })
  })

  it('future end: plans to today, exactly as with no end date', () => {
    const withEnd = sessionLedger(recorded, MWF, '2026-11-11', '2026-11-02', '2026-12-18')
    const without = sessionLedger(recorded, MWF, '2026-11-11', '2026-11-02')
    expect(withEnd.counts).toEqual(without.counts)
    expect(withEnd.endedBy).toBeNull()
  })

  it('legacy class (no dates): behaviour unchanged', () => {
    const l = sessionLedger(recorded, MWF, '2026-11-11')
    expect(l.counts).toMatchObject({ planned: 5, recorded: 2, unconfirmed: 3 }) // 2,4,6,9,11 Nov
    expect(l).toMatchObject({ end: null, endedBy: null })
  })

  it('keeps stored days after the end: a moved make-up and its marks still count', () => {
    const days = [
      ...recorded,
      { date: '2026-11-06', session_status: 'rescheduled', rescheduled_to: '2026-11-10', records: {} },
      { date: '2026-11-10', rescheduled_from: '2026-11-06', records: { s1: mark('late') } },
    ]
    const l = sessionLedger(days, MWF, '2026-11-20', '2026-11-02', '2026-11-06')
    const madeUp = l.sessions.find((s) => s.date === '2026-11-10')
    expect(madeUp).toMatchObject({ state: 'recorded', planned: false, rescheduledFrom: '2026-11-06' })
    expect(l.counts).toMatchObject({ recorded: 3, rescheduled: 1, unconfirmed: 0 })
    // Marks are never touched by the end date: every recorded status is still evidence.
    expect(studentAttendanceEvidence(days, 's1').statuses).toEqual(['present', 'absent', 'late'])
  })

  it('ignores a malformed end date rather than trusting it', () => {
    expect(sessionLedger(recorded, MWF, '2026-11-11', '2026-11-02', 'June').counts)
      .toEqual(sessionLedger(recorded, MWF, '2026-11-11', '2026-11-02').counts)
  })
})

describe('make-ups after the class end date are allowed (owner decision 2026-11-22)', () => {
  // MWF from Mon 2 Nov; the class ends Fri 6 Nov. Wed 4 is unmarked.
  const days = [
    { date: '2026-11-02', records: { s1: mark('present') } },
    { date: '2026-11-04', records: {} },
    { date: '2026-11-11', rescheduled_from: '2026-11-03', records: {} }, // an existing make-up
  ]
  const move = (fromDate, toDate, endDate = '2026-11-06') =>
    rescheduleBlocker({ fromDate, toDate, days, schedule: MWF, endDate })

  it('allows an unmarked meeting to move past the end, even onto a scheduled weekday', () => {
    expect(move('2026-11-04', '2026-11-09')).toBeNull() // Monday after the end: no regular meeting there
    expect(move('2026-11-04', '2026-11-14')).toBeNull() // Saturday after the end
    // Without an end date that Monday is still a regular meeting and is refused.
    expect(move('2026-11-04', '2026-11-09', null)).toMatch(/regular meeting day/)
  })

  it('still refuses a marked meeting, a duplicate, a regular day before the end, and a non-meeting original', () => {
    expect(move('2026-11-02', '2026-11-14')).toMatch(/marks are preserved/)
    expect(move('2026-11-04', '2026-11-11')).toMatch(/already has/)
    expect(move('2026-11-04', '2026-11-06')).toMatch(/regular meeting day/)
    expect(move('2026-11-09', '2026-11-14')).toMatch(/No meeting is planned/) // past the end, nothing stored
  })

  it('refuses impossible calendar dates on either end', () => {
    expect(move('2026-11-04', '2026-02-30')).toMatch(/real calendar date/)
    expect(move('2026-11-04', '2027-02-29')).toMatch(/real calendar date/)
    expect(move('2026-04-31', '2026-11-14')).toMatch(/real calendar date/)
    expect(move('2026-11-04', '2028-02-29')).toBeNull() // a real leap day, after the end
  })

  it('counts a post-end make-up apart from planned meetings; no extra planned meeting appears', () => {
    const stored = [
      { date: '2026-11-02', records: { s1: mark('present') } },
      { date: '2026-11-04', session_status: 'rescheduled', rescheduled_to: '2026-11-09', records: {} },
      { date: '2026-11-09', rescheduled_from: '2026-11-04', records: { s1: mark('absent') } },
      { date: '2026-11-14', rescheduled_from: '2026-11-06', records: {} },
      { date: '2026-11-06', session_status: 'rescheduled', rescheduled_to: '2026-11-14', records: {} },
    ]
    const l = sessionLedger(stored, MWF, '2026-11-20', '2026-11-02', '2026-11-06')
    expect(l.sessions.filter((s) => s.planned).map((s) => s.date)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06'])
    expect(l.counts).toMatchObject({
      planned: 3, recorded: 2, unconfirmed: 1, rescheduled: 2,
      makeup: 2, makeup_recorded: 1, makeup_unconfirmed: 1, makeup_upcoming: 0,
    })
    // The attendance rate still reads every held, marked day -- the make-up included.
    expect(studentAttendanceEvidence(stored, 's1')).toMatchObject({ heldSessions: 2, statuses: ['present', 'absent'] })
  })
})
