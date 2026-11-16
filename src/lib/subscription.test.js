import { describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { accountKind, describeSubscription, fetchRegistrationPolicy, fetchRegistrationQuote, fetchSeatIncreaseQuote, formatDecimalBytes, formatExpirationCountdown, recordTermsAcceptance, toMillis } from './subscription'

vi.mock('./api', () => ({ api: vi.fn() }))

const NOW = Date.parse('2026-08-29T08:00:00Z')
const days = (n) => new Date(NOW + n * 24 * 60 * 60 * 1000)

describe('backend registration pricing contract', () => {
  it('loads the active registration policy without client-side pricing configuration', async () => {
    api.mockResolvedValueOnce({ policy_version: 'legacy-seat-rates-300d-v1' })
    await fetchRegistrationPolicy()
    expect(api).toHaveBeenCalledWith('/api/subscription/registration-policy', { requireAuth: false })
  })

  it('sends registration capacity to the backend quote endpoint unchanged', async () => {
    const input = { subscription_type: 'institution', teacher_seats: 20, students_per_teacher: 30 }
    api.mockResolvedValueOnce({ policy_version: 'legacy-seat-rates-300d-v1', quote: { total_contract_php: 60000 } })
    const result = await fetchRegistrationQuote(input)
    expect(api).toHaveBeenCalledWith('/api/subscription/registration-quote', {
      method: 'POST', requireAuth: false, body: input,
    })
    expect(result.quote.total_contract_php).toBe(60000)
  })

  it('requests a prorated seat-upgrade amount from the backend', async () => {
    const input = { teacherSeats: 11, studentSeats: 1000 }
    api.mockResolvedValueOnce({ quote: { pricing_version: 'legacy-seat-rates-300d-v1', payment_due_php: 600 } })
    const result = await fetchSeatIncreaseQuote('school-1', input)
    expect(api).toHaveBeenCalledWith('/api/subscription/school-1/seats/quote', {
      method: 'POST', body: { teacher_seats: 11, student_seats: 1000 },
    })
    expect(result.quote.payment_due_php).toBe(600)
  })
})

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

describe('formatExpirationCountdown', () => {
  const now = new Date('2026-11-16T00:00:00Z').getTime()

  it('formats human-readable days left from a timestamp', () => {
    const expiresAt = { toMillis: () => now + (5 * 24 * 60 + 12 * 60 + 8) * 60_000 }
    expect(formatExpirationCountdown(expiresAt, now)).toBe('5 days left')
  })

  it('rounds partial minutes up and labels an elapsed expiry', () => {
    expect(formatExpirationCountdown(now + 1, now)).toBe('1 minute left')
    expect(formatExpirationCountdown(now, now)).toBe('Expired')
  })

  it('returns null for missing or invalid timestamps', () => {
    expect(formatExpirationCountdown(null, now)).toBeNull()
    expect(formatExpirationCountdown('not a date', now)).toBeNull()
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

describe('recordTermsAcceptance', () => {
  it('sends the explicit acceptance flag required by the backend contract', async () => {
    await recordTermsAcceptance('school-1', { termsVersion: 'terms-v1', userAgent: 'test-agent' })
    expect(api).toHaveBeenCalledWith('/api/subscription/school-1/terms/accept', {
      method: 'POST',
      body: { accepted: true, terms_version: 'terms-v1', user_agent: 'test-agent' },
    })
  })
})

describe('formatDecimalBytes', () => {
  it('uses decimal gigabytes for subscription storage allowances', () => {
    expect(formatDecimalBytes(5_000_000_000)).toBe('5.0 GB')
    expect(formatDecimalBytes(25_000_000_000)).toBe('25 GB')
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
