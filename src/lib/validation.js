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

/* The same seventeen values as option lists, for a form that would rather
   offer them than validate typing (the roster's Year field, T-22). Kept beside
   the regexes so a dropdown and the rule cannot drift: validation.test.js
   passes every entry through yearLevelError for its own level. */
export const GRADE_LEVELS = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)
export const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year']

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

/* College terms. A CHED subject is a semester offering, so a college class
   carries which one; K-12 runs the whole school year and stores null. */
export const SEMESTERS = [
  { value: '1st', label: '1st Semester' },
  { value: '2nd', label: '2nd Semester' },
  { value: 'summer', label: 'Midyear / Summer' },
]
export const SEMESTER_VALUES = SEMESTERS.map((s) => s.value)

/** Short label for a stored semester value: "1st Sem", "Midyear". */
export function semesterLabel(value) {
  if (value === 'summer') return 'Midyear'
  return SEMESTER_VALUES.includes(value) ? `${value} Sem` : ''
}

/** Required for a college class; must be one of SEMESTERS. */
export function semesterError(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'Semester is required for a college class.'
  return SEMESTER_VALUES.includes(text) ? '' : 'Pick a semester from the list.'
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

/* A PRC professional licence number is seven digits — what the card shows,
   nothing else. Before this, the registration's ID type changed the label and
   nothing about the check, so a 23-character string passed as a licence
   (T-53). */
const PRC_LICENSE_RE = /^\d{7}$/

/**
 * The number on a PRC licence card.
 * @param {string} value
 */
export function prcLicenseError(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'PRC license number is required.'
  if (!PRC_LICENSE_RE.test(text)) return 'A PRC license number is exactly 7 digits, like 1234567.'
  return ''
}

/**
 * The ID number a self-registering teacher gives for the developer's check,
 * judged by the type they picked beside it: a PRC licence has one shape, a
 * school or employee ID has the school's own. One rule for both forms that
 * collect it (registration and the resubmit after a rejection).
 * @param {string} value
 * @param {string} idType  'prc' | 'school_id' (ID_TYPES in routes/pending-verification)
 */
export function verificationIdError(value, idType) {
  return idType === 'prc' ? prcLicenseError(value) : idNumberError(value)
}

/**
 * DepEd Learner Reference Number: exactly 12 digits. The message names the
 * other path on purpose — a college learner has no LRN, and an admin who types
 * a student number here needs to hear that, not just "12 digits" (T-24).
 * `collegePath` is how the calling form switches a learner to college
 * ("set Level to College"); leave it blank where the form decides that itself.
 */
export function lrnError(value, { required = true, collegePath = '' } = {}) {
  const text = String(value ?? '').trim()
  if (!text) return required ? 'LRN is required.' : ''
  if (!/^\d{12}$/.test(text)) {
    return 'LRN must be exactly 12 digits. A learner with no LRN (college) '
      + (collegePath ? `— ${collegePath} and use the student number instead.` : 'uses the student number instead.')
  }
  return ''
}

/**
 * The pass mark a CHED-mode gradebook uses (Grade Config → Passing score):
 * a whole number from 1 to 99. 100 would leave no passing band, 0 would pass
 * everyone; decimals are refused so the ranges table stays readable.
 */
export function passingPercentError(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'A passing score is required.'
  const n = Number(text)
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    return 'The passing score must be a whole number from 1 to 99.'
  }
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

/* One @, no spaces, and a domain that ends in a top-level domain of two or
   more letters. The browser's own type="email" check is looser — it took
   "asdsad@gma.c", which no mail server can deliver to (T-53). Two letters is
   the shortest TLD there is (.ph, .co), so nothing real is refused. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/

/* One-spelling mail providers (T-63, Discord ticket maykel_64440-80): a real
   account on any of these only ever ends in exactly this domain, so a
   lookalike is almost certainly a typo, not an address anyone actually uses
   -- unlike a school's own domain or a real short TLD, which EMAIL_RE above
   must keep accepting (T-53). This checks the provider by name, not by TLD
   length, so it never has to narrow that general rule. */
const KNOWN_MAIL_PROVIDERS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com']

/** True if `a` and `b` differ by at most one substitution, insertion,
 *  deletion or adjacent-letter swap. */
function isOneLetterSlip(a, b) {
  if (a === b) return false
  const lenDiff = Math.abs(a.length - b.length)
  if (lenDiff > 1) return false
  if (a.length === b.length) {
    let firstDiff = -1
    let diffCount = 0
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        diffCount++
        if (firstDiff === -1) firstDiff = i
      }
    }
    if (diffCount === 1) return true
    if (diffCount === 2 && firstDiff < a.length - 1) {
      return (
        a[firstDiff] === b[firstDiff + 1] &&
        a[firstDiff + 1] === b[firstDiff] &&
        a.slice(firstDiff + 2) === b.slice(firstDiff + 2)
      )
    }
    return false
  }
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  let j = 0
  let skipped = false
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] !== longer[j]) {
      if (skipped) return false
      skipped = true
      j++
    } else {
      i++
      j++
    }
  }
  return true
}

/** The real provider domain a mistyped one was probably aiming for, or
 *  '' if `domain` isn't a near miss of any known provider. */
function suggestedProviderDomain(domain) {
  for (const provider of KNOWN_MAIL_PROVIDERS) {
    if (domain === provider) return ''
    const providerName = provider.slice(0, provider.indexOf('.'))
    const dot = domain.indexOf('.')
    const domainName = dot === -1 ? domain : domain.slice(0, dot)
    if (domainName === providerName) return provider // right name, wrong ending: gmail.co, gmail.con
    if (isOneLetterSlip(domainName, providerName)) return provider // wrong name, right idea: gmial.com
  }
  return ''
}

/** @param {string} value */
export function emailError(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'Email is required.'
  if (!EMAIL_RE.test(text)) return 'Enter a valid email address, like name@school.edu.ph.'
  const at = text.lastIndexOf('@')
  const localPart = text.slice(0, at)
  const domain = text.slice(at + 1).toLowerCase()
  const suggestion = suggestedProviderDomain(domain)
  if (suggestion) return `Did you mean ${localPart}@${suggestion}?`
  return ''
}

/**
 * A student's birthdate: the field the guardian-access age gate reads.
 *
 * Required on every path that creates a student (T-50, owner's call
 * 2026-09-11): student/profile.jsx derives "of legal age" from it and a
 * student cannot enter it themselves, so an account made without one is
 * locked out of guardian access until a teacher edits the record. The same
 * sentence is shown under the field on every creation form (BIRTHDATE_HINT)
 * so the requirement is explained before it bites. The provision endpoint
 * (app/services/roster_utils.py) and the admin one (api/admin.py) refuse the
 * row too -- the client rule alone would be shaping, not enforcement.
 *
 * `required: false` is for an edit screen showing an older record that
 * predates the rule: the value is still checked when there is one.
 */
export const BIRTHDATE_HINT = 'Needed before the student can set up guardian access.'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * @param {string} value as the date input gives it, YYYY-MM-DD
 * @param {object} [opts]
 * @param {boolean} [opts.required=true]
 */
export function birthdateError(value, { required = true } = {}) {
  const text = String(value ?? '').trim()
  if (!text) return required ? 'Birthdate is required — the student cannot set up guardian access without it.' : ''
  // Round-trip, not just parse: the engine rolls "2010-02-30" over to March.
  const parsed = new Date(`${text}T00:00:00Z`)
  if (!ISO_DATE_RE.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    return 'Enter the birthdate as YYYY-MM-DD.'
  }
  if (text > new Date().toISOString().slice(0, 10)) return 'Birthdate cannot be in the future.'
  return ''
}

/* A Philippine mobile or landline number, as people actually type it:
   09171234567, +63 917 123 4567, (032) 255-1234. Digits, spaces, dashes,
   parentheses and a leading + are accepted; what is left after stripping
   those must be 7–13 digits, so a stray letter or a 4-digit typo fails. */
const PHONE_CHARS_RE = /^\+?[\d\s()-]+$/

/**
 * @param {string} value
 * @param {object} [opts]
 * @param {boolean} [opts.required=true]
 */
export function phoneError(value, { required = true } = {}) {
  const text = String(value ?? '').trim()
  if (!text) return required ? 'Phone number is required.' : ''
  const digits = text.replace(/\D/g, '')
  if (!PHONE_CHARS_RE.test(text) || digits.length < 7 || digits.length > 13) {
    return 'Enter a valid phone number, like 0917 123 4567.'
  }
  return ''
}

/**
 * A shareable https link — the attachment path beside every upload in this
 * app (and the only one before Storage was provisioned on 2026-09-12). Must
 * parse as a URL and be https;
 * "1", "drive" and a bare domain all fail.
 */
export function linkError(value, { label = 'Link' } = {}) {
  const text = String(value ?? '').trim()
  if (!text) return `${label} is required.`
  let url
  try { url = new URL(text) } catch { return `${label} must be a full web address starting with https://.` }
  if (url.protocol !== 'https:' || !url.hostname.includes('.')) {
    return `${label} must be a full web address starting with https://.`
  }
  return ''
}

/* ------------------------------------------------------------ class tasks

   Activities, assignments and paper exams a teacher publishes under a
   syllabus sub-module for one class (class_tasks, docs/DATA-MODEL.md). The
   dialog on the teacher's Modules tab is the only form that collects these;
   the rules here are the client's half of the shape the rule block expects. */

export const TASK_TITLE_MAX = 120

/* Mirrors TASK_KINDS in lib/deliverables.js -- restated here rather than
   imported so this file stays free of imports, as every form that pulls it
   in relies on. validation.test.js holds the two lists equal. */
const TASK_KIND_VALUES = ['activity', 'assignment', 'exam', 'other']

/** A task's title: required, at most TASK_TITLE_MAX characters. */
export function taskTitleError(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'A title is required.'
  if (text.length > TASK_TITLE_MAX) return `The title is too long (${TASK_TITLE_MAX} characters at most).`
  return ''
}

/** A task's kind: one of activity, assignment, exam, other. */
export function taskKindError(value) {
  return TASK_KIND_VALUES.includes(value) ? '' : 'Pick what kind of task this is.'
}

/* The zone-less 'YYYY-MM-DDTHH:mm' a datetime-local input gives -- the same
   format the quiz builder stores for opens_at / closes_at (plan D3). Seconds
   are tolerated because some browsers append them. */
const WINDOW_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

/**
 * A task's window. Both ends are optional -- an undated task is a fine
 * thing to publish -- but a deadline before the opening time is a mistake
 * the student would otherwise discover as "overdue before it opened".
 * @param {string} opensAt
 * @param {string} dueAt
 */
export function taskWindowError(opensAt, dueAt) {
  const opens = String(opensAt ?? '').trim()
  const due = String(dueAt ?? '').trim()
  if (opens && (!WINDOW_RE.test(opens) || Number.isNaN(new Date(opens).getTime()))) {
    return 'Enter the opening date and time.'
  }
  if (due && (!WINDOW_RE.test(due) || Number.isNaN(new Date(due).getTime()))) {
    return 'Enter the deadline date and time.'
  }
  if (opens && due && new Date(due).getTime() < new Date(opens).getTime()) {
    return 'The deadline cannot be before the opening time.'
  }
  return ''
}

/* The hosts a Storage download URL comes from: the classic
   firebasestorage.googleapis.com and the newer *.firebasestorage.app bucket
   domains. A file attachment must point at one of these, because the app
   wrote it there. */
const STORAGE_HOST_RE = /^([a-z0-9-]+\.)*(firebasestorage\.googleapis\.com|firebasestorage\.app|storage\.googleapis\.com)$/i

/* The same test isSafeLink in lib/attachments.js applies: an http(s) URL,
   nothing else, because these links are rendered as anchors. Restated so
   this file keeps no imports. */
function isHttpUrl(text) {
  try {
    const u = new URL(text)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * One attachment on a task: `{ title, resource_type: 'file' | 'link', url }`,
 * the same shape as a syllabus material. A link needs a web address the
 * anchor can open; a file needs the download URL the upload returned.
 */
export function taskAttachmentError(attachment) {
  const type = attachment?.resource_type
  const url = String(attachment?.url ?? '').trim()
  if (type !== 'file' && type !== 'link') return 'An attachment is either an uploaded file or a link.'
  if (!url) return type === 'file' ? 'The file did not finish uploading. Try again.' : 'Paste the link.'
  if (!isHttpUrl(url)) return 'A link must be a full web address starting with https://.'
  if (type === 'file') {
    let host = ''
    try { host = new URL(url).hostname } catch { /* refused below */ }
    if (!STORAGE_HOST_RE.test(host)) return 'A file attachment must come from an upload. To use a link, add it as a link instead.'
  }
  return ''
}

/** Every attachment on a task; the first problem found, or ''. */
/** A submission's note (the submission bin, plan section 9): optional, at most SUBMISSION_NOTE_MAX characters. */
export const SUBMISSION_NOTE_MAX = 500
export function submissionNoteError(value) {
  const text = String(value ?? '').trim()
  if (text.length > SUBMISSION_NOTE_MAX) return `The note is too long (${SUBMISSION_NOTE_MAX} characters at most).`
  return ''
}

export function taskAttachmentsError(attachments) {
  if (attachments == null) return ''
  if (!Array.isArray(attachments)) return 'Attachments must be a list.'
  for (const a of attachments) {
    const err = taskAttachmentError(a)
    if (err) return err
  }
  return ''
}
