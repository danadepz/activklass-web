import { describe, expect, it } from 'vitest'
import {
  estimateAnnual, estimateSolo, pesos, trialEndsFrom, TRIAL_DAYS,
  TEACHER_SEAT_PER_YEAR, STUDENT_SEAT_PER_YEAR,
} from './pricing'

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

describe('trialEndsFrom', () => {
  it('is TRIAL_DAYS after the start', () => {
    const start = new Date('2026-08-29T00:00:00Z')
    expect(trialEndsFrom(start).toISOString()).toBe('2026-09-28T00:00:00.000Z')
    expect(TRIAL_DAYS).toBe(30)
  })
})
