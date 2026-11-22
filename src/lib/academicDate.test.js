import { describe, expect, it } from 'vitest'
import { formatAcademicDate, parseAcademicDate } from './academicDate'

describe('academic dates: typed and shown MM-DD-YYYY, stored YYYY-MM-DD (owner decision 2026-11-22)', () => {
  it('formats canonical dates with zero padding and no time-zone shift', () => {
    expect(formatAcademicDate('2026-11-03')).toBe('11-03-2026')
    expect(formatAcademicDate('2024-02-29')).toBe('02-29-2024')
    expect(formatAcademicDate('2026-01-01')).toBe('01-01-2026') // the day a UTC round trip would move
    expect(formatAcademicDate('2026-12-31')).toBe('12-31-2026')
  })

  it('leaves anything that is not a canonical date alone (legacy or missing values)', () => {
    expect(formatAcademicDate(null)).toBe('')
    expect(formatAcademicDate(undefined)).toBe('')
    expect(formatAcademicDate('soon')).toBe('soon')
  })

  it('parses MM-DD-YYYY to the canonical form', () => {
    expect(parseAcademicDate('11-03-2026')).toBe('2026-11-03')
    expect(parseAcademicDate(' 02-29-2024 ')).toBe('2024-02-29')
    expect(parseAcademicDate('02-29-2000')).toBe('2000-02-29')
  })

  it('refuses impossible days and other shapes', () => {
    for (const bad of ['02-30-2026', '02-29-2026', '02-29-1900', '04-31-2026', '13-01-2026', '00-10-2026', '01-32-2026',
      '2026-11-03', '11/03/2026', '1-3-2026', '', null]) {
      expect(parseAcademicDate(bad)).toBeNull()
    }
  })

  it('round-trips, and the canonical form still sorts in date order', () => {
    const typed = ['01-15-2027', '12-31-2026', '02-29-2024', '11-03-2026']
    const stored = typed.map(parseAcademicDate)
    expect(stored.map(formatAcademicDate)).toEqual(typed)
    expect([...stored].sort()).toEqual(['2024-02-29', '2026-11-03', '2026-12-31', '2027-01-15'])
  })
})
