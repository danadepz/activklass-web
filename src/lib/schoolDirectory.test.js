import { describe, expect, it } from 'vitest'
import { schoolAbbrKey, schoolNameKey } from './schoolDirectory'

// The directory dedupes schools by this key, so what it must guarantee is that
// the same school typed differently collapses to one entry while genuinely
// different schools stay apart.
describe('schoolNameKey', () => {
  it('ignores spacing around dashes — the campus-name case', () => {
    expect(schoolNameKey('University of Cebu-Banilad'))
      .toBe(schoolNameKey('University of Cebu - Banilad'))
    expect(schoolNameKey('University of Cebu-Banilad'))
      .toBe(schoolNameKey('University of Cebu Banilad'))
  })
  it('ignores case, extra whitespace, and dash style', () => {
    expect(schoolNameKey('UNIVERSITY  OF CEBU – BANILAD'))
      .toBe(schoolNameKey('university of cebu-banilad'))
  })
  it('ignores periods and folds accents', () => {
    expect(schoolNameKey('Sto. Niño Academy')).toBe(schoolNameKey('Sto Nino Academy'))
  })
  it('keeps different schools different', () => {
    expect(schoolNameKey('University of Cebu-Banilad'))
      .not.toBe(schoolNameKey('University of Cebu-Main'))
    expect(schoolNameKey('Cebu Normal University'))
      .not.toBe(schoolNameKey('Cebu Technological University'))
  })
  it('is empty for blank or punctuation-only input', () => {
    expect(schoolNameKey('')).toBe('')
    expect(schoolNameKey(null)).toBe('')
    expect(schoolNameKey(' - . ')).toBe('')
  })
})

describe('schoolAbbrKey', () => {
  it('lowercases and trims — UCB and ucb are one doc id', () => {
    expect(schoolAbbrKey(' UCB ')).toBe('ucb')
    expect(schoolAbbrKey('ucb')).toBe('ucb')
  })
})
