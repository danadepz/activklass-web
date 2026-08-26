import { describe, expect, it } from 'vitest'
import { INTERNAL_LOGIN_SUFFIX, issuedLoginId, toAuthEmail } from './logins'

describe('issuedLoginId', () => {
  it('uses the last six digits of the id', () => {
    expect(issuedLoginId('snhs', '123456789012')).toBe('snhs-789012')
    expect(issuedLoginId('snhs', 'T-2024-018')).toBe('snhs-024018')
  })
  it('returns empty without a prefix or with fewer than six digits', () => {
    expect(issuedLoginId('', '123456789012')).toBe('')
    expect(issuedLoginId('snhs', 'T-18')).toBe('')
    expect(issuedLoginId('snhs', '')).toBe('')
  })
})

describe('toAuthEmail', () => {
  it('passes real emails through untouched', () => {
    expect(toAuthEmail('ana@school.edu.ph')).toBe('ana@school.edu.ph')
  })
  it('appends the internal suffix to issued logins, lowercased', () => {
    expect(toAuthEmail('SNHS-789012')).toBe(`snhs-789012${INTERNAL_LOGIN_SUFFIX}`)
    expect(toAuthEmail('  snhs-789012  ')).toBe(`snhs-789012${INTERNAL_LOGIN_SUFFIX}`)
  })
})
