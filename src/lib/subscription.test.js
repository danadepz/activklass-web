import { describe, expect, it } from 'vitest'
import { accountKind, describeSubscription, toMillis } from './subscription'

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
  it('a school-issued teacher reads as an institution subscription, never locked', () => {
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

  it('T-124: a record-less account is unreachable on real data post-backfill, and the defensive fallback stays unlocked rather than defaulting to expired', () => {
    const view = describeSubscription({ profile: {}, subscription: null, now: NOW })
    expect(view.kind).toBe('active')
    expect(view.locks).toEqual({ quizBank: false, teacherGroups: false })
  })

  it('T-124: suspended and cancelled fold into expired, with the same lock an ended trial already carries', () => {
    const paused = describeSubscription({ profile: {}, subscription: { status: 'suspended' } })
    expect(paused.kind).toBe('expired')
    expect(paused.label).toBe('Subscription paused')
    expect(paused.locks).toEqual({ quizBank: true, teacherGroups: true })

    const ended = describeSubscription({ profile: {}, subscription: { status: 'cancelled' } })
    expect(ended.kind).toBe('expired')
    expect(ended.label).toBe('Subscription ended')
    expect(ended.locks).toEqual({ quizBank: true, teacherGroups: true })
  })
})

describe('accountKind', () => {
  it('a teacher issued by a school belongs to it, whatever else they carry', () => {
    expect(accountKind({ school_id: 'demo-school-sanroque' })).toBe('school')
    // Affiliation and trial markers do not outrank who pays.
    expect(accountKind({
      school_id: 'demo-school-sanroque',
      teaching_school_id: 'srnhs',
      subscription_status: 'trial',
    })).toBe('school')
  })

  it('a teacher on their own plan is solo', () => {
    expect(accountKind({ subscription_status: 'active' })).toBe('solo')
    expect(accountKind({ trial_ends_at: 1790000000000 })).toBe('solo')
  })

  it("teaching_school_id is affiliation, not billing, and never makes a teacher institutional", () => {
    // A solo teacher who named their school in the directory so the Account
    // page can list colleagues. Reading this field instead of school_id
    // would misclassify every one of them.
    expect(accountKind({ teaching_school_id: 'srnhs', subscription_status: 'trial' })).toBe('solo')
  })

  it('an approved teacher who never subscribed is neither, and that is the trap', () => {
    expect(accountKind({})).toBe('none')
    expect(accountKind(null)).toBe('none')
    expect(accountKind(undefined)).toBe('none')
    // Written out because !== 'solo' is what a caller reaches for by mistake.
    expect(accountKind({}) === 'school').toBe(false)
  })
})
