import { describe, it, expect } from 'vitest'
import { accountsNamed, accountWithEmail, describeAccount } from './duplicates'

// The pilot ticket, as data: one person entered twice under two employee
// numbers, which the console happily made into two accounts.
const USERS = [
  { first_name: 'John', last_name: 'Does', login_id: 'um-123553', personal_email: 'jd@example.com' },
  { first_name: 'John', last_name: 'Does', login_id: 'um-012355' },
  { first_name: 'Maria', last_name: 'Santos', login_id: 'snhs-260001', personal_email: 'sample.maria@gmail.com' },
  { first_name: 'System', last_name: 'Administrator', email: 'admin@activklass.edu.ph' },
]

describe('accountsNamed', () => {
  it('finds every account already carrying the name', () => {
    expect(accountsNamed(USERS, 'John', 'Does').map((u) => u.login_id))
      .toEqual(['um-123553', 'um-012355'])
  })

  it('matches the same name typed differently', () => {
    expect(accountsNamed(USERS, '  john ', 'DOES')).toHaveLength(2)
    expect(accountsNamed(USERS, 'John', 'Does')).toHaveLength(2)
  })

  it('does not match on one half of the name alone', () => {
    expect(accountsNamed(USERS, 'John', 'Doe')).toEqual([])
    expect(accountsNamed(USERS, 'Jonathan', 'Does')).toEqual([])
  })

  it('says nothing while the name is still half-typed', () => {
    expect(accountsNamed(USERS, 'John', '')).toEqual([])
    expect(accountsNamed(USERS, '', 'Does')).toEqual([])
  })

  it('survives a list that has not loaded', () => {
    expect(accountsNamed(undefined, 'John', 'Does')).toEqual([])
  })
})

describe('accountWithEmail', () => {
  it('finds the owner of a recovery address', () => {
    expect(accountWithEmail(USERS, 'sample.maria@gmail.com').login_id).toBe('snhs-260001')
  })

  it('also matches an admin’s sign-in address', () => {
    expect(accountWithEmail(USERS, 'ADMIN@activklass.edu.ph').last_name).toBe('Administrator')
  })

  it('is null for a free address, or none at all', () => {
    expect(accountWithEmail(USERS, 'new.teacher@gmail.com')).toBeNull()
    expect(accountWithEmail(USERS, '')).toBeNull()
    expect(accountWithEmail(USERS, undefined)).toBeNull()
  })

  it('does not read a missing field as a blank match', () => {
    // um-012355 carries no personal_email; a blank lookup must not find it.
    expect(accountWithEmail(USERS, '   ')).toBeNull()
  })
})

describe('describeAccount', () => {
  it('names the person and the login the admin would go looking for', () => {
    expect(describeAccount(USERS[0])).toBe('John Does (um-123553)')
    expect(describeAccount(USERS[3])).toBe('System Administrator (admin@activklass.edu.ph)')
  })

  it('falls back to the name when a parsed row has no login yet', () => {
    expect(describeAccount({ first_name: 'John', last_name: 'Does' })).toBe('John Does')
  })
})
