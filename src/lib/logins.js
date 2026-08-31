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

/**
 * True for the shape a school-issued login always has: the school's prefix
 * (2–12 letters or digits, `loginPrefixError` in validation.js) then a hyphen
 * then exactly six digits. `_issued_login` in the backend's `app/api/admin.py`
 * is what actually mints them and builds the same string, so a login ID that
 * does not match this was never issued by anyone.
 */
export function isIssuedLoginId(loginOrEmail) {
  return /^[a-z0-9]{2,12}-\d{6}$/.test(String(loginOrEmail ?? '').trim().toLowerCase())
}

/**
 * What to say when Firebase rejects the credentials.
 *
 * The field takes two different things — a teacher who signed up themselves
 * uses their email address, an account a school issued uses its login ID — and
 * two testers were locked out of working accounts by typing the other one
 * (T-01, T-02). The first fix branched the hint on whether an `@` was typed,
 * which was wrong: `auth/invalid-credential` is also what a plain mistyped
 * password returns, so a solo teacher who fumbled her password was told to
 * find a school login ID she has never had. **The client cannot tell a wrong
 * password from a wrong identifier** — Firebase deliberately returns the same
 * code for both — so the guidance names both kinds of account and lets the
 * reader pick their own half, rather than guessing for them.
 *
 * The one thing that IS knowable is the identifier's shape: text with no `@`
 * that is not an issued login ("kristine", "t1") is neither credential, and
 * `toAuthEmail` will have sent it to an account that cannot exist. That case
 * says so instead of blaming the password.
 */
export function wrongCredentialMessage(loginOrEmail) {
  const text = String(loginOrEmail ?? '').trim()
  const opening =
    text.includes('@') || isIssuedLoginId(text)
      ? 'Incorrect login or password.'
      : 'That is not an email address or a login ID.'
  return (
    `${opening} If you signed up for ActivKlass yourself, sign in with the email ` +
    'address you registered with; if your school set up your account, use the ' +
    'login ID it gave you, like snhs-123456.'
  )
}
