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
    expect(html).toContain('If an account signs in with skittles@gmail.com')
    expect(html).toContain('ask your teacher or your school admin')
    // Still says nothing about whether the email is registered (anti-enumeration).
    expect(html).not.toMatch(/no account|not found|not registered/i)
  })
})
