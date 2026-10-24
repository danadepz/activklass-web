/**
 * T-66 (triplecookiemonster-85): a parent holding their child's link code
 * came to the web sign-in page looking for where to make an account and found
 * only "A teacher signing up on your own? Create an account". Guardian sign-up
 * is the mobile app by design (ParentOnMobile, App.jsx), so the original fix
 * was not a web form -- it was a line under the teacher invite that said
 * where to go.
 *
 * T-114 (triplecookiemonster-142) folded that two-line disclaimer into one
 * "Create Account" link, because /register itself now offers a Parent card
 * (step 1) that leads straight to the mobile-app install QR -- the one place
 * that used to carry the parent instructions, "second line" and all. What
 * this file still pins: the single link still goes signed-out teachers (and
 * now parents) to /register, and -- same rule as before, same reason -- it
 * is still never a web sign-up link for a parent or guardian directly.
 *
 * T-156 (andecobs-222, 2026-10-09): Back after signing in returned to a live
 * login form, which could sign in again -- a loop between the dashboard and
 * the login screen. Two separate fixes, pinned in their own describe blocks
 * below: (1) both post-sign-in navigations now replace the history entry
 * instead of pushing a new one, checked here as a source-string assertion
 * since this repo's test setup has no jsdom to drive a real form submit
 * (forgot-password.test.jsx's T-79 block is the model for that pattern); (2)
 * an already-signed-in visitor on /login is bounced to /portal via the
 * exported `shouldRedirectSignedInVisitor` predicate, covering the trap the
 * card called out explicitly -- the redirect must never fire while the
 * screen is on the NEW_PASSWORD stage, or a teacher on a staff-issued
 * password would be bounced out of setting a real one.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...p }) => <a href={to} {...p}>{children}</a>,
  Navigate: ({ to }) => <a href={to}>redirect</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@/lib/firebase', () => ({ auth: {}, db: {} }))
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(),
  setPersistence: vi.fn(),
  updatePassword: vi.fn(),
  browserLocalPersistence: {},
  browserSessionPersistence: {},
}))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn() }))

const authState = vi.hoisted(() => ({ current: { markPasswordChanged: vi.fn(), status: 'signed_out' } }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => authState.current }))
vi.mock('@/components/DevQuickLogin', () => ({ default: () => null }))

import Login, { shouldRedirectSignedInVisitor, PasswordChecklist, PASSWORD_REQUIREMENTS } from './login.jsx'
import { passwordError } from '@/lib/validation'

const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&rsquo;|&#x27;|’/g, "'").replace(/\s+/g, ' ')

describe('T-66 — the sign-in page tells a parent where their account is made', () => {
  authState.current = { markPasswordChanged: vi.fn(), status: 'signed_out' }
  const html = renderToStaticMarkup(<Login />)
  const page = text(html)

  it('invites anyone signed out -- teacher or parent -- to Create an Account (T-130: dropped "New here?")', () => {
    expect(page).toContain('Create an Account')
    expect(page).not.toContain('New here?')
    expect(html).toMatch(/href="\/register"/)
  })

  it('no longer carries the old two-line disclaimer -- that instruction now lives behind the Parent card on /register', () => {
    expect(page).not.toMatch(/A teacher signing up on your own/)
    expect(page).not.toMatch(/A parent or guardian\? Create your account in the ActivKlass mobile app/)
  })

  it('still never sends a parent straight to a web sign-up -- there is exactly one link, and it is /register', () => {
    expect(html).not.toMatch(/href="[^"]*(parent|guardian)[^"]*"/i)
    expect(html.match(/href="\/register[^"]*"/g) ?? []).toEqual(['href="/register"'])
  })

  it('renders a clean, helpful placeholder for the Email/Login ID input', () => {
    expect(html).toContain('placeholder="Enter your email or login ID"')
  })
})

/* T-156, fix (1): the history replace. Not drivable through a real form
   submit (no jsdom in this repo's test setup -- see forgot-password.test.jsx
   T-79 for the established source-assertion pattern this follows), so this
   pins the literal call shape instead: both post-sign-in navigations to
   /portal must pass { replace: true }, or Back returns to a stale login
   form that is still live enough to sign in again. */
describe('T-156 — signing in replaces the login entry in history, so Back does not return to it', () => {
  const source = readFileSync(fileURLToPath(new URL('./login.jsx', import.meta.url)), 'utf8')

  it('both post-sign-in navigations to /portal pass { replace: true }', () => {
    const calls = source.match(/navigate\('\/portal'[^)]*\)/g) ?? []
    expect(calls.length).toBe(2) // handleSignIn's normal path + handleSetPassword's
    for (const call of calls) {
      expect(call).toMatch(/\{\s*replace:\s*true\s*\}/)
    }
  })
})

/* T-156, fix (2): the stage-aware redirect itself, as a plain predicate --
   covers the exact trap the card called out, that a redirect gated only on
   "signed in" would bounce a staff-issued-password teacher out of the
   NEW_PASSWORD stage mid-flow. */
describe('T-156 — shouldRedirectSignedInVisitor', () => {
  it('redirects once a session is confirmed signed in, while still on the sign-in stage', () => {
    expect(shouldRedirectSignedInVisitor('sign_in', 'signed_in')).toBe(true)
  })

  it('also redirects a visitor whose profile failed to load or does not exist yet -- /portal sorts that out', () => {
    expect(shouldRedirectSignedInVisitor('sign_in', 'error')).toBe(true)
    expect(shouldRedirectSignedInVisitor('sign_in', 'not_registered')).toBe(true)
  })

  it('never redirects while still loading -- a signed-out visitor must not flash through /portal first', () => {
    expect(shouldRedirectSignedInVisitor('sign_in', 'loading')).toBe(false)
  })

  it('never redirects a genuinely signed-out visitor', () => {
    expect(shouldRedirectSignedInVisitor('sign_in', 'signed_out')).toBe(false)
  })

  it('never redirects out of the NEW_PASSWORD stage, even though the account is signed in', () => {
    expect(shouldRedirectSignedInVisitor('new_password', 'signed_in')).toBe(false)
  })
})

/* Rendered proof of the same two cases, using the component itself rather
   than the predicate in isolation -- confirms the predicate is actually
   wired into the render path. */
describe('T-156 — /login rendered for an already-signed-in visitor', () => {
  function render(status) {
    authState.current = { markPasswordChanged: vi.fn(), status }
    return renderToStaticMarkup(<Login />)
  }

  it('bounces to /portal instead of showing the form', () => {
    expect(render('signed_in')).toBe('<a href="/portal">redirect</a>')
  })

  it('still shows the sign-in form while loading', () => {
    const html = render('loading')
    expect(html).toContain('Sign in')
    expect(html).not.toContain('redirect')
  })

  it('still shows the sign-in form for a signed-out visitor', () => {
    expect(render('signed_out')).toContain('Sign in')
  })
})

/* T-182 (maykel_64440-301, 2026-10-24): the first-login set-password screen
   -- stage === NEW_PASSWORD, reached only through internal state a static
   render cannot force (see T-156's own source-read above for the same
   constraint) -- still read sentence case: "New password", "Confirm new
   password", "Set password and continue". Source-read, not rendered. Does
   NOT touch "Email/Login ID" -- the owner settled that wording in the
   andecobs-169 review and it is not this sweep's to re-open. */
describe('T-182 — the set-password screen is Title Case, not the old sentence case', () => {
  const source = readFileSync(fileURLToPath(new URL('./login.jsx', import.meta.url)), 'utf8')

  it('both field labels', () => {
    expect(source).toContain('New Password</label>')
    expect(source).toContain('Confirm New Password</label>')
    expect(source).not.toContain('New password</label>')
    expect(source).not.toContain('Confirm new password</label>')
  })

  it('the submit label', () => {
    expect(source).toContain("'Set Password and Continue'")
    expect(source).not.toContain("'Set password and continue'")
  })

  it('leaves the settled Email/Login ID label alone (andecobs-169) -- not this sweep\'s to re-open', () => {
    expect(source).toContain('Email/Login ID</label>')
  })
})

/* T-201 (maykel_64440-301, owner decision (b), 2026-10-24): on the first-
 * login set-password screen, replace the password-requirements sentence
 * with a live checklist, and remove the disabled temp-password field. The
 * card's own named trap: that field's VALUE is still load-bearing --
 * handleSetPassword refuses setting the new password to the one just typed
 * (:175, `newPassword === password`) -- so the fix must hide the input
 * without touching the `password` state or that comparison. Removing the
 * state along with the field would make the guard compare against '',
 * which is never the typed password, silently passing it every time.
 */
describe('T-201 — the live password checklist mirrors passwordError, never redefines it', () => {
  it('five requirements, same order, same thresholds as lib/validation.js\'s passwordError', () => {
    expect(PASSWORD_REQUIREMENTS).toHaveLength(5)
    const [length, upper, lower, digit, special] = PASSWORD_REQUIREMENTS

    // Mirrors passwordError's own check order: length, upper, lower, digit, special.
    expect(length.test('1234567')).toBe(false) // 7 chars
    expect(length.test('12345678')).toBe(true) // 8 chars (MIN_PASSWORD)
    expect(upper.test('abcdefgh')).toBe(false)
    expect(upper.test('Abcdefgh')).toBe(true)
    expect(lower.test('ABCDEFGH')).toBe(false)
    expect(lower.test('ABCDEFGh')).toBe(true)
    expect(digit.test('Abcdefgh')).toBe(false)
    expect(digit.test('Abcdefg1')).toBe(true)
    expect(special.test('Abcdefg1')).toBe(false)
    expect(special.test('Abcdefg1!')).toBe(true)
  })

  it('a password meeting every rule passes every requirement, matching an empty passwordError()', () => {
    const strong = 'Abcdefg1!'
    expect(passwordError(strong)).toBe('')
    expect(PASSWORD_REQUIREMENTS.every(({ test }) => test(strong))).toBe(true)
  })
})

describe('T-201 — PasswordChecklist renders all five rules and reflects which are met', () => {
  it('lists all five requirement labels', () => {
    const html = renderToStaticMarkup(<PasswordChecklist value="" />)
    for (const { label } of PASSWORD_REQUIREMENTS) {
      expect(html).toContain(label)
    }
  })

  it('an empty value shows none met -- every item the unmet (grey, hollow) style', () => {
    const html = renderToStaticMarkup(<PasswordChecklist value="" />)
    expect(html).not.toContain('#1F8A5B') // the met colour never appears
  })

  it('a password meeting only SOME rules shows a mix, not all-or-nothing', () => {
    // "abcdefgh": length OK, lowercase OK; no upper, no digit, no special.
    const html = renderToStaticMarkup(<PasswordChecklist value="abcdefgh" />)
    const metCount = (html.match(/#1F8A5B/g) ?? []).length
    // Met items render the colour twice each (text colour + filled circle
    // background) -- two of five met (length, lowercase) is 4 occurrences,
    // strictly between 0 (none) and 10 (all five).
    expect(metCount).toBeGreaterThan(0)
    expect(metCount).toBeLessThan(10)
  })
})

describe('T-201 — the temp-password field is gone from the set-password screen, its STATE is not', () => {
  const source = readFileSync(fileURLToPath(new URL('./login.jsx', import.meta.url)), 'utf8')

  it('the login-password input only renders when NOT settingPassword', () => {
    const fieldAt = source.indexOf('id="login-password"')
    const guardAt = source.lastIndexOf('{!settingPassword && (', fieldAt)
    expect(fieldAt).toBeGreaterThan(-1)
    expect(guardAt).toBeGreaterThan(-1)
    // No closing of that guard's block between the guard and the field --
    // i.e. the field is actually inside it, not just preceded by it.
    const between = source.slice(guardAt, fieldAt)
    expect(between).not.toMatch(/\n {8}\)\}/) // the guard's own closing at the same indent
  })

  it('the checklist replaces the old prose sentence under New Password', () => {
    expect(source).toContain('<PasswordChecklist value={newPassword} />')
    expect(source).not.toMatch(/\{PASSWORD_RULE\}/)
  })

  it('THE TRAP: handleSetPassword still refuses reusing the password just typed, reading the `password` state directly', () => {
    const at = source.indexOf('async function handleSetPassword')
    const end = source.indexOf('\n  async function handleSubmit', at)
    const body = source.slice(at, end)
    expect(body).toMatch(/newPassword === password/)
    expect(body).toMatch(/must be different from the one you were given/)
  })

  it('the `password` useState itself is still declared -- the field is hidden, not deleted', () => {
    expect(source).toMatch(/const \[password, setPassword\] = useState\(''\)/)
  })
})
