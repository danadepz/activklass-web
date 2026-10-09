/**
 * T-153 (andecobs-219): A class can only start or end on the hour or half hour.
 *
 * Pins:
 * - MINUTE_OPTIONS provides 5-minute step options ('00' through '55')
 * - Start Minute and End Minute selects offer these options
 * - Non-half-hour schedules (e.g. 7:45 AM – 8:45 AM) validate cleanly
 * - Classes under 1 hour are still caught (MIN_LENGTH = 60)
 * - parseSchedule parses non-half-hour minutes accurately
 * - scheduleOverlap accurately detects overlaps with non-half-hour minutes
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseSchedule, scheduleOverlap } from '../../lib/schedule.js'
import { MINUTE_OPTIONS } from './ClassFormModal.jsx'

const source = readFileSync(
  fileURLToPath(new URL('./ClassFormModal.jsx', import.meta.url)),
  'utf8'
)

describe('T-153 — 5-minute increments for class schedule start and end minutes', () => {
  it('defines MINUTE_OPTIONS with 12 five-minute intervals from 00 to 55', () => {
    expect(MINUTE_OPTIONS).toEqual([
      '00', '05', '10', '15', '20', '25',
      '30', '35', '40', '45', '50', '55',
    ])
  })

  it('renders MINUTE_OPTIONS in both startMinute and endMinute dropdowns', () => {
    // Both selects should iterate over MINUTE_OPTIONS
    expect(source).toMatch(/value=\{startMinute\}[\s\S]*?MINUTE_OPTIONS\.map/)
    expect(source).toMatch(/value=\{endMinute\}[\s\S]*?MINUTE_OPTIONS\.map/)
  })

  it('parses a 7:45 AM – 8:45 AM class schedule back into exact minutes', () => {
    const parsed = parseSchedule('ThF 7:45 AM – 8:45 AM')
    expect(parsed.days).toEqual(['Th', 'F'])
    expect(parsed.startHour).toBe('7')
    expect(parsed.startMinute).toBe('45')
    expect(parsed.startPeriod).toBe('AM')
    expect(parsed.endHour).toBe('8')
    expect(parsed.endMinute).toBe('45')
    expect(parsed.endPeriod).toBe('AM')
  })

  it('detects a schedule overlap between non-half-hour and standard classes', () => {
    const hit = scheduleOverlap('ThF 7:45 AM – 8:45 AM', 'Th 8:00 AM – 9:30 AM')
    expect(hit).not.toBeNull()
    expect(hit.days).toContain('thursday')
    expect(hit.label).toContain('8:00–8:45 AM')
  })

  it('does not falsely flag touching back-to-back classes with non-half-hour times', () => {
    const hit = scheduleOverlap('ThF 7:45 AM – 8:45 AM', 'Th 8:45 AM – 9:45 AM')
    expect(hit).toBeNull()
  })
})
