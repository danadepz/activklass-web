import { describe, expect, it } from 'vitest'
import { relativeActivity } from './studentActivity'

const NOW = new Date('2026-11-16T12:00:00Z').getTime()

describe('relativeActivity', () => {
  it('formats minute and hour timestamps relatively', () => {
    expect(relativeActivity(new Date(NOW - 20 * 60_000), NOW)).toBe('20 minutes ago')
    expect(relativeActivity(new Date(NOW - 60 * 60_000), NOW)).toBe('1 hour ago')
  })

  it('handles recent, old, and missing values', () => {
    expect(relativeActivity(new Date(NOW + 60_000), NOW)).toBe('Just now')
    expect(relativeActivity(new Date(NOW - 2 * 86400_000), NOW)).toBe('2 days ago')
    expect(relativeActivity(null, NOW)).toBe('No activity yet')
    expect(relativeActivity('invalid', NOW)).toBe('No activity yet')
  })

  it('accepts Firestore timestamp objects', () => {
    expect(relativeActivity({ toDate: () => new Date(NOW - 3600_000) }, NOW)).toBe('1 hour ago')
  })
})
