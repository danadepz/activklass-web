/**
 * Shared field validation.
 *
 * Written after the August 2026 pilot walkthrough, where every tester
 * reported the same class of problem from a different form: names accepted
 * digits, passwords accepted anything eight characters long, year levels
 * accepted free text, and a syllabus link accepted "1". One definition per
 * rule, used by every form that collects the field -- the same reasoning as
 * weightsValid in lib/grading.js (§ "one definition" note there).
 *
 * Each helper returns an error string, or '' when the value passes, so call
 * sites can do `errors.x = nameError(...)` and truthiness does the rest.
 */

/* Letters (including accented characters -- Peña, Muñoz, San José are real
   roster names), spaces, hyphens, apostrophes and periods (for "Ma." and
   generational suffixes like "Jr."). Must contain at least one letter, so
   "..." or "-" cannot pass. \p{L} needs the u flag. */
const NAME_RE = /^[\p{L}][\p{L}\s'.-]*$/u

/**
 * A person-name part (first, middle or last).
 * @param {string} value
 * @param {object} [opts]
 * @param {string} [opts.label='Name'] used in the message ("Middle name ...")
 * @param {boolean} [opts.required=true] optional fields (middle name) pass when blank
 */
export function nameError(value, { label = 'Name', required = true } = {}) {
  const text = String(value ?? '').trim()
  if (!text) return required ? `${label} is required.` : ''
  if (!NAME_RE.test(text)) {
    return `${label} can only contain letters, spaces, hyphens, apostrophes and periods.`
  }
  return ''
}

export const MIN_PASSWORD = 8

/** One line stating the full rule, for placeholders and hints. */
export const PASSWORD_RULE =
  `At least ${MIN_PASSWORD} characters, with an uppercase and lowercase letter, a number and a symbol.`

/**
 * Password strength. Firebase Auth itself only requires 6 characters, and
 * "at least 8" alone let `12345678` through -- every pilot tester flagged it.
 * Policy (owner's call, 2026-08-25): length plus all four character classes.
 * Checks run in the order a reader would fix them, one message at a time.
 */
export function passwordError(value) {
  const text = String(value ?? '')
  if (text.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`
  if (!/[A-Z]/.test(text)) return 'Password must contain an uppercase letter.'
  if (!/[a-z]/.test(text)) return 'Password must contain a lowercase letter.'
  if (!/\d/.test(text)) return 'Password must contain a number.'
  if (!/[^A-Za-z0-9\s]/.test(text)) return 'Password must contain a special character (like ! @ # $).'
  return ''
}

/**
 * Admin-ISSUED temporary passwords: length only. The person must replace it
 * anyway (is_temp_password gates them), and the full character-class rule
 * above would forbid the standing default `pass1234`. User-chosen passwords
 * keep going through passwordError.
 */
export function tempPasswordError(value, { required = true } = {}) {
  const text = String(value ?? '')
  if (!text) return required ? 'Password is required.' : ''
  if (text.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`
  return ''
}

/* "Grade 7" (K-12, grades 1-12) or "1st Year" / "3rd" (college, years 1-5).
   Case-insensitive; "Year" optional on the college form since the class form
   placeholder has always suggested bare "3rd". */
const GRADE_RE = /^grade\s*([1-9]|1[0-2])$/i
const YEAR_RE = /^(1st|2nd|3rd|4th|5th)(\s+year)?$/i

/**
 * Grade/year level.
 * @param {string} value
 * @param {object} [opts]
 * @param {('school'|'college')} [opts.level] restricts to one format when the
 *   form knows the education level; omitted, either format passes (the roster
 *   form serves both).
 * @param {boolean} [opts.required=true]
 */
export function yearLevelError(value, { level, required = true } = {}) {
  const text = String(value ?? '').trim()
  if (!text) {
    return required ? (level === 'college' ? 'Year level is required.' : 'Grade level is required.') : ''
  }
  const isGrade = GRADE_RE.test(text)
  const isYear = YEAR_RE.test(text)
  if (level === 'college') {
    return isYear ? '' : 'Enter a year level like "1st Year" (1st to 5th).'
  }
  if (level === 'school') {
    return isGrade ? '' : 'Enter a grade level like "Grade 7" (Grade 1 to 12).'
  }
  return isGrade || isYear ? '' : 'Enter a level like "Grade 10" or "1st Year".'
}

/* School-issued identifiers: student numbers like "2024-00123", employee
   numbers like "T-2024-018". Letters, digits, dots and hyphens, starting
   alphanumeric so "-" alone cannot pass. Mirrors the backend's sanitizer for
   issued logins (api/admin.py), which keeps exactly these characters. */
const ID_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9.-]*$/

/**
 * A school-issued id number (student number, employee number).
 * @param {string} value
 * @param {object} [opts]
 * @param {string} [opts.label='ID number']
 * @param {boolean} [opts.required=true]
 */
export function idNumberError(value, { label = 'ID number', required = true } = {}) {
  const text = String(value ?? '').trim()
  if (!text) return required ? `${label} is required.` : ''
  if (!ID_NUMBER_RE.test(text)) {
    return `${label} can only contain letters, digits, dots and hyphens.`
  }
  return ''
}

/** DepEd Learner Reference Number: exactly 12 digits. */
export function lrnError(value, { required = true } = {}) {
  const text = String(value ?? '').trim()
  if (!text) return required ? 'LRN is required.' : ''
  if (!/^\d{12}$/.test(text)) return 'LRN must be exactly 12 digits.'
  return ''
}

/** The institution's login prefix: 2–12 letters or digits, stored lowercase. */
export function loginPrefixError(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return 'A login prefix is required.'
  if (!/^[a-z0-9]{2,12}$/.test(text)) {
    return 'The prefix must be 2–12 letters or digits, like "snhs".'
  }
  return ''
}

/**
 * A school's full official name for the public directory ("University of
 * Cebu-Banilad", never "UC Banilad"). Loose on purpose — hyphens, digits and
 * campus suffixes are all real — but it must carry a letter and enough length
 * that a stray abbreviation cannot pass as the full name.
 */
export function schoolNameError(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'The school’s full name is required.'
  if (text.length < 3 || !/\p{L}/u.test(text)) {
    return 'Enter the school’s full name, like "University of Cebu-Banilad".'
  }
  if (text.length > 120) return 'The school name is too long (120 characters at most).'
  return ''
}

/* Mirrors the school_directory create rule in firestore.rules — the
   abbreviation becomes the directory doc id, so the two must agree. */
const SCHOOL_ABBR_RE = /^[A-Za-z0-9]{2,12}$/

/** The short form of a school's name for the directory, like "UCB". */
export function schoolAbbrError(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'An abbreviation is required.'
  if (!SCHOOL_ABBR_RE.test(text)) {
    return 'The abbreviation must be 2–12 letters or digits, like "UCB".'
  }
  return ''
}

/* Same shape as the browser's own type="email" check: one @, no spaces,
   a dot somewhere in the domain. Anything stricter starts rejecting real
   addresses. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** @param {string} value */
export function emailError(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'Email is required.'
  if (!EMAIL_RE.test(text)) return 'Enter a valid email address, like name@school.edu.ph.'
  return ''
}
