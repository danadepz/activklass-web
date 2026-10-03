/**
 * T-112 (triplecookiemonster-141 item 8, Kristine 2026-10-01): the teacher's
 * own Account page gains an optional Middle name field. `profileUpdatePayload`
 * in account.jsx is exactly what Save profile hands to `mut.mutate(...)` --
 * so testing it directly proves the typed value reaches the write, not just
 * that the input renders (the trap five of eight panes fell into on
 * 2026-09-28, per this card's own brief).
 */
import { describe, expect, it } from 'vitest'
import { profileUpdatePayload } from './account.jsx'

const base = { first_name: 'Marites', middle_name: '', last_name: 'Cruz' }

describe('profileUpdatePayload', () => {
  it('a typed middle name reaches the write', () => {
    const result = profileUpdatePayload({ ...base, middle_name: 'Santos' })
    expect(result.error).toBeUndefined()
    expect(result.fields).toEqual({ first_name: 'Marites', middle_name: 'Santos', last_name: 'Cruz' })
  })

  it('a blank middle name is not an error, and writes null rather than being omitted', () => {
    const result = profileUpdatePayload({ ...base, middle_name: '' })
    expect(result.error).toBeUndefined()
    expect(result.fields.middle_name).toBeNull()
  })

  it('whitespace-only counts as blank', () => {
    const result = profileUpdatePayload({ ...base, middle_name: '   ' })
    expect(result.error).toBeUndefined()
    expect(result.fields.middle_name).toBeNull()
  })

  it('a middle name with digits is refused, the same rule every other form uses', () => {
    const result = profileUpdatePayload({ ...base, middle_name: 'Santos123' })
    expect(result.error).toMatch(/Middle name can only contain/)
    expect(result.fields).toBeUndefined()
  })

  it('first and last name are still required', () => {
    expect(profileUpdatePayload({ ...base, first_name: '' }).error).toBe('First and last name are required.')
    expect(profileUpdatePayload({ ...base, last_name: '  ' }).error).toBe('First and last name are required.')
  })

  it('first and last name are trimmed, matching the middle name treatment', () => {
    const result = profileUpdatePayload({ first_name: ' Marites ', middle_name: ' Santos ', last_name: ' Cruz ' })
    expect(result.fields).toEqual({ first_name: 'Marites', middle_name: 'Santos', last_name: 'Cruz' })
  })
})
