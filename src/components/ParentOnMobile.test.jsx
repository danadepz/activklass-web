/**
 * The guardian "use the mobile app" screen wears the brand (maykel_64440-38 / T-23).
 *
 * A tester signed in as a guardian on the web and got a bare white card on
 * grey with an indigo heading and an indigo button -- the one page in the
 * product styled with Tailwind's stock utilities instead of the theme, so it
 * read as a different product. The words were right and are unchanged; the
 * chrome was the defect.
 *
 * So this pins the chrome, not the copy: the screen renders inside the same
 * AuthLayout card shell that /login and /register use, the button is the
 * theme's navy, and no stock indigo / slate utility colour is left in the
 * markup. Static markup, the house pattern -- what the tester screenshotted
 * is the first render.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { first_name: 'Rosa', role: 'parent' } }) }))
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ profile: { first_name: 'Rosa', role: 'parent' } }) }))
vi.mock('@/lib/firebase', () => ({ auth: {}, db: {} }))
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-router-dom', () => ({
  Link: ({ children }) => children,
  useNavigate: () => () => {},
}))

import ParentOnMobile from './ParentOnMobile.jsx'
import { navy } from '@/theme'

const html = renderToStaticMarkup(<ParentOnMobile />)

/** `navy` is a hex like #0E2A5C; inline styles serialise it lower/upper-cased as written. */
const navyRe = new RegExp(navy.replace('#', '#?'), 'i')

describe('guardian web screen is in the brand (T-23)', () => {
  it('renders inside the auth card shell, not a bare card', () => {
    // The wandering rings are the AuthLayout signature; the bare card had none.
    expect(html).toMatch(/ak-wander-a/)
    // The brand half of the card: the mark plus the serif wordmark.
    expect(html).toContain('ActivKlass')
  })

  it('keeps the words -- the mobile-by-design message and the greeting by name', () => {
    expect(html).toContain('ActivKlass for guardians is the mobile app')
    expect(html).toContain('Hi Rosa')
    expect(html).toMatch(/sign in there with this same email and password/i)
  })

  it('has no stock indigo or slate utility colour left anywhere in it', () => {
    // These three are what the tester saw: text-indigo-700, bg-indigo-600, bg-slate-100.
    expect(html).not.toMatch(/indigo/)
    expect(html).not.toMatch(/slate-/)
    // And the nearer theme colour was deliberately NOT swapped in instead of the shell.
    expect(html).not.toMatch(/violet/i)
  })

  it('the sign-out button is the theme primary, in navy, with the sign-out text', () => {
    const btn = html.match(/<button[^>]*>[\s\S]*?Sign out[\s\S]*?<\/button>/)
    expect(btn, 'no Sign out button rendered').toBeTruthy()
    expect(btn[0]).toContain('ak-primary')
    expect(btn[0]).toMatch(navyRe)
  })
})
