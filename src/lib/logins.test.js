import { describe, expect, it } from 'vitest'
import {
  INTERNAL_LOGIN_SUFFIX,
  isIssuedLoginId,
  issuedLoginId,
  toAuthEmail,
  wrongCredentialMessage,
} from './logins'

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

describe('isIssuedLoginId', () => {
  it('accepts what the backend actually mints', () => {
    expect(isIssuedLoginId('snhs-789012')).toBe(true)
    expect(isIssuedLoginId('ucb-024019')).toBe(true)
    expect(isIssuedLoginId('  SNHS-789012 ')).toBe(true)
  })
  it('rejects anything that shape was never issued as', () => {
    expect(isIssuedLoginId('snhs-78901')).toBe(false)   // five digits
    expect(isIssuedLoginId('snhs-7890123')).toBe(false) // seven
    expect(isIssuedLoginId('snhs789012')).toBe(false)   // no hyphen
    expect(isIssuedLoginId('s-789012')).toBe(false)     // prefix under 2
    expect(isIssuedLoginId('ana@school.edu.ph')).toBe(false)
    expect(isIssuedLoginId('kristine')).toBe(false)
  })
})

/* T-01 and T-02 are the same field from opposite sides, and the first fix
   swapped one lock-out for another: it guessed the hint from whether an "@"
   was typed, but auth/invalid-credential is also a plain wrong password, so
   each tester was pointed at the credential they do NOT have. These assert the
   guess is gone — neither population is ever sent looking for the other's. */
describe('wrongCredentialMessage', () => {
  const EMAIL_HALF = 'sign in with the email address you registered with'
  const LOGIN_HALF = 'use the login ID it gave you, like snhs-123456'

  it('names both credentials whenever the identifier could be real', () => {
    for (const typed of ['kristine@email.com', 'snhs-100012', 'DERICK@GMAIL.COM']) {
      const message = wrongCredentialMessage(typed)
      expect(message).toContain('Incorrect login or password.')
      expect(message).toContain(EMAIL_HALF)
      expect(message).toContain(LOGIN_HALF)
    }
  })

  it('never tells a solo teacher her own email is the wrong kind (T-02)', () => {
    // The regression the verification pass caught: a wrong password on a
    // correctly typed email used to answer "sign in with a login ID instead".
    const message = wrongCredentialMessage('abi@email.com')
    expect(message).not.toMatch(/rather than an email address/)
    expect(message).toContain(EMAIL_HALF)
  })

  it('never offers one credential without the other (T-01, T-02)', () => {
    // The invariant that kills both regressions at once: the client cannot
    // tell a wrong password from a wrong identifier, so it must never pick a
    // side. Every message carries both halves or neither tester is served.
    for (const typed of ['snhs-100012', 'abi@email.com', 'kristine', '']) {
      const message = wrongCredentialMessage(typed)
      expect(message.includes(EMAIL_HALF)).toBe(message.includes(LOGIN_HALF))
      expect(message).toContain(EMAIL_HALF)
    }
  })

  it('says so plainly when what was typed is neither credential', () => {
    // Kristine's literal repro: obey the old "Enter username" label, type
    // "kristine", and toAuthEmail sends kristine@activklass.internal — an
    // account that cannot exist. Blaming the password there is a lie.
    for (const typed of ['kristine', 't1', 'snhs789012']) {
      const message = wrongCredentialMessage(typed)
      expect(message).toContain('That is not an email address or a login ID.')
      expect(message).not.toContain('Incorrect login or password.')
      expect(message).toContain(EMAIL_HALF)
      expect(message).toContain(LOGIN_HALF)
    }
  })

  it('does not throw on empty or missing input', () => {
    expect(wrongCredentialMessage('')).toContain('That is not an email address or a login ID.')
    expect(wrongCredentialMessage(undefined)).toContain(EMAIL_HALF)
  })
})
