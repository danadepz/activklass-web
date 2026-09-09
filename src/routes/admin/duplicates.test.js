import { describe, it, expect } from 'vitest'
import { accountsNamed, accountWithEmail, accountWithLogin, accountName, describeAccount } from './duplicates'

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

describe('accountWithLogin', () => {
  // andecobs-45: Shyna Tantay is on file as sccu-000050; Audrey Cabunillas's
  // LRN ends in the same six digits, so her row is issued the same login.
  const SCCU = [
    ...USERS,
    { first_name: 'Shyna', last_name: 'Tantay', login_id: 'sccu-000050', role: 'student' },
  ]

  it('finds the account already holding an issued login', () => {
    expect(accountWithLogin(SCCU, 'sccu-000050').last_name).toBe('Tantay')
  })

  it('matches however the login was cased or padded', () => {
    expect(accountWithLogin(SCCU, ' SCCU-000050 ').last_name).toBe('Tantay')
  })

  it('is null for a free login, or none at all', () => {
    expect(accountWithLogin(SCCU, 'sccu-000051')).toBeNull()
    expect(accountWithLogin(SCCU, '')).toBeNull()
    expect(accountWithLogin(SCCU, undefined)).toBeNull()
    expect(accountWithLogin(undefined, 'sccu-000050')).toBeNull()
  })

  it('does not read an account without a login as holding a blank one', () => {
    // The admin signs in by email and carries no login_id.
    expect(accountWithLogin(SCCU, '   ')).toBeNull()
  })

  it('checks the rows above a row the same way it checks the directory', () => {
    // What the uploader hands it: earlier rows, each given its derived login.
    const earlier = [
      { first_name: 'Shyna', last_name: 'Tantay', login_id: 'sccu-000050', line: 4 },
    ]
    expect(accountWithLogin(earlier, 'sccu-000050').line).toBe(4)
  })
})

describe('accountName', () => {
  it('is the person without the login', () => {
    expect(accountName(USERS[0])).toBe('John Does')
    expect(accountName({ first_name: 'Shyna' })).toBe('Shyna')
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
