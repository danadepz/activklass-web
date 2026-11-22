import { describe, expect, it } from 'vitest'
import { formatRiskScore } from './riskScoreDisplay'

describe('formatRiskScore · two decimals, never across a band cutoff (owner decision 2026-11-22)', () => {
  it('shows the four owner examples exactly', () => {
    expect(formatRiskScore(0.3499)).toBe('34.99%')
    expect(formatRiskScore(0.35)).toBe('35.00%')
    expect(formatRiskScore(0.4999)).toBe('49.99%')
    expect(formatRiskScore(0.5)).toBe('50.00%')
  })

  it('never rounds a below-cutoff score up onto the cutoff', () => {
    expect(formatRiskScore(0.34999)).toBe('34.99%')
    expect(formatRiskScore(0.499999)).toBe('49.99%')
    expect(formatRiskScore(0.350001)).toBe('35.00%')
  })

  it('keeps the ends and ordinary values', () => {
    expect(formatRiskScore(0)).toBe('0.00%')
    expect(formatRiskScore(1)).toBe('100.00%')
    expect(formatRiskScore(0.0037)).toBe('0.37%')
    expect(formatRiskScore(0.9924)).toBe('99.24%')
    expect(formatRiskScore(0.29)).toBe('29.00%')
  })

  it('gives no number for a missing score -- never 0.00%', () => {
    for (const v of [null, undefined, NaN, Infinity, '0.4']) expect(formatRiskScore(v)).toBeNull()
  })
})
