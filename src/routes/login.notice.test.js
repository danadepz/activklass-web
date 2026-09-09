/**
 * The first-login notice does not assume a school issued the account
 * (T-38, triplecookiemonster-52).
 *
 * A student provisioned by a *solo teacher* signed in for the first time and
 * was told "Your account was set up by your school" — naming something that
 * does not exist on that plan. The same assumption fired again one step later,
 * where reusing the temporary password was refused with "the one your school
 * gave you", so changing only the first sentence would have walked her
 * straight into the second.
 *
 * Both strings are set inside `handleSignIn` / `handleSetPassword`, which a
 * static render never reaches — the notice only exists after Firebase answers.
 * So this reads the source and pins the two facts the tester's report turns on:
 * neither sentence names a school, and the notice matches the wording the
 * sibling screen already shipped, so the two cannot drift apart again.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const login = read('./login.jsx')

/** The string literals login.jsx shows a person, ignoring code and comments. */
function userFacingText(src) {
  return src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')
}

describe('first-login notice is plan-neutral (T-38)', () => {
  const text = userFacingText(login)

  it('never tells anyone their school set up the account', () => {
    // The exact sentence the tester screenshotted.
    expect(text).not.toMatch(/set up by your school/i)
    expect(text).not.toMatch(/your school (set|gave|issued)/i)
  })

  it('still says the password is not theirs yet, in neutral words', () => {
    expect(text).toMatch(/set up for you, so the password you just used is not yours yet/i)
    expect(text).toMatch(/choose a new one to continue/i)
  })

  it('the reuse refusal one step later is neutral too', () => {
    // Changing only the notice would have walked her into this on the next submit.
    expect(text).toMatch(/must be different from the one you were given/i)
    expect(text).not.toMatch(/different from the one your school/i)
  })

  it('matches the wording the sibling screen already ships', () => {
    // change-password.jsx is where ProtectedRoute sends people; login catches
    // them first. If these drift, one plan gets the wrong story again.
    const sibling = read('./change-password.jsx')
    expect(sibling).toMatch(/set up for you, so the password/i)
    expect(sibling).not.toMatch(/set up by your school/i)
  })
})
