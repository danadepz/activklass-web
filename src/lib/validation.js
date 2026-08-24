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
