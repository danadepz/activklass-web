/**
 * Unit tests for the derived console statistics in ./superadminAnalytics.js.
 *
 * Fixtures mirror the /api/superadmin/subscribers payload: each row is
 * { subscription, owner, usage }, with usage slots shaped by
 * app/services/subscription_usage.py — { used, seats, pct, over }, where a null
 * `seats` means the plan is uncapped.
 *
 * Month bucketing is local-time, so every date fixture is built with the
 * local-time Date constructor rather than a UTC string. That keeps these
 * deterministic in any timezone; parseCreatedAt is tested separately against
 * absolute instants.
 */
import { describe, expect, it } from 'vitest'
import {
  analyticsFor,
  filterRows,
  parseCreatedAt,
  planKey,
  planLabel,
  planMix,
  segmentOf,
  signupsByMonth,
  summarize,
} from './superadminAnalytics.js'

const slot = (used, seats) => ({
  used,
  seats,
  pct: seats ? Math.round((used / seats) * 100) : null,
  over: Boolean(seats && used > seats),
})

const row = ({
  id = 's1',
  type = 'institution',
  plan = 'standard',
  status = 'active',
  createdAt = null,
  teachers = slot(0, 10),
  students = slot(0, 500),
} = {}) => ({
  subscription: { id, type, plan, status, created_at: createdAt },
  owner: { kind: type, name: id },
  usage: { teachers, students },
})

describe('segmentOf / planKey / planLabel', () => {
  it('treats anything that is not an institution as a solo teacher', () => {
    expect(segmentOf(row({ type: 'institution' }))).toBe('institution')
    expect(segmentOf(row({ type: 'teacher' }))).toBe('teacher')
    // Built raw, not via row(): the helper's default parameter would fill the
    // missing type back in and the case would go untested.
    expect(segmentOf({ subscription: {} })).toBe('teacher')
    expect(segmentOf({})).toBe('teacher')
    expect(segmentOf(null)).toBe('teacher')
  })

  it('keys a plan by type as well as name', () => {
    // The catalogue has a "standard" plan under BOTH institution and teacher,
    // and they are different products. Keying on the name alone merges a
    // 50-teacher school with a solo teacher.
    expect(planKey(row({ type: 'institution', plan: 'standard' }))).toBe('institution:standard')
    expect(planKey(row({ type: 'teacher', plan: 'standard' }))).toBe('teacher:standard')
  })

  it('labels a missing plan as unassigned rather than blank', () => {
    expect(planKey({ subscription: { type: 'institution' } })).toBe('institution:unassigned')
    expect(planKey(row({ plan: '   ' }))).toBe('institution:unassigned')
    expect(planLabel('institution:unassigned')).toBe('Institution · unassigned')
    expect(planLabel('teacher:plus')).toBe('Solo · plus')
  })
})

describe('parseCreatedAt', () => {
  it('parses an ISO-8601 string', () => {
    expect(parseCreatedAt('2026-08-19T01:23:45Z').getTime()).toBe(Date.UTC(2026, 7, 19, 1, 23, 45))
  })

  it("parses the RFC-1123 form Flask's default JSON provider emits", () => {
    // Firestore SERVER_TIMESTAMP reaches the client through Flask's encoder,
    // which does not guarantee ISO.
    expect(parseCreatedAt('Wed, 19 Aug 2026 01:23:45 GMT').getTime()).toBe(
      Date.UTC(2026, 7, 19, 1, 23, 45),
    )
  })

  it('parses the Firestore { seconds } and { _seconds } object shapes', () => {
    const seconds = Math.floor(Date.UTC(2026, 7, 19) / 1000)
    expect(parseCreatedAt({ seconds, nanoseconds: 0 }).getTime()).toBe(seconds * 1000)
    expect(parseCreatedAt({ _seconds: seconds, _nanoseconds: 0 }).getTime()).toBe(seconds * 1000)
  })

  it('parses epoch milliseconds and passes a Date through', () => {
    const when = Date.UTC(2026, 7, 19)
    expect(parseCreatedAt(when).getTime()).toBe(when)
    expect(parseCreatedAt(new Date(when)).getTime()).toBe(when)
  })

  it('returns null for a pending or unusable timestamp', () => {
    // A row written moments ago still carries null while the server resolves
    // the sentinel; `new Date(undefined)` would give an Invalid Date whose NaN
    // survives every downstream comparison.
    expect(parseCreatedAt(null)).toBeNull()
    expect(parseCreatedAt(undefined)).toBeNull()
    expect(parseCreatedAt('')).toBeNull()
    expect(parseCreatedAt('   ')).toBeNull()
    expect(parseCreatedAt('not a date')).toBeNull()
    expect(parseCreatedAt({})).toBeNull()
    expect(parseCreatedAt({ seconds: 'soon' })).toBeNull()
    expect(parseCreatedAt(new Date('nope'))).toBeNull()
    expect(parseCreatedAt(NaN)).toBeNull()
  })
})

describe('filterRows', () => {
  const rows = [
    row({ id: 'i1', type: 'institution', status: 'active' }),
    row({ id: 'i2', type: 'institution', status: 'suspended' }),
    row({ id: 't1', type: 'teacher', status: 'active' }),
    row({ id: 't2', type: 'teacher', status: 'trial' }),
  ]
  const ids = (list) => list.map((r) => r.subscription.id)

  it('returns everything by default', () => {
    expect(filterRows(rows)).toHaveLength(4)
    expect(filterRows(rows, {})).toHaveLength(4)
    expect(ids(filterRows(rows, { segment: 'all', status: 'all' }))).toEqual([
      'i1', 'i2', 't1', 't2',
    ])
  })

  it('filters by segment', () => {
    expect(ids(filterRows(rows, { segment: 'institution' }))).toEqual(['i1', 'i2'])
    expect(ids(filterRows(rows, { segment: 'teacher' }))).toEqual(['t1', 't2'])
  })

  it('filters by status', () => {
    expect(ids(filterRows(rows, { status: 'active' }))).toEqual(['i1', 't1'])
    expect(ids(filterRows(rows, { status: 'trial' }))).toEqual(['t2'])
  })

  it('applies both filters together', () => {
    expect(ids(filterRows(rows, { segment: 'teacher', status: 'active' }))).toEqual(['t1'])
    expect(filterRows(rows, { segment: 'institution', status: 'trial' })).toEqual([])
  })

  it('preserves the incoming order', () => {
    expect(ids(filterRows(rows, { status: 'active' }))).toEqual(['i1', 't1'])
  })

  it('handles a missing rows list', () => {
    expect(filterRows(undefined)).toEqual([])
    expect(filterRows(null, { segment: 'teacher' })).toEqual([])
  })
})

describe('summarize', () => {
  it('counts segments, statuses and over-seat subscribers', () => {
    const rows = [
      row({ type: 'institution', status: 'active' }),
      row({ type: 'institution', status: 'suspended' }),
      row({ type: 'teacher', status: 'trial' }),
      row({ type: 'teacher', status: 'cancelled' }),
      row({ type: 'teacher', status: 'active', students: slot(200, 150) }),
    ]
    const s = summarize(rows)
    expect(s.total).toBe(5)
    expect(s.institutions).toBe(2)
    expect(s.teachers).toBe(3)
    expect(s.byStatus).toEqual({ active: 2, trial: 1, suspended: 1, cancelled: 1 })
    expect(s.overSeats).toBe(1)
  })

  it('counts a subscriber over on either slot exactly once', () => {
    const rows = [row({ teachers: slot(12, 10), students: slot(900, 500) })]
    expect(summarize(rows).overSeats).toBe(1)
  })

  it('ignores an unrecognised status rather than inventing a bucket', () => {
    const s = summarize([row({ status: 'pending_review' })])
    expect(s.total).toBe(1)
    expect(s.byStatus).toEqual({ active: 0, trial: 0, suspended: 0, cancelled: 0 })
  })

  it('aggregates capped seats across subscribers', () => {
    const rows = [
      row({ students: slot(250, 500) }),
      row({ students: slot(150, 500) }),
    ]
    // 400 of 1000 = 40%
    expect(summarize(rows).students).toMatchObject({ used: 400, seats: 1000, pct: 40 })
  })

  it('excludes uncapped subscribers from both sides of utilisation', () => {
    // Counting an unlimited plan as zero seats would push utilisation over 100%
    // and pin the meter red; counting its usage against nothing would deflate it.
    const rows = [
      row({ students: slot(250, 500) }),
      row({ id: 'unl', students: { used: 900, seats: null, pct: null, over: false } }),
    ]
    const s = summarize(rows).students
    expect(s).toMatchObject({ used: 250, seats: 500, pct: 50, unlimited: 1, uncapped: 900 })
  })

  it('reports null utilisation when nothing is capped, not zero', () => {
    const rows = [row({ students: { used: 40, seats: null, pct: null, over: false } })]
    const s = summarize(rows).students
    // "no data" and "0% used" are different states and the meter draws them
    // differently.
    expect(s.pct).toBeNull()
    expect(s.unlimited).toBe(1)
    expect(s.uncapped).toBe(40)
  })

  it('treats a zero or negative seat cap as uncapped rather than dividing by it', () => {
    const rows = [row({ students: { used: 5, seats: 0, pct: null, over: false } })]
    expect(summarize(rows).students.pct).toBeNull()
  })

  it('aggregates teacher seats independently of student seats', () => {
    const rows = [row({ teachers: slot(8, 10), students: slot(100, 500) })]
    const s = summarize(rows)
    expect(s.teacherSeats).toMatchObject({ used: 8, seats: 10, pct: 80 })
    expect(s.students).toMatchObject({ used: 100, seats: 500, pct: 20 })
  })

  it('handles an empty or missing roster', () => {
    for (const empty of [[], undefined, null]) {
      const s = summarize(empty)
      expect(s.total).toBe(0)
      expect(s.overSeats).toBe(0)
      expect(s.students.pct).toBeNull()
      expect(s.byStatus).toEqual({ active: 0, trial: 0, suspended: 0, cancelled: 0 })
    }
  })

  it('survives a row with no usage block', () => {
    const s = summarize([{ subscription: { type: 'teacher', status: 'active' } }])
    expect(s.total).toBe(1)
    expect(s.overSeats).toBe(0)
    expect(s.students.pct).toBeNull()
  })
})

describe('planMix', () => {
  it('counts plans biggest first', () => {
    const rows = [
      row({ type: 'institution', plan: 'pilot' }),
      row({ type: 'institution', plan: 'standard' }),
      row({ type: 'institution', plan: 'standard' }),
      row({ type: 'teacher', plan: 'plus' }),
    ]
    expect(planMix(rows)).toEqual([
      { key: 'institution:standard', label: 'Institution · standard', count: 2 },
      { key: 'institution:pilot', label: 'Institution · pilot', count: 1 },
      { key: 'teacher:plus', label: 'Solo · plus', count: 1 },
    ])
  })

  it('keeps the two "standard" plans apart', () => {
    const rows = [
      row({ type: 'institution', plan: 'standard' }),
      row({ type: 'teacher', plan: 'standard' }),
    ]
    expect(planMix(rows)).toHaveLength(2)
    expect(planMix(rows).map((p) => p.key)).toEqual(['institution:standard', 'teacher:standard'])
  })

  it('breaks count ties alphabetically so the bar order does not flicker', () => {
    const rows = [
      row({ type: 'teacher', plan: 'plus' }),
      row({ type: 'institution', plan: 'pilot' }),
    ]
    // Sorting on count alone lets equal plans swap places on every refetch.
    expect(planMix(rows).map((p) => p.label)).toEqual(['Institution · pilot', 'Solo · plus'])
    expect(planMix([...rows].reverse()).map((p) => p.label)).toEqual([
      'Institution · pilot',
      'Solo · plus',
    ])
  })

  it('returns an empty list for an empty roster', () => {
    expect(planMix([])).toEqual([])
    expect(planMix(undefined)).toEqual([])
  })
})

describe('signupsByMonth', () => {
  // Local-time construction keeps this timezone-independent.
  const now = new Date(2026, 7, 19) // 19 Aug 2026

  it('returns a full trailing window, oldest first', () => {
    const { buckets } = signupsByMonth([], 6, now)
    expect(buckets.map((b) => b.label)).toEqual(['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'])
    expect(buckets.map((b) => b.key)).toEqual([
      '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
    ])
  })

  it('keeps empty months as zero columns instead of dropping them', () => {
    // A vanished month would compress the axis and misread as a shorter window.
    const rows = [row({ createdAt: new Date(2026, 7, 3) })]
    const { buckets } = signupsByMonth(rows, 6, now)
    expect(buckets.map((b) => b.count)).toEqual([0, 0, 0, 0, 0, 1])
  })

  it('buckets signups into the right months and reports the peak', () => {
    const rows = [
      row({ createdAt: new Date(2026, 5, 2) }),
      row({ createdAt: new Date(2026, 5, 20) }),
      row({ createdAt: new Date(2026, 6, 9) }),
      row({ createdAt: new Date(2026, 7, 1) }),
      row({ createdAt: new Date(2026, 7, 18) }),
      row({ createdAt: new Date(2026, 7, 19) }),
    ]
    const { buckets, peak } = signupsByMonth(rows, 6, now)
    expect(buckets.map((b) => b.count)).toEqual([0, 0, 0, 2, 1, 3])
    expect(peak).toBe(3)
  })

  it('crosses a year boundary correctly', () => {
    const { buckets } = signupsByMonth([], 4, new Date(2027, 1, 10)) // Feb 2027
    expect(buckets.map((b) => b.label)).toEqual(['Nov', 'Dec', 'Jan', 'Feb'])
    expect(buckets.map((b) => b.year)).toEqual([2026, 2026, 2027, 2027])
  })

  it('excludes a signup older than the window without counting it as undated', () => {
    const rows = [row({ createdAt: new Date(2025, 0, 5) })]
    const { buckets, undated } = signupsByMonth(rows, 6, now)
    expect(buckets.every((b) => b.count === 0)).toBe(true)
    expect(undated).toBe(0)
  })

  it('counts rows with an unusable timestamp as undated rather than dropping them', () => {
    // A chart that silently omits subscribers understates signups.
    const rows = [
      row({ createdAt: null }),
      row({ createdAt: 'not a date' }),
      row({ createdAt: new Date(2026, 7, 4) }),
    ]
    const { buckets, undated } = signupsByMonth(rows, 6, now)
    expect(undated).toBe(2)
    expect(buckets[5].count).toBe(1)
  })

  it('reports a peak of zero for an empty window', () => {
    expect(signupsByMonth([], 6, now).peak).toBe(0)
  })

  it('clamps a nonsensical window to at least one month', () => {
    expect(signupsByMonth([], 0, now).buckets).toHaveLength(1)
    expect(signupsByMonth([], -3, now).buckets).toHaveLength(1)
    expect(signupsByMonth([], undefined, now).buckets).toHaveLength(6)
  })

  it('accepts the string timestamp shapes end to end', () => {
    const rows = [
      { subscription: { created_at: '2026-08-04T10:00:00Z' } },
      { subscription: { created_at: { seconds: Math.floor(Date.UTC(2026, 7, 6) / 1000) } } },
    ]
    const { undated } = signupsByMonth(rows, 6, now)
    expect(undated).toBe(0)
  })
})

describe('analyticsFor', () => {
  it('computes the summary, plan mix and signups from one slice', () => {
    const now = new Date(2026, 7, 19)
    const rows = [
      row({ type: 'institution', plan: 'standard', status: 'active', createdAt: new Date(2026, 7, 2), students: slot(300, 500) }),
      row({ type: 'teacher', plan: 'plus', status: 'trial', createdAt: new Date(2026, 6, 15), students: slot(50, 400) }),
    ]
    const result = analyticsFor(rows, { now })
    expect(result.summary.total).toBe(2)
    expect(result.summary.students).toMatchObject({ used: 350, seats: 900 })
    expect(result.plans.map((p) => p.key)).toEqual(['institution:standard', 'teacher:plus'])
    expect(result.signups.buckets.map((b) => b.count)).toEqual([0, 0, 0, 0, 1, 1])
  })

  it('reflects a filtered slice rather than the whole roster', () => {
    const now = new Date(2026, 7, 19)
    const rows = [
      row({ id: 'i1', type: 'institution', status: 'active' }),
      row({ id: 't1', type: 'teacher', status: 'active' }),
    ]
    const result = analyticsFor(filterRows(rows, { segment: 'teacher' }), { now })
    expect(result.summary.total).toBe(1)
    expect(result.summary.teachers).toBe(1)
    expect(result.summary.institutions).toBe(0)
  })

  it('handles an empty slice without throwing', () => {
    const result = analyticsFor([], { now: new Date(2026, 7, 19) })
    expect(result.summary.total).toBe(0)
    expect(result.plans).toEqual([])
    expect(result.signups.peak).toBe(0)
  })
})
