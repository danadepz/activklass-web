import { describe, expect, it } from 'vitest'
import { describeSubscription, toMillis } from './subscription'

const NOW = Date.parse('2026-08-29T08:00:00Z')
const days = (n) => new Date(NOW + n * 24 * 60 * 60 * 1000)

describe('toMillis', () => {
  it('reads every timestamp shape the app produces', () => {
    expect(toMillis(null)).toBeNull()
    expect(toMillis(new Date(NOW))).toBe(NOW)
    expect(toMillis({ toMillis: () => NOW })).toBe(NOW)
    expect(toMillis({ seconds: NOW / 1000, nanoseconds: 0 })).toBe(NOW)
    expect(toMillis('2026-08-29T08:00:00Z')).toBe(NOW)
    expect(toMillis('not a date')).toBeNull()
  })
})

describe('describeSubscription', () => {
  it('a school-issued teacher reads as the school plan, never locked', () => {
    const view = describeSubscription({
      profile: { school_id: 'pilot-school' },
      subscription: { type: 'institution', name: 'San Nicolas High School', plan: 'pilot', status: 'active' },
      now: NOW,
    })
    expect(view.kind).toBe('school')
    expect(view.detail).toBe('San Nicolas High School')
    expect(view.locks).toEqual({ quizBank: false, teacherGroups: false })
  })

  it('an absorbed teacher resolves through the institution subscription even without school_id on the profile', () => {
    const view = describeSubscription({
      profile: {},
      subscription: { type: 'institution', name: 'Gordon College', status: 'active' },
      now: NOW,
    })
    expect(view.kind).toBe('school')
    expect(view.detail).toBe('Gordon College')
  })

  it('a paid solo teacher is Subscribed with the plan named', () => {
    const view = describeSubscription({
      profile: {},
      subscription: { type: 'teacher', plan: 'plus', status: 'active' },
      now: NOW,
    })
    expect(view).toMatchObject({ kind: 'active', label: 'Subscribed', detail: 'Plus plan', plan: 'plus' })
    expect(view.locks.quizBank).toBe(false)
  })

  it('a self-registered teacher on trial counts the days from the profile alone (Flask down or no record yet)', () => {
    const view = describeSubscription({
      profile: { subscription_status: 'trial', trial_ends_at: days(12.4) },
      subscription: null,
      now: NOW,
    })
    expect(view.kind).toBe('trial')
    expect(view.daysLeft).toBe(13)
    expect(view.detail).toBe('13 days left')
    expect(view.locks).toEqual({ quizBank: true, teacherGroups: true })
  })

  it('the last day reads as singular', () => {
    const view = describeSubscription({ profile: { subscription_status: 'trial', trial_ends_at: days(0.5) }, now: NOW })
    expect(view.detail).toBe('1 day left')
  })

  it('a trial past its end date is expired and stays locked', () => {
    const view = describeSubscription({
      profile: {},
      subscription: { type: 'teacher', status: 'trial', trial_ends_at: days(-1) },
      now: NOW,
    })
    expect(view.kind).toBe('expired')
    expect(view.daysLeft).toBe(0)
    expect(view.locks.teacherGroups).toBe(true)
  })

  it('a legacy teacher with no record at all is not locked out of anything', () => {
    const view = describeSubscription({ profile: {}, subscription: null, now: NOW })
    expect(view.kind).toBe('none')
    expect(view.locks).toEqual({ quizBank: false, teacherGroups: false })
  })

  it('suspended and cancelled read as lapsed', () => {
    expect(describeSubscription({ profile: {}, subscription: { status: 'suspended' } }).label).toBe('Subscription paused')
    expect(describeSubscription({ profile: {}, subscription: { status: 'cancelled' } }).label).toBe('Subscription ended')
  })
})
