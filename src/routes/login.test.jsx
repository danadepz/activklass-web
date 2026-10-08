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
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...p }) => <a href={to} {...p}>{children}</a>,
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
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ markPasswordChanged: vi.fn() }) }))
vi.mock('@/components/DevQuickLogin', () => ({ default: () => null }))

import Login from './login.jsx'

const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&rsquo;|&#x27;|’/g, "'").replace(/\s+/g, ' ')

describe('T-66 — the sign-in page tells a parent where their account is made', () => {
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
