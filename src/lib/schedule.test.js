import { describe, it, expect } from 'vitest'
import { formatSchedule, parseSchedule, scheduleMeetings, scheduleOverlap } from './schedule'

describe('formatSchedule', () => {
  it('passes a typed string through', () => {
    expect(formatSchedule('MWF 8:00 AM – 9:30 AM')).toBe('MWF 8:00 AM – 9:30 AM')
  })

  it('returns empty for null, undefined and empty values', () => {
    expect(formatSchedule(null)).toBe('')
    expect(formatSchedule(undefined)).toBe('')
    expect(formatSchedule('')).toBe('')
    expect(formatSchedule({})).toBe('')
  })

  it('renders the seeded object shape instead of crashing React', () => {
    // The exact document that took down the dashboard: demo-sci9-newton.
    const seeded = {
      friday: [{ start: '10:00', end: '11:00', room: 'Sci Lab 2' }],
      wednesday: [{ start: '08:00', end: '09:00', room: 'Sci Lab 2' }],
      monday: [{ start: '08:00', end: '09:00', room: 'Sci Lab 2' }],
    }
    expect(formatSchedule(seeded)).toBe(
      'Mon/Wed 08:00–09:00 (Sci Lab 2) · Fri 10:00–11:00 (Sci Lab 2)'
    )
  })

  it('orders by weekday, not by object key order', () => {
    const out = formatSchedule({
      friday: [{ start: '10:00', end: '11:00' }],
      monday: [{ start: '08:00', end: '09:00' }],
    })
    expect(out.indexOf('Mon')).toBeLessThan(out.indexOf('Fri'))
  })

  it('handles a single day and a bare (non-array) slot', () => {
    expect(formatSchedule({ tuesday: [{ start: '13:00', end: '16:00', room: 'CL3' }] }))
      .toBe('Tue 13:00–16:00 (CL3)')
    expect(formatSchedule({ monday: { start: '07:00', end: '08:00' } }))
      .toBe('Mon 07:00–08:00')
  })

  it('omits the room when none is recorded', () => {
    expect(formatSchedule({ monday: [{ start: '08:00', end: '09:00' }] }))
      .toBe('Mon 08:00–09:00')
  })
})

/* T-26 (andecobs-42): two classes on "TTh 1:00 PM – 2:30 PM" were created
   without a word. The check that now warns reads both stored shapes through
   these. */
describe('parseSchedule', () => {
  it('reads the day chips and the pickers back out of a typed string', () => {
    expect(parseSchedule('TTh 1:00 PM – 2:30 PM')).toEqual({
      days: ['T', 'Th'],
      startHour: '1', startMinute: '00', startPeriod: 'PM',
      endHour: '2', endMinute: '30', endPeriod: 'PM',
    })
  })

  it('does not read the M in "PM" as Monday, and keeps Tuesday beside Thursday', () => {
    // The old includes() scan put Monday on every afternoon class and turned
    // "TTh" into Thursday alone.
    expect(parseSchedule('TTh 1:00 PM – 2:30 PM').days).toEqual(['T', 'Th'])
    expect(parseSchedule('F 8:00 AM – 9:30 AM').days).toEqual(['F'])
    expect(parseSchedule('MTWThFSaSu 7:00 AM – 8:00 AM').days).toEqual(['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'])
  })

  it('falls back to the picker defaults on blank input', () => {
    expect(parseSchedule('')).toEqual({
      days: [], startHour: '8', startMinute: '00', startPeriod: 'AM', endHour: '9', endMinute: '30', endPeriod: 'AM',
    })
    expect(parseSchedule(undefined).days).toEqual([])
  })
})

describe('scheduleOverlap', () => {
  const derick = 'TTh 1:00 PM – 2:30 PM'

  it('names the shared days and window when two classes meet at once', () => {
    const hit = scheduleOverlap(derick, 'TTh 1:00 PM – 2:30 PM')
    expect(hit).not.toBeNull()
    expect(hit.days).toEqual(['tuesday', 'thursday'])
    expect(hit.label).toBe('Tue/Thu 1:00–2:30 PM')
  })

  it('reports only the minutes that actually overlap', () => {
    const hit = scheduleOverlap(derick, 'T 2:00 PM – 4:00 PM')
    expect(hit.days).toEqual(['tuesday'])
    expect(hit.label).toBe('Tue 2:00–2:30 PM')
  })

  it('treats back-to-back classes as no clash', () => {
    expect(scheduleOverlap(derick, 'TTh 2:30 PM – 4:00 PM')).toBeNull()
    expect(scheduleOverlap(derick, 'TTh 11:00 AM – 1:00 PM')).toBeNull()
  })

  it('treats the same hours on other days as no clash', () => {
    expect(scheduleOverlap(derick, 'MWF 1:00 PM – 2:30 PM')).toBeNull()
  })

  it('reads the seeded object shape against a typed string', () => {
    const seeded = {
      thursday: [{ start: '13:30', end: '15:00', room: 'Sci Lab 2' }],
      monday: [{ start: '08:00', end: '09:00', room: 'Sci Lab 2' }],
    }
    expect(scheduleOverlap(derick, seeded)?.label).toBe('Thu 1:30–2:30 PM')
    expect(scheduleOverlap(seeded, derick)?.label).toBe('Thu 1:30–2:30 PM')
    expect(scheduleOverlap(seeded, 'MWF 9:00 AM – 10:00 AM')).toBeNull()
  })

  it('spans the period boundary in the label when the clash does', () => {
    expect(scheduleOverlap('M 11:00 AM – 1:00 PM', 'M 11:30 AM – 2:00 PM')?.label).toBe('Mon 11:30 AM–1:00 PM')
  })

  it('never throws on blank or free-text schedules', () => {
    expect(scheduleOverlap('', derick)).toBeNull()
    expect(scheduleOverlap(null, derick)).toBeNull()
    expect(scheduleOverlap('after lunch, ask the registrar', derick)).toBeNull()
    expect(scheduleOverlap({ monday: [{ start: 'tbd' }] }, derick)).toBeNull()
  })
})

/* `scheduleMeetings` is what decides which weekdays a class actually meets. It
   arrived with T-26 untested, and T-41 then built the Whole-term grid's columns
   on top of it: the term sheet lists every recorded day plus this function's
   weekdays between the first record and today. So a wrong answer here either
   invents columns for days the class never met, or drops the gap that shows a
   teacher which session they forgot to take. Both edges are pinned. */
describe('scheduleMeetings', () => {
  it('reads the weekdays and times out of a typed schedule', () => {
    expect(scheduleMeetings('MWF 8:00 AM – 9:00 AM')).toEqual([
      { day: 'monday', start: 480, end: 540 },
      { day: 'wednesday', start: 480, end: 540 },
      { day: 'friday', start: 480, end: 540 },
    ])
  })

  it('keeps Tuesday and Thursday apart, and does not read the M in PM', () => {
    expect(scheduleMeetings('TTh 1:00 PM – 2:30 PM').map((m) => m.day))
      .toEqual(['tuesday', 'thursday'])
  })

  it('reads the seeded object shape, one entry per slot', () => {
    const stored = {
      monday: [{ start: '08:00', end: '09:00', room: 'Sci Lab 2' }],
      friday: [{ start: '10:00', end: '11:00' }],
    }
    expect(scheduleMeetings(stored)).toEqual([
      { day: 'monday', start: 480, end: 540 },
      { day: 'friday', start: 600, end: 660 },
    ])
  })

  it('yields nothing for free text from before the pickers', () => {
    // The term grid falls back to the recorded days on this, rather than
    // inventing a calendar -- and an overlap check must never block a save.
    expect(scheduleMeetings('every other Tuesday, room TBA')).toEqual([])
    expect(scheduleMeetings('MWF')).toEqual([])
  })

  it('yields nothing rather than throwing on empty or missing input', () => {
    for (const bad of ['', null, undefined, 42, {}]) {
      expect(scheduleMeetings(bad)).toEqual([])
    }
  })

  it('skips a slot with no usable times instead of dropping the whole schedule', () => {
    const stored = {
      monday: [{ start: '08:00', end: '09:00' }],
      tuesday: [{ room: 'no times here' }],
    }
    expect(scheduleMeetings(stored).map((m) => m.day)).toEqual(['monday'])
  })
})
