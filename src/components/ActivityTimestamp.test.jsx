/**
 * ActivityTimestamp: the relative wording, the hover's exact time, and the
 * empty state when a profile carries no last_active_at (which, until the
 * backend writes that field, is every profile).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ActivityTimestamp, { formatRelative, formatExact, toMillis, NO_ACTIVITY_LABEL } from './ActivityTimestamp.jsx'

const NOW = new Date(2026, 10, 15, 12, 0, 0).getTime()
const ago = (ms) => NOW - ms
const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatRelative', () => {
  it.each([
    [0, 'Just now'],
    [59 * 1000, 'Just now'],
    [MIN, '1 minute ago'],
    [20 * MIN, '20 minutes ago'],
    [59 * MIN, '59 minutes ago'],
    [HOUR, '1 hour ago'],
    [5 * HOUR, '5 hours ago'],
    [DAY, '1 day ago'],
    [2 * DAY, '2 days ago'],
    [29 * DAY, '29 days ago'],
    [60 * DAY, '2 months ago'],
    [400 * DAY, '1 year ago'],
  ])('%i ms ago reads "%s"', (delta, label) => {
    expect(formatRelative(ago(delta), NOW)).toBe(label)
  })

  it('reads a time slightly in the future as Just now, never a negative', () => {
    expect(formatRelative(NOW + 30 * 1000, NOW)).toBe('Just now')
  })

  it('accepts a Firestore Timestamp, a { seconds } object, a Date and an ISO string', () => {
    const ms = ago(2 * HOUR)
    expect(formatRelative({ toMillis: () => ms }, NOW)).toBe('2 hours ago')
    expect(formatRelative({ seconds: ms / 1000, nanoseconds: 0 }, NOW)).toBe('2 hours ago')
    expect(formatRelative(new Date(ms), NOW)).toBe('2 hours ago')
    expect(formatRelative(new Date(ms).toISOString(), NOW)).toBe('2 hours ago')
  })

  it('returns null for missing or unreadable values', () => {
    for (const v of [null, undefined, '', 'not a date', NaN]) {
      expect(formatRelative(v, NOW)).toBeNull()
      expect(toMillis(v)).toBeNull()
    }
  })
})

describe('formatExact', () => {
  it('gives the full date and time', () => {
    expect(formatExact(new Date(2026, 10, 15, 10, 21))).toBe('Nov 15, 2026, 10:21 AM')
  })
})

describe('<ActivityTimestamp>', () => {
  it('shows the empty-state label when there is no activity', () => {
    const html = renderToStaticMarkup(<ActivityTimestamp value={null} />)
    expect(html).toContain(NO_ACTIVITY_LABEL)
    expect(html).not.toContain('<time')
  })

  it('renders a <time> with the exact moment as its hover title', () => {
    const when = new Date(Date.now() - 3 * DAY)
    const html = renderToStaticMarkup(<ActivityTimestamp value={when} />)
    expect(html).toContain('3 days ago')
    expect(html).toContain(`dateTime="${when.toISOString()}"`)
    expect(html).toContain(`title="${formatExact(when)}"`)
  })
})
