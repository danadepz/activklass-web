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

/** How a match is named back to the admin: "John Does (um-123553)". */
export function describeAccount(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
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
