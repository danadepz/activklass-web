import { describe, expect, it } from 'vitest'
import {
  estimateAnnual, estimateProrated, estimateSolo, pesos, renewalFraction, trialEndsFrom, TRIAL_DAYS,
  TEACHER_SEAT_PER_YEAR, STUDENT_SEAT_PER_YEAR, SCHOOL_YEAR_DAYS,
} from './pricing'

const DAY_MS = 24 * 60 * 60 * 1000

describe('estimateAnnual', () => {
  it('is seats times the per-seat rate, per school year', () => {
    expect(estimateAnnual(20, 120)).toBe(20 * TEACHER_SEAT_PER_YEAR + 120 * STUDENT_SEAT_PER_YEAR)
    expect(estimateAnnual(20, 120)).toBe(31_200)
  })
  it('tolerates the strings a range input yields, and never goes negative', () => {
    expect(estimateAnnual('50', '1500')).toBe(50 * 1200 + 1500 * 60)
    expect(estimateAnnual(-5, 'x')).toBe(0)
  })
})

describe('estimateSolo', () => {
  it('is one teacher seat plus the students', () => {
    expect(estimateSolo(120)).toBe(TEACHER_SEAT_PER_YEAR + 120 * STUDENT_SEAT_PER_YEAR)
    expect(estimateSolo(120)).toBe(8_400)
  })
})

describe('pesos', () => {
  it('formats whole pesos with separators', () => {
    expect(pesos(31200)).toBe('₱31,200')
    expect(pesos(3120.4)).toBe('₱3,120')
  })
})

describe('renewalFraction — owner decision 2026-10-29: a mid-year seat prorates to the months left', () => {
  it('a full school year left is the full rate', () => {
    const now = Date.now()
    expect(renewalFraction(now + SCHOOL_YEAR_DAYS * DAY_MS, now)).toBe(1)
  })

  it('half the school year left is half the rate', () => {
    const now = Date.now()
    expect(renewalFraction(now + (SCHOOL_YEAR_DAYS / 2) * DAY_MS, now)).toBeCloseTo(0.5, 5)
  })

  it('clamps at 0 for a renewal date already past -- never a negative fraction', () => {
    const now = Date.now()
    expect(renewalFraction(now - 10 * DAY_MS, now)).toBe(0)
  })

  it('clamps at 1 for a renewal date further out than one school year', () => {
    const now = Date.now()
    expect(renewalFraction(now + 500 * DAY_MS, now)).toBe(1)
  })

  it('falls back to the full rate when there is no renewal date on file, never a guessed shorter one', () => {
    expect(renewalFraction(null)).toBe(1)
    expect(renewalFraction(undefined)).toBe(1)
  })
})

describe('estimateProrated', () => {
  it('matches the full annual estimate when a full year is left', () => {
    const now = Date.now()
    expect(estimateProrated(1, 50, now + SCHOOL_YEAR_DAYS * DAY_MS, now)).toBe(estimateAnnual(1, 50))
  })

  it('is roughly half the annual rate with half the year left', () => {
    const now = Date.now()
    // (1*1200 + 50*60) = 4200; half of that is 2100
    expect(estimateProrated(1, 50, now + (SCHOOL_YEAR_DAYS / 2) * DAY_MS, now)).toBe(2100)
  })

  it('is 0, never negative, once the renewal date has passed', () => {
    const now = Date.now()
    expect(estimateProrated(3, 100, now - DAY_MS, now)).toBe(0)
  })
})

describe('trialEndsFrom', () => {
  it('is TRIAL_DAYS after the start', () => {
    const start = new Date('2026-08-29T00:00:00Z')
    expect(trialEndsFrom(start).toISOString()).toBe('2026-09-28T00:00:00.000Z')
    expect(TRIAL_DAYS).toBe(30)
  })
})
