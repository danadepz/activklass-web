import { describe, expect, it } from 'vitest'
import {
  emailError, nameError, passwordError, tempPasswordError, yearLevelError,
  GRADE_LEVELS, YEAR_LEVELS,
  semesterError, semesterLabel,
  idNumberError, lrnError, loginPrefixError, schoolNameError, schoolAbbrError, phoneError, normalizePhone, linkError,
  prcLicenseError, verificationIdError,
  passingPercentError,
  birthdateError, BIRTHDATE_HINT,
  taskTitleError, taskKindError, taskWindowError, taskAttachmentError, taskAttachmentsError, TASK_TITLE_MAX,
  submissionNoteError, SUBMISSION_NOTE_MAX,
} from './validation'
import { TASK_KINDS } from './deliverables'

describe('birthdateError', () => {
  /* T-50: every student-creation form and both endpoints require it, because
     the guardian-access gate on the student's profile reads it and the
     student cannot set it themselves. */
  it('required by default, and the message says what it is for', () => {
    expect(birthdateError('')).toMatch(/guardian access/)
    expect(birthdateError(undefined)).toMatch(/required/)
  })
  it('optional on request, for an edit of an older record', () => {
    expect(birthdateError('', { required: false })).toBe('')
    expect(birthdateError('nope', { required: false })).not.toBe('')
  })
  it('accepts a real ISO date and refuses a malformed or impossible one', () => {
    expect(birthdateError('2010-06-15')).toBe('')
    expect(birthdateError('15/06/2010')).not.toBe('')
    expect(birthdateError('2010-02-30')).not.toBe('')
  })
  it('refuses a date in the future', () => {
    const next = new Date(); next.setFullYear(next.getFullYear() + 1)
    expect(birthdateError(next.toISOString().slice(0, 10))).toMatch(/future/)
  })
  it('the hint is one sentence that names guardian access', () => {
    expect(BIRTHDATE_HINT).toMatch(/guardian access/)
  })
})

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
  it('names the college path when the length is wrong (T-24)', () => {
    // A student number typed into LRN — the tester's 23236953.
    expect(lrnError('23236953')).toBe(
      'LRN must be exactly 12 digits. A learner with no LRN (college) uses the student number instead.',
    )
    expect(lrnError('23236953', { collegePath: 'set Level to College' })).toBe(
      'LRN must be exactly 12 digits. A learner with no LRN (college) — set Level to College and use the student number instead.',
    )
    // The rule itself is untouched: the hint never makes 8 digits pass.
    expect(lrnError('123456789012', { collegePath: 'set Level to College' })).toBe('')
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
  /* T-53 (maykel_64440-68): the domain has to END in something — a one-letter
     top-level domain does not exist, and the rule only asked for a dot. Two
     letters is the floor (.ph, .co), so real short addresses still pass. */
  it('refuses a truncated top-level domain', () => {
    expect(emailError('asdsad@gma.c')).not.toBe('')
    expect(emailError('name@school.1')).not.toBe('')
    expect(emailError('name@school.edu.')).not.toBe('')
  })
  it('still accepts real short and long domains', () => {
    expect(emailError('x@y.co')).toBe('')
    expect(emailError('name@school.edu.ph')).toBe('')
    expect(emailError('juan.dela-cruz@deped.gov.ph')).toBe('')
  })
  /* T-63 (Discord ticket maykel_64440-80): asd@gmail.co passed the general
     check because .co is a real TLD (T-53 keeps that rule) -- this catches
     the known provider's own misspelling instead of narrowing EMAIL_RE. */
  it('refuses a well-known provider domain spelled wrong', () => {
    expect(emailError('asd@gmail.co')).toBe('Did you mean asd@gmail.com?')
    expect(emailError('asd@gmail.con')).toBe('Did you mean asd@gmail.com?')
    expect(emailError('asd@gmial.com')).toBe('Did you mean asd@gmail.com?')
  })
  it('still accepts a real TLD or a school domain that only looks short', () => {
    expect(emailError('x@y.co')).toBe('')
    expect(emailError('name@school.edu.ph')).toBe('')
  })
})

/* T-53 (maykel_64440-70): the ID type used to change the label and nothing
   else, so "asdasdasd12322121231231-…" went through as a PRC licence. */
describe('prcLicenseError', () => {
  it('accepts exactly seven digits', () => {
    expect(prcLicenseError('1234567')).toBe('')
    expect(prcLicenseError(' 0012345 ')).toBe('')
  })
  it('refuses letters, the wrong length and blanks, saying what a licence looks like', () => {
    expect(prcLicenseError('asdasdasd12322121231231')).toMatch(/7 digits/)
    expect(prcLicenseError('123456')).toMatch(/7 digits/)
    expect(prcLicenseError('12345678')).toMatch(/7 digits/)
    expect(prcLicenseError('123-4567')).toMatch(/7 digits/)
    expect(prcLicenseError('')).toMatch(/required/)
  })
})

describe('verificationIdError', () => {
  it('judges a PRC licence by the licence rule', () => {
    expect(verificationIdError('asdasdasd12322121231231', 'prc')).toMatch(/7 digits/)
    expect(verificationIdError('1234567', 'prc')).toBe('')
  })
  it('keeps the school-issued rule for a school or employee ID', () => {
    expect(verificationIdError('T-2024-018', 'school_id')).toBe('')
    expect(verificationIdError('1234567', 'school_id')).toBe('')
    expect(verificationIdError('20 24', 'school_id')).not.toBe('')
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

/* T-93 (andecobs-117): the registration phone-in-use check (T-88) only
   caught a byte-identical string, so `09434969549`, `0943 496 9549`,
   `0943-496-9549` and `+639434969549` -- one number, typed four ways --
   read as four different numbers. Live data already carried an unflagged
   pair before the fix: `09154686377` on 3 accounts and `+639154686377` on
   1. This is the rule the duplicate check now compares on, on both the
   web and backend side (register.jsx sends the raw value; the backend's
   `_normalize_phone` in app/api/auth.py mirrors this function and
   normalises what it reads from Firestore before comparing). */
describe('normalizePhone', () => {
  it('collapses the exact same number typed four different ways', () => {
    const canonical = normalizePhone('09434969549')
    expect(normalizePhone('0943 496 9549')).toBe(canonical)
    expect(normalizePhone('0943-496-9549')).toBe(canonical)
    expect(normalizePhone('+639434969549')).toBe(canonical)
  })

  it('strips spaces, dashes, dots and parentheses', () => {
    expect(normalizePhone('0917 123 4567')).toBe('09171234567')
    expect(normalizePhone('0917-123-4567')).toBe('09171234567')
    expect(normalizePhone('0917.123.4567')).toBe('09171234567')
    expect(normalizePhone('(032) 255-1234')).toBe('0322551234')
  })

  it('folds a leading +63 or 63 to a single 0, not two', () => {
    expect(normalizePhone('+639171234567')).toBe('09171234567')
    expect(normalizePhone('639171234567')).toBe('09171234567')
    expect(normalizePhone('09171234567')).toBe('09171234567')
  })

  it('leaves two genuinely different numbers different', () => {
    expect(normalizePhone('09171234567')).not.toBe(normalizePhone('09221112222'))
  })

  it('never throws on blank or garbage input', () => {
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone('abc')).toBe('')
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

describe('passingPercentError', () => {
  it('accepts a whole number from 1 to 99', () => {
    for (const ok of ['1', '60', '75', '99', 75, ' 60 ']) expect(passingPercentError(ok)).toBe('')
  })

  it('refuses blank, out-of-range, decimal and non-numeric values', () => {
    expect(passingPercentError('')).toBe('A passing score is required.')
    expect(passingPercentError(null)).toBe('A passing score is required.')
    for (const bad of ['0', '100', '-5', '75.5', 'abc', '1e2']) {
      expect(passingPercentError(bad)).toBe('The passing score must be a whole number from 1 to 99.')
    }
  })
})

describe('class tasks', () => {
  it('taskTitleError: required, at most 120 characters', () => {
    expect(taskTitleError('')).toBe('A title is required.')
    expect(taskTitleError('   ')).not.toBe('')
    expect(taskTitleError('Activity 2 - Pendulum Measurement Lab')).toBe('')
    expect(taskTitleError('x'.repeat(TASK_TITLE_MAX))).toBe('')
    expect(taskTitleError('x'.repeat(TASK_TITLE_MAX + 1))).toMatch(/120/)
  })

  it('taskKindError: the four kinds the rules expect, and the same four deliverables.js offers', () => {
    for (const k of ['activity', 'assignment', 'exam', 'other']) expect(taskKindError(k)).toBe('')
    expect(TASK_KINDS).toEqual(['activity', 'assignment', 'exam', 'other'])
    expect(taskKindError('quiz')).not.toBe('')
    expect(taskKindError('')).not.toBe('')
    expect(taskKindError(undefined)).not.toBe('')
  })

  it('taskWindowError: both ends optional; a deadline before the opening is refused', () => {
    expect(taskWindowError('', '')).toBe('')
    expect(taskWindowError(null, undefined)).toBe('')
    expect(taskWindowError('2026-09-15T08:00', '')).toBe('')
    expect(taskWindowError('', '2026-09-19T23:59')).toBe('')
    expect(taskWindowError('2026-09-15T08:00', '2026-09-19T23:59')).toBe('')
    expect(taskWindowError('2026-09-15T08:00', '2026-09-15T08:00')).toBe('')
    expect(taskWindowError('2026-09-19T23:59', '2026-09-15T08:00')).toBe('The deadline cannot be before the opening time.')
  })

  it('taskWindowError: a malformed date names which field', () => {
    expect(taskWindowError('soon', '')).toMatch(/opening/)
    expect(taskWindowError('', '19/09/2026')).toMatch(/deadline/)
    expect(taskWindowError('2026-09-15T08:00:00', '2026-09-16T08:00:00')).toBe('')
  })

  it('taskAttachmentError: a link needs a web address, a file needs a Storage URL', () => {
    expect(taskAttachmentError({ title: 'T', resource_type: 'link', url: 'https://drive.google.com/x' })).toBe('')
    expect(taskAttachmentError({ title: 'T', resource_type: 'link', url: 'http://phet.colorado.edu/x' })).toBe('')
    expect(taskAttachmentError({ title: 'T', resource_type: 'link', url: 'javascript:alert(1)' })).not.toBe('')
    expect(taskAttachmentError({ title: 'T', resource_type: 'link', url: '' })).toBe('Paste the link.')
    expect(taskAttachmentError({ title: 'T', resource_type: 'link', url: 'drive' })).not.toBe('')
    expect(taskAttachmentError({ title: 'T', resource_type: 'file', url: 'https://firebasestorage.googleapis.com/v0/b/activklass1.firebasestorage.app/o/task_files%2Fc%2Fk%2Fx.pdf?alt=media&token=abc' })).toBe('')
    expect(taskAttachmentError({ title: 'T', resource_type: 'file', url: 'https://activklass1.firebasestorage.app/o/x.pdf' })).toBe('')
    expect(taskAttachmentError({ title: 'T', resource_type: 'file', url: 'https://drive.google.com/x' })).toMatch(/upload/)
    expect(taskAttachmentError({ title: 'T', resource_type: 'file', url: '' })).toMatch(/uploading/)
    expect(taskAttachmentError({ title: 'T', resource_type: 'rich_text', url: 'https://x.ph' })).not.toBe('')
    expect(taskAttachmentError(null)).not.toBe('')
    expect(taskAttachmentsError([])).toBe('')
    expect(taskAttachmentsError(undefined)).toBe('')
    expect(taskAttachmentsError('nope')).not.toBe('')
    expect(taskAttachmentsError([
      { resource_type: 'link', url: 'https://x.ph' },
      { resource_type: 'link', url: 'nope' },
    ])).not.toBe('')
  })

  it('no message names a vendor', () => {
    const all = [
      taskTitleError(''), taskKindError(''), taskWindowError('x', ''), taskWindowError('', 'x'),
      taskWindowError('2026-09-19T23:59', '2026-09-15T08:00'),
      taskAttachmentError({ resource_type: 'file', url: 'https://drive.google.com/x' }),
      taskAttachmentError({ resource_type: 'file', url: '' }),
      taskAttachmentError({ resource_type: 'link', url: 'nope' }),
    ]
    for (const s of all) expect(s).not.toMatch(/firebase|storage|firestore/i)
  })
})

describe('submission note (the submission bin)', () => {
  it('is optional, trimmed, and capped at SUBMISSION_NOTE_MAX', () => {
    expect(submissionNoteError('')).toBe('')
    expect(submissionNoteError(undefined)).toBe('')
    expect(submissionNoteError('x'.repeat(SUBMISSION_NOTE_MAX))).toBe('')
    expect(submissionNoteError(' ' + 'x'.repeat(SUBMISSION_NOTE_MAX) + ' ')).toBe('')
    expect(submissionNoteError('x'.repeat(SUBMISSION_NOTE_MAX + 1))).toMatch(/too long/)
  })
})
