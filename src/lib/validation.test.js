import { describe, expect, it } from 'vitest'
import {
  emailError, nameError, passwordError, tempPasswordError, yearLevelError,
  GRADE_LEVELS, YEAR_LEVELS,
  semesterError, semesterLabel,
  idNumberError, lrnError, loginPrefixError, schoolNameError, schoolAbbrError, phoneError, linkError,
} from './validation'

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

describe('tempPasswordError', () => {
  it('accepts the standing default and anything 8+ characters', () => {
    expect(tempPasswordError('pass1234')).toBe('')
    expect(tempPasswordError('aaaaaaaa')).toBe('')
  })
  it('rejects short values, and blanks only when required', () => {
    expect(tempPasswordError('short')).not.toBe('')
    expect(tempPasswordError('')).not.toBe('')
    expect(tempPasswordError('', { required: false })).toBe('')
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

/* T-22: the roster's Year dropdown is built from these lists, so every entry
   must be something the rule accepts for its own level and nothing else --
   or the dropdown offers a value the form then refuses. */
describe('GRADE_LEVELS / YEAR_LEVELS', () => {
  it('cover exactly the values the rule accepts', () => {
    expect(GRADE_LEVELS).toHaveLength(12)
    expect(GRADE_LEVELS[0]).toBe('Grade 1')
    expect(GRADE_LEVELS[11]).toBe('Grade 12')
    expect(YEAR_LEVELS).toHaveLength(5)
    expect(YEAR_LEVELS[0]).toBe('1st Year')
    expect(YEAR_LEVELS[4]).toBe('5th Year')
  })
  it('every entry passes yearLevelError for its own level and fails the other', () => {
    for (const g of GRADE_LEVELS) {
      expect(yearLevelError(g, { level: 'school' })).toBe('')
      expect(yearLevelError(g, { level: 'college' })).not.toBe('')
    }
    for (const y of YEAR_LEVELS) {
      expect(yearLevelError(y, { level: 'college' })).toBe('')
      expect(yearLevelError(y, { level: 'school' })).not.toBe('')
    }
  })
})

describe('idNumberError', () => {
  it('accepts school-issued number shapes', () => {
    expect(idNumberError('2024-00123')).toBe('')
    expect(idNumberError('T-2024-018')).toBe('')
    expect(idNumberError('AB.123')).toBe('')
  })
  it('rejects blanks, leading punctuation and stray characters', () => {
    expect(idNumberError('')).not.toBe('')
    expect(idNumberError('-2024')).not.toBe('')
    expect(idNumberError('2024/00123')).not.toBe('')
    expect(idNumberError('20 24')).not.toBe('')
  })
  it('names the field in the message', () => {
    expect(idNumberError('', { label: 'Employee number' })).toMatch(/Employee number/)
  })
})

describe('lrnError', () => {
  it('accepts exactly 12 digits', () => {
    expect(lrnError('123456789012')).toBe('')
  })
  it('rejects blanks, short, long and non-digit values', () => {
    expect(lrnError('')).not.toBe('')
    expect(lrnError('12345')).not.toBe('')
    expect(lrnError('1234567890123')).not.toBe('')
    expect(lrnError('12345678901a')).not.toBe('')
  })
})

describe('loginPrefixError', () => {
  it('accepts short alphanumeric prefixes regardless of case', () => {
    expect(loginPrefixError('snhs')).toBe('')
    expect(loginPrefixError('SNHS2')).toBe('')
  })
  it('rejects blanks, symbols and out-of-range lengths', () => {
    expect(loginPrefixError('')).not.toBe('')
    expect(loginPrefixError('s')).not.toBe('')
    expect(loginPrefixError('no spaces')).not.toBe('')
    expect(loginPrefixError('waytoolongprefix')).not.toBe('')
  })
})

describe('schoolNameError', () => {
  it('accepts real full names, hyphens and campuses included', () => {
    expect(schoolNameError('University of Cebu-Banilad')).toBe('')
    expect(schoolNameError('Sta. Niña National High School')).toBe('')
  })
  it('rejects blanks, letterless input and over-long names', () => {
    expect(schoolNameError('')).not.toBe('')
    expect(schoolNameError('12')).not.toBe('')
    expect(schoolNameError('x'.repeat(121))).not.toBe('')
  })
})

describe('schoolAbbrError', () => {
  it('accepts short alphanumeric forms regardless of case', () => {
    expect(schoolAbbrError('UCB')).toBe('')
    expect(schoolAbbrError('snhs2')).toBe('')
  })
  it('rejects blanks, symbols and out-of-range lengths', () => {
    expect(schoolAbbrError('')).not.toBe('')
    expect(schoolAbbrError('U')).not.toBe('')
    expect(schoolAbbrError('U C B')).not.toBe('')
    expect(schoolAbbrError('waytoolongabbrev')).not.toBe('')
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

describe('phoneError', () => {
  it('accepts Philippine numbers however they are typed', () => {
    expect(phoneError('09171234567')).toBe('')
    expect(phoneError('+63 917 123 4567')).toBe('')
    expect(phoneError('(032) 255-1234')).toBe('')
  })
  it('rejects blanks, letters and wrong lengths', () => {
    expect(phoneError('')).not.toBe('')
    expect(phoneError('', { required: false })).toBe('')
    expect(phoneError('0917 ABC 4567')).not.toBe('')
    expect(phoneError('1234')).not.toBe('')
    expect(phoneError('12345678901234')).not.toBe('')
  })
})

describe('linkError', () => {
  it('accepts an https share link', () => {
    expect(linkError('https://drive.google.com/file/d/abc/view')).toBe('')
  })
  it('rejects blanks, non-https and non-URLs', () => {
    expect(linkError('')).not.toBe('')
    expect(linkError('1')).not.toBe('')
    expect(linkError('drive.google.com/x')).not.toBe('')
    expect(linkError('http://example.com/id.jpg')).not.toBe('')
  })
})

describe('semesterError / semesterLabel', () => {
  it('accepts the three college terms', () => {
    expect(semesterError('1st')).toBe('')
    expect(semesterError('2nd')).toBe('')
    expect(semesterError('summer')).toBe('')
  })
  it('requires a value and rejects anything off the list', () => {
    expect(semesterError('')).toBe('Semester is required for a college class.')
    expect(semesterError('3rd')).toBe('Pick a semester from the list.')
  })
  it('labels a stored value and stays blank for none', () => {
    expect(semesterLabel('1st')).toBe('1st Sem')
    expect(semesterLabel('summer')).toBe('Midyear')
    expect(semesterLabel(null)).toBe('')
  })
})
