/**
 * Forgot password tells an issued login where its reset really is (T-47,
 * triplecookiemonster-61).
 *
 * A student who signs in as `slcsflu-231525` opened this page and found one
 * Email field. Typing the login got "Enter a valid email address"; typing the
 * personal email her teacher recorded got "a password reset link is on its
 * way" -- and nothing can arrive, because an issued login sits behind an
 * internal address with no inbox (lib/logins.js). The real path is the
 * teacher's or admin's Reset password, and the page never said so.
 *
 * Three things are pinned: the note is on the page before anything is typed;
 * text with no `@` gets that note instead of the email rule; and the success
 * screen no longer promises an inbox to an account that signs in by ID. The
 * submit-time rule and the success notice are exported so the assertions do
 * not need a live Firebase call to reach them (register.test.jsx's
 * WrongPathNudge is the model). The email path is unchanged and checked too.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
}))
vi.mock('@/lib/api', () => ({ api: vi.fn() }))

import ForgotPassword, {
  ISSUED_LOGIN_NOTE,
  ResetSentNotice,
  forgotPasswordProblem,
} from './forgot-password.jsx'

describe('forgot password and an issued login (T-47)', () => {
  it('the note names the teacher and the school admin, and no vendor', () => {
    expect(ISSUED_LOGIN_NOTE).toMatch(/login ID like snhs-123456/)
    expect(ISSUED_LOGIN_NOTE).toMatch(/no inbox/)
    expect(ISSUED_LOGIN_NOTE).toMatch(/ask your teacher or your school admin/)
    expect(ISSUED_LOGIN_NOTE).not.toMatch(/firebase|flask|internal/i)
  })

  it('is on the page before anything is typed', () => {
    const html = renderToStaticMarkup(<ForgotPassword />)
    expect(html).toContain('login ID like snhs-123456')
    expect(html).toContain('ask your teacher or your school admin')
    // and the subtitle no longer asks for "your account email" as if every account had one
    expect(html).toContain('the email you sign in with')
    expect(html).not.toContain('your account email')
  })

  it('a login ID gets the note, not "enter a valid email address"', () => {
    for (const typed of ['slcsflu-231525', ' SLCSFLU-231525 ', 'snhs-789012', 'kristine']) {
      expect(forgotPasswordProblem(typed)).toBe(ISSUED_LOGIN_NOTE)
      expect(forgotPasswordProblem(typed)).not.toMatch(/valid email/i)
    }
  })

  it('an email is still judged by the shared email rule', () => {
    expect(forgotPasswordProblem('')).toBe('Email is required.')
    expect(forgotPasswordProblem('   ')).toBe('Email is required.')
    expect(forgotPasswordProblem('maria@')).toMatch(/valid email address/i)
    expect(forgotPasswordProblem('maria.santos@school.edu.ph')).toBe('')
  })

  it('the success screen promises no inbox to an issued account', () => {
    const html = renderToStaticMarkup(<ResetSentNotice email="skittles@gmail.com" />)
    // The sentence the tester would have read for an address no account signs in with.
    expect(html).not.toMatch(/If an account exists for/)
    expect(html).toContain('If skittles@gmail.com signs in here')
    expect(html).toContain('ask your teacher or your school admin')
    // Still says nothing about whether the email is registered (anti-enumeration).
    expect(html).not.toMatch(/no account|not found|not registered/i)
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
    const html = renderToStaticMarkup(<ResetSentNotice email="wrong@example.com" />)
    const conditionAt = html.indexOf('signs in here')
    const linkClauseAt = html.indexOf('the link is on its way')
    expect(conditionAt).toBeGreaterThan(-1)
    expect(linkClauseAt).toBeGreaterThan(-1)
    expect(conditionAt).toBeLessThan(linkClauseAt)
  })

  it('closes the loop for a wrong address without saying so', () => {
    const html = renderToStaticMarkup(<ResetSentNotice email="wrong@example.com" />)
    expect(html).toMatch(/Nothing arriving in a few minutes usually means/)
    expect(html).toMatch(/Try another, or ask your teacher or school admin/)
    // True whether or not the account exists -- still no existence branch.
    expect(html).not.toMatch(/no account|not found|not registered|doesn't exist|does not exist/i)
  })

  it('never branches the message on any server answer -- email is the only prop', () => {
    expect(ResetSentNotice.length).toBe(1)
    // No condition on anything but the email itself -- no `sent`/`exists`/
    // response field ever reaches this component's own logic.
    expect(ResetSentNotice.toString()).not.toMatch(/\?|&&|exists/i)
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
