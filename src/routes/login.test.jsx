/**
 * T-66 (triplecookiemonster-85): a parent holding their child's link code
 * came to the web sign-in page looking for where to make an account and found
 * only "A teacher signing up on your own? Create an account". Guardian sign-up
 * is the mobile app by design (ParentOnMobile, App.jsx), so the fix is not a
 * web form -- it is a line under the teacher invite that says where to go.
 *
 * Pinned: the parent line is on the signed-out page, names the mobile app and
 * the link code, and does not turn into a web sign-up link (the one thing the
 * card said must not be built).
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

  it('still invites a teacher to register on the web', () => {
    expect(page).toContain('A teacher signing up on your own? Create an account')
    expect(html).toMatch(/href="\/register"/)
  })

  it('has a parent line naming the mobile app and the link code from the child', () => {
    expect(page).toMatch(/A parent or guardian\? Create your account in the ActivKlass mobile app with the link code from your child's Profile/)
    expect(page).toMatch(/same email and password/)
  })

  it('does not send a parent to a web sign-up (guardians register in the app)', () => {
    expect(html).not.toMatch(/href="[^"]*(parent|guardian)[^"]*"/i)
    expect(html.match(/href="\/register[^"]*"/g) ?? []).toEqual(['href="/register"'])
  })
})
