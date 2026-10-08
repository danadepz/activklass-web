/**
 * Forgot password tells an issued login where its reset really is (T-47,
 * triplecookiemonster-61) -- and, since T-131, does it in the confirmation
 * popup shown right after Send reset link, not in a paragraph standing on
 * the page before anything is typed.
 *
 * A student who signs in as `slcsflu-231525` opened this page and found one
 * Email field. Typing the login got "Enter a valid email address"; typing the
 * personal email her teacher recorded got "a password reset link is on its
 * way" -- and nothing can arrive, because an issued login sits behind an
 * internal address with no inbox (lib/logins.js). The real path is the
 * teacher's or admin's Reset password, and the page never said so.
 *
 * T-131 (owner, 2026-10-08) asked for the standing paragraph and the
 * "Remembered it?" line gone, a generic sample in the email placeholder
 * instead of a school address, and a confirmation popup on submit covering
 * both what happens next and how to recover an issued-login account. The
 * submit-time rule no longer blocks a typed login ID either -- it reaches the
 * same popup every other submission does, since the backend already answers
 * `{ sent: true }` identically whether or not `@` is even present (the
 * anti-enumeration promise below). What T-47 and T-100 actually protect
 * (never claim a link is coming unconditionally, always say what "nothing
 * arriving" means, always name the real way in) still holds -- it just lives
 * in `resetRequestedMessage` now instead of `ISSUED_LOGIN_NOTE` and
 * `ResetSentNotice`. The rule and the message are exported so the assertions
 * do not need a live Firebase call or a mounted dialog to reach them
 * (register.test.jsx's WrongPathNudge is the model).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
}))
vi.mock('@/lib/api', () => ({ api: vi.fn() }))
vi.mock('@/components/ui/dialogs', () => ({ alertDialog: vi.fn(async () => undefined) }))

import ForgotPassword, {
  forgotPasswordProblem,
  resetRequestedMessage,
} from './forgot-password.jsx'

describe('forgot password and an issued login (T-47, moved into the popup by T-131)', () => {
  it('lets a login ID through instead of blocking it on the page', () => {
    for (const typed of ['slcsflu-231525', ' SLCSFLU-231525 ', 'snhs-789012', 'kristine']) {
      expect(forgotPasswordProblem(typed)).toBe('')
    }
  })

  it('an email is still judged by the shared email rule', () => {
    expect(forgotPasswordProblem('')).toBe('Email is required.')
    expect(forgotPasswordProblem('   ')).toBe('Email is required.')
    expect(forgotPasswordProblem('maria@')).toMatch(/valid email address/i)
    expect(forgotPasswordProblem('maria.santos@school.edu.ph')).toBe('')
  })

  it('the popup message names the teacher and the school admin, and no vendor', () => {
    const message = resetRequestedMessage('skittles@gmail.com')
    expect(message).toMatch(/ask your teacher or your school admin/)
    expect(message).toMatch(/no inbox/)
    expect(message).toMatch(/login ID instead, like sample-123456/)
    expect(message).not.toMatch(/firebase|flask|internal/i)
  })

  it('the popup still says nothing about whether the account exists (anti-enumeration)', () => {
    const message = resetRequestedMessage('skittles@gmail.com')
    expect(message).toContain('If skittles@gmail.com signs in here')
    expect(message).not.toMatch(/no account|not found|not registered|doesn't exist|does not exist/i)
  })
})

/* T-131 (owner, 2026-10-08): the standing paragraph, the "Remembered it?"
   line and the school-domain placeholder are gone from the page itself --
   the paragraph's job moved into the popup (above), and the page stays this
   plain regardless of what gets typed. */
describe('forgot password page itself (T-131)', () => {
  const html = renderToStaticMarkup(<ForgotPassword />)

  it('no longer carries the standing issued-login paragraph', () => {
    expect(html).not.toContain('login ID like snhs-123456')
    expect(html).not.toContain('Those accounts have no inbox')
  })

  it('drops "Remembered it?" but still offers a way back to sign in', () => {
    expect(html).not.toContain('Remembered it?')
    expect(html).toContain('Back to sign in')
  })

  it('placeholders a generic sample address, not a school domain', () => {
    expect(html).toContain('sample.maria@gmail.com')
    expect(html).not.toContain('you@school.edu.ph')
  })

  it('still asks for "the email you sign in with", not "your account email"', () => {
    expect(html).toContain('the email you sign in with')
    expect(html).not.toContain('your account email')
  })
})

/* T-100 (maykel_64440-128): he typed an address that is not an account and
   read "a password reset link is on its way" as confirmation, then waited
   for mail that was never coming. The page was never wrong -- the backend
   answers identically either way on purpose (the anti-enumeration promise
   above) -- but the old copy put that sentence right after the condition
   and never told a wrong-address reader what to do next. Two things are
   pinned: the condition still leads (so the "link is on its way" clause
   can never be read as unconditional), and a closing sentence now tells
   that reader what "nothing arriving" means and what to do about it --
   worded so it stays true, and gives away nothing, whether or not the
   account exists. */
describe('forgot password does not read as confirmation of a wrong address (T-100)', () => {
  it('leads with the condition, not with the reassurance', () => {
    const message = resetRequestedMessage('wrong@example.com')
    const conditionAt = message.indexOf('signs in here')
    const linkClauseAt = message.indexOf('the link is on its way')
    expect(conditionAt).toBeGreaterThan(-1)
    expect(linkClauseAt).toBeGreaterThan(-1)
    expect(conditionAt).toBeLessThan(linkClauseAt)
  })

  it('closes the loop for a wrong address without saying so', () => {
    const message = resetRequestedMessage('wrong@example.com')
    expect(message).toMatch(/Nothing arriving in a few minutes usually means/)
    expect(message).toMatch(/Try another, or ask your teacher or your school admin/)
    // True whether or not the account exists -- still no existence branch.
    expect(message).not.toMatch(/no account|not found|not registered|doesn't exist|does not exist/i)
  })

  it('never branches the message on any server answer -- email is the only input', () => {
    // No condition on anything but the email itself -- no `sent`/`exists`/
    // response field ever reaches this function's own logic.
    expect(resetRequestedMessage.length).toBe(1)
    expect(resetRequestedMessage.toString()).not.toMatch(/\?|&&|exists/i)
  })
})

/* T-79 (andecobs-102): Derick asked for a reset, got the mail, clicked the link
   and was told it had "expired or already used" on the first click. The code was
   fine; Firebase's own hosted handler was not, and it could not be configured
   away (the console refuses that save on this project). The fix takes Firebase's
   page out of the path: our backend issues the code and mails a link at our own
   reset-password.jsx. Send the browser back to sendPasswordResetEmail and the
   tester's dead link returns, with every assertion above still green.

   The backend half — that the mailed link points at our page and never at
   activklass1.firebaseapp.com — is locked by
   activklass-backend/tests/smoke_forgot_password.py. */
const source = readFileSync(fileURLToPath(new URL('./forgot-password.jsx', import.meta.url)), 'utf8')

describe('T-79 — the reset link comes from us, not from Firebase', () => {
  it('asks our own backend to send it', () => {
    expect(source).toMatch(/api\('\/api\/auth\/forgot-password', \{ method: 'POST'/)
  })

  it("never calls Firebase's client-side reset, whose hosted page was the bug", () => {
    expect(source).not.toMatch(/sendPasswordResetEmail/)
    expect(source).not.toMatch(/firebaseapp\.com/)
  })
})

/* T-131: Send reset link must actually open the confirmation popup with the
   message above, not just build the string and drop it -- a call site wired
   wrong would pass every test so far and still show the reader nothing. */
describe('T-131 — Send reset link opens the confirmation popup', () => {
  it('calls alertDialog with resetRequestedMessage(email)', () => {
    expect(source).toMatch(/alertDialog\(\{\s*title:[^,]+,\s*message:\s*resetRequestedMessage\(/)
  })
})
