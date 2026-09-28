/**
 * T-95 (andecobs-121) — the gap in `_layout.test.jsx`'s own cover.
 *
 * That file pins two things about the student Profile page: that it imports
 * `SignOutButton`, and that `<SignOutCard />` is placed at the bottom. Neither
 * says the card actually *contains* a sign-out control. Replacing the
 * `<SignOutButton …/>` inside `SignOutCard` with a plain `<span>` leaves all
 * seven of those checks green while a student has no way to end their session
 * anywhere in the app — the chrome no longer offers one either, which is the
 * whole point of T-95.
 *
 * The card's "Done means" asked for exactly this: *every breakpoint still has a
 * reachable way out*. This pins the last link in that chain.
 *
 * Source-read rather than rendered, matching `_layout.test.jsx`'s own stated
 * pattern — `SignOutCard` is module-private, so a static render cannot reach it
 * without exporting it, and exporting a component only so a test can see it is
 * a worse trade than reading the one function body.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const profileSrc = readFileSync(fileURLToPath(new URL('./profile.jsx', import.meta.url)), 'utf8')

/** The body of `function SignOutCard() { … }`, up to the next top-level `function`. */
function signOutCardBody() {
  const start = profileSrc.indexOf('function SignOutCard()')
  expect(start).toBeGreaterThan(-1)
  const after = profileSrc.slice(start + 'function SignOutCard()'.length)
  const next = after.search(/\n(?:function|export|const) /)
  return next === -1 ? after : after.slice(0, next)
}

describe('T-95 — the Sign out card actually holds a sign-out control', () => {
  it('renders SignOutButton, not just a heading that says "Sign out"', () => {
    expect(signOutCardBody()).toMatch(/<SignOutButton\b/)
  })

  it('the heading alone does not satisfy it — the control is what a student presses', () => {
    const body = signOutCardBody()
    // Both are wanted; this states plainly that the text is not the thing.
    expect(body).toContain('Sign out')
    expect(body).toMatch(/<SignOutButton\b/)
  })
})
