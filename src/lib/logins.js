/**
 * Institution-issued logins.
 *
 * ActivKlass has no mail domain, so the login people see and type is just
 * `<prefix>-<last 6 digits>` — the prefix the school's admin configured plus
 * the last six digits of the student's LRN or the teacher's employee number,
 * e.g. `snhs-789012`. Firebase Auth only signs in by email, so
 * INTERNAL_LOGIN_SUFFIX is appended behind the scenes: by the server when the
 * account is created (_issued_login in api/admin.py is authoritative; the
 * helpers here only preview), and by the sign-in page when someone types an
 * issued login. The suffix is never shown to anyone.
 */
export const INTERNAL_LOGIN_SUFFIX = '@activklass.internal'

/** What admin-issued accounts start on unless the admin types another. */
export const DEFAULT_PASSWORD = 'pass1234'

/**
 * 'snhs-789012' from the prefix + the last 6 digits of an id number.
 * Returns '' when there is no prefix or the id carries fewer than 6 digits.
 */
export function issuedLoginId(prefix, idNumber) {
  const digits = String(idNumber ?? '').replace(/\D/g, '')
  if (!prefix || digits.length < 6) return ''
  return `${prefix}-${digits.slice(-6)}`
}

/**
 * What signInWithEmailAndPassword needs: a real email passes through, an
 * issued login gets the internal suffix appended.
 */
export function toAuthEmail(loginOrEmail) {
  const text = String(loginOrEmail ?? '').trim()
  return text.includes('@') ? text : `${text.toLowerCase()}${INTERNAL_LOGIN_SUFFIX}`
}
