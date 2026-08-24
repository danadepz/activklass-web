import { describe, it, expect } from 'vitest'
import { formatSchedule } from './schedule'

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
