import { describe, expect, it } from 'vitest'
import { emailError, nameError, passwordError, yearLevelError } from './validation'

describe('nameError', () => {
  it('accepts ordinary and Filipino names', () => {
    expect(nameError('Juan')).toBe('')
    expect(nameError('Dela Peña')).toBe('')
    expect(nameError("O'Brien-Cruz Jr.")).toBe('')
    expect(nameError('Ma. Luisa')).toBe('')
  })
  it('rejects digits and symbol-only input', () => {
    expect(nameError('123')).not.toBe('')
    expect(nameError('Juan2')).not.toBe('')
    expect(nameError('...')).not.toBe('')
  })
  it('required by default, optional on request', () => {
    expect(nameError('')).not.toBe('')
    expect(nameError('', { required: false })).toBe('')
    expect(nameError('  ', { required: false })).toBe('')
  })
  it('names the field in the message', () => {
    expect(nameError('', { label: 'Middle name' })).toMatch(/Middle name/)
  })
})

describe('passwordError', () => {
  it('accepts upper+lower+number+symbol of 8+', () => {
    expect(passwordError('Klase#2026')).toBe('')
    expect(passwordError('aB3!aB3!')).toBe('')
  })
  it('rejects short, all-letter and all-digit passwords', () => {
    expect(passwordError('aB3!x')).not.toBe('')
    expect(passwordError('aaaaaaaa')).not.toBe('')
    expect(passwordError('12345678')).not.toBe('')
  })
  it('requires each character class', () => {
    expect(passwordError('klase#2026')).toMatch(/uppercase/)
    expect(passwordError('KLASE#2026')).toMatch(/lowercase/)
    expect(passwordError('KlaseHash!')).toMatch(/number/)
    expect(passwordError('Klase2026')).toMatch(/special/)
  })
})

describe('yearLevelError', () => {
  it('accepts both formats when the level is unknown', () => {
    expect(yearLevelError('Grade 10')).toBe('')
    expect(yearLevelError('grade 7')).toBe('')
    expect(yearLevelError('1st Year')).toBe('')
    expect(yearLevelError('3rd')).toBe('')
  })
  it('restricts by education level', () => {
    expect(yearLevelError('Grade 10', { level: 'college' })).not.toBe('')
    expect(yearLevelError('3rd', { level: 'college' })).toBe('')
    expect(yearLevelError('1st Year', { level: 'school' })).not.toBe('')
    expect(yearLevelError('Grade 12', { level: 'school' })).toBe('')
  })
  it('rejects out-of-range and free text', () => {
    expect(yearLevelError('Grade 13')).not.toBe('')
    expect(yearLevelError('6th Year')).not.toBe('')
    expect(yearLevelError('sophomore')).not.toBe('')
    expect(yearLevelError('10')).not.toBe('')
  })
})

describe('emailError', () => {
  it('accepts a plain address', () => {
    expect(emailError('ana@school.edu.ph')).toBe('')
  })
  it('rejects blanks and malformed addresses', () => {
    expect(emailError('')).not.toBe('')
    expect(emailError('ana@school')).not.toBe('')
    expect(emailError('not an email')).not.toBe('')
  })
})
