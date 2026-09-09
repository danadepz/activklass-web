/**
 * "Is this person already on file?" for the admin console.
 *
 * Accounts here are keyed by the number they are issued from -- a different
 * employee number is a different account, by design -- so the same person
 * added twice under two numbers produced two live accounts and not one word
 * of warning. A pilot tester did exactly that, twice over: two "John Does",
 * two logins, both accepted.
 *
 * The two halves are deliberately not treated alike. Two real people can
 * share a name (a school of 900 has several), so a name match *asks*. An
 * email cannot be shared: for a teacher or student it is the only route back
 * into their account when a password is lost, and for an admin it is the
 * sign-in itself -- so a match is refused.
 *
 * Comparison is loose on purpose: trimmed, case-folded, inner runs of
 * whitespace collapsed. "john  does" and "John Does" are one person typed
 * twice, which is the entire case this exists for.
 *
 * Every function takes a plain list of `{ first_name, last_name, email,
 * personal_email, login_id }` -- which is both a user profile and a parsed
 * bulk-upload row, so the uploader can check a row against the rows above it
 * with the same call it uses against the directory.
 */

const fold = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/** "John Does" — the person, without the login. */
export function accountName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
}

/** How a match is named back to the admin: "John Does (um-123553)". */
export function describeAccount(user) {
  const name = accountName(user)
  const login = user?.login_id || user?.email
  return login ? `${name} (${login})` : name
}

/** Every account already carrying this exact first + last name. */
export function accountsNamed(users, firstName, lastName) {
  const first = fold(firstName)
  const last = fold(lastName)
  if (!first || !last) return []
  return (users ?? []).filter((u) => fold(u.first_name) === first && fold(u.last_name) === last)
}

/**
 * The account already holding this address, if any. Both fields are checked
 * against it: an admin signs in with theirs and a teacher or student keeps
 * theirs for recovery, but either way one address belongs to one person.
 */
export function accountWithEmail(users, email) {
  const wanted = fold(email)
  if (!wanted) return null
  return (users ?? []).find(
    (u) => fold(u.personal_email) === wanted || fold(u.email) === wanted,
  ) ?? null
}

/**
 * The account already holding this issued login, if any. A login is the
 * prefix plus the LAST SIX digits of the LRN, student number or employee
 * number (`issuedLoginId` in lib/logins.js), so two different people whose
 * numbers end the same way are issued the same login — and the second one
 * is refused as "already exists" with nothing in the preview to say why
 * (tester ticket andecobs-45: Shyna and Audrey, both `sccu-000050`). The
 * uploader gives its earlier rows a `login_id` so this one call checks a row
 * against the sheet above it and against the directory alike.
 */
export function accountWithLogin(users, loginId) {
  const wanted = fold(loginId)
  if (!wanted) return null
  return (users ?? []).find((u) => fold(u.login_id) === wanted) ?? null
}
