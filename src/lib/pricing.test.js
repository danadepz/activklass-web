import { describe, expect, it } from 'vitest'
import {
  pesos, trialEndsFrom, TRIAL_DAYS,
} from './pricing'

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
