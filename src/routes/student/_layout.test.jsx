/**
 * T-95 (andecobs-121, Derick 2026-09-27; dawn's decision at 14:34): the
 * student's Sign out moves into the profile card, matching the teacher's
 * placement -- at the bottom of the Profile page, not sitting in the chrome.
 * Derick had asked for the opposite (move the TEACHER's up to the navbar);
 * the owner reversed the direction in the thread, so this pins the student
 * side changing and the teacher layout staying untouched.
 *
 * Read from source, the house pattern for structure a portal or closed-by-
 * default state hides from renderToStaticMarkup (signOutOverlay.test.js,
 * ProtectedRoute's docstring): the mobile drawer and the old confirm modal
 * only rendered once menuOpen / showLogoutConfirm flipped true, so a static
 * render with the default (closed) state could not see them, but the source
 * pin does not care what state gated them.
 *
 * Before the fix `_layout.jsx` rendered "Sign out" three times -- the
 * desktop button, the mobile drawer button, and the confirmation modal's own
 * button (git show HEAD~1:src/routes/student/_layout.jsx, lines 225, 295,
 * 380) -- and this file's checks were red against that version.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const layoutSrc = readFileSync(fileURLToPath(new URL('./_layout.jsx', import.meta.url)), 'utf8')
const profileSrc = readFileSync(fileURLToPath(new URL('./profile.jsx', import.meta.url)), 'utf8')
const teacherLayoutSrc = readFileSync(
  fileURLToPath(new URL('../teacher/_layout.jsx', import.meta.url)),
  'utf8',
)

describe('T-95 — no Sign out left in the student chrome, at any width', () => {
  it('the student shell renders no "Sign out" control at all', () => {
    // Match the control's own JSX text node (a bare "Sign out" line, as the
    // three removed buttons all had it) rather than any mention of the
    // phrase -- the comments above now explain where it moved to.
    expect(layoutSrc).not.toMatch(/^[ \t]*Sign out[ \t]*$/m)
  })

  it('carries no confirm-and-logout wiring of its own any more', () => {
    expect(layoutSrc).not.toMatch(/showLogoutConfirm/)
    expect(layoutSrc).not.toMatch(/logout\(\)/)
  })

  it('every original site (desktop avatar, hamburger drawer) now links to the profile card instead', () => {
    const profileLinks = layoutSrc.match(/to="\/student\/profile"/g) ?? []
    // desktop avatar (was :225) + the mobile drawer row (was :295); the third
    // site (:380) was the confirm modal itself, removed outright -- its job
    // moved to the shared SignOutButton the profile card now renders.
    expect(profileLinks.length).toBeGreaterThanOrEqual(2)
  })
})

describe('T-95 — the student Profile page is where Sign out lives now', () => {
  it('imports the same shared confirm-to-sign-out control the teacher account page uses', () => {
    expect(profileSrc).toMatch(/import SignOutButton from '@\/components\/SignOutButton'/)
  })

  it('renders it in a card at the bottom of the page', () => {
    const bottom = profileSrc.slice(profileSrc.lastIndexOf('export default function StudentProfile'))
    expect(bottom).toMatch(/<ChangePassword \/>\s*<SignOutCard \/>/)
  })
})

describe("T-95 — the teacher layout, the pattern being matched, is untouched", () => {
  it('still renders Sign out nowhere in its own chrome (it always lived on the account page)', () => {
    expect(teacherLayoutSrc).not.toMatch(/Sign out/)
  })

  it('still links the desktop avatar card and the mobile drawer row to /teacher/account, unchanged', () => {
    const accountLinks = teacherLayoutSrc.match(/to="\/teacher\/account"/g) ?? []
    expect(accountLinks.length).toBeGreaterThanOrEqual(2)
  })
})

describe('T-110 (triplecookiemonster-141 item 6) — the header card mirrors the teacher side: initials and account id, not the name', () => {
  /** The header's own profile card, not the mobile dropdown's separate row. */
  function headerCardSlice() {
    const start = layoutSrc.indexOf('to="/student/profile"')
    const end = layoutSrc.indexOf('Hamburger', start)
    return layoutSrc.slice(start, end)
  }

  it('no longer renders the student\'s name in the header card', () => {
    expect(headerCardSlice()).not.toMatch(/profile\.first_name/)
  })

  it('still renders the initials and the account id', () => {
    const card = headerCardSlice()
    expect(card).toMatch(/\{initials\}/)
    expect(card).toMatch(/profile\.login_id \?\? profile\.email/)
  })

  it('carries no ring colour -- students have no subscription of their own to show one for', () => {
    // Unlike the teacher card, a student profile never resolves a kind from
    // lib/subscription.js (useMySubscription gates on role === 'teacher'), so
    // no SUBSCRIPTION_RING_COLOR map is wired in here -- inventing one would
    // paint every student's avatar with whatever the fallback kind is.
    expect(layoutSrc).not.toMatch(/SUBSCRIPTION_RING_COLOR/)
  })
})
