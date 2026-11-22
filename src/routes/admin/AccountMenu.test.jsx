/**
 * Admin header account menu (2026-11-17, owner request): the lone outlined
 * "Sign Out" button became a standard account control -- initials, name and
 * role as the trigger, Sign Out inside its menu, still through SignOutButton
 * so the confirmation dialog is unchanged.
 *
 * No DOM library here: the open state is seeded through useState, the same
 * render-gating trick addUser.test.jsx uses.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const seed = vi.hoisted(() => ({ open: false }))

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    // AccountMenu's only boolean state is `open`; SignOutButton's `asking`
    // also starts false, so seed just the first false we see per render.
    useState: (init) => {
      if (init === false && seed.open) { seed.open = false; return real.useState(true) }
      return real.useState(init)
    },
  }
})
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }))

import AccountMenu, { initialsOf } from './AccountMenu.jsx'

const PROFILE = { first_name: 'John Michael', last_name: 'Mendoza', email: 'johnmichaelmendoza1234@gmail.com' }

function render({ open = false, ...props } = {}) {
  seed.open = open
  return renderToStaticMarkup(<AccountMenu profile={PROFILE} onChangePassword={() => {}} {...props} />)
}

describe('closed: the trigger names who is signed in', () => {
  const html = render()

  it('shows initials, full name and role', () => {
    expect(html).toContain('>JM<')
    expect(html).toContain('John Michael Mendoza')
    expect(html).toContain('School Admin')
  })

  it('is a real menu button, collapsed, with no Sign Out showing yet', () => {
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('role="menu"')
    expect(html).not.toContain('Sign Out')
  })
})

describe('open: the menu holds the account actions', () => {
  const html = render({ open: true })

  it('shows the account, then Change Password, then Sign Out last', () => {
    expect(html).toContain('role="menu"')
    expect(html).toContain('johnmichaelmendoza1234@gmail.com')
    const cp = html.indexOf('Change Password')
    const so = html.indexOf('Sign Out')
    expect(cp).toBeGreaterThan(-1)
    expect(so).toBeGreaterThan(cp)
  })

  it('omits Change Password when no handler is given', () => {
    expect(render({ open: true, onChangePassword: undefined })).not.toContain('Change Password')
  })

  it.each(['/teacher/account', '/student/profile'])('offers profile and password links before Sign Out for %s', (profileTo) => {
    seed.open = true
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AccountMenu profile={PROFILE} profileTo={profileTo}>
          <span>school-123456</span>
        </AccountMenu>
      </MemoryRouter>,
    )
    expect(html).toContain(`href="${profileTo}"`)
    expect(html).toContain('school-123456')
    expect(html.match(/role="menuitem"/g)).toHaveLength(3)
    expect(html).toContain('>Profile</a>')
    expect(html).toContain(`href="${profileTo}#change-password"`)
    expect(html.indexOf('>Profile</a>')).toBeLessThan(html.indexOf('Change Password'))
    expect(html.indexOf('Change Password')).toBeLessThan(html.indexOf('Sign Out'))
  })
})

describe('wiring', () => {
  const menuSrc = readFileSync(fileURLToPath(new URL('../../components/AccountMenu.jsx', import.meta.url)), 'utf8')
  const pageSrc = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')

  it('signs out through SignOutButton, so the confirmation dialog is kept', () => {
    expect(menuSrc).toContain('<SignOutButton')
  })

  it('does not close the menu on clicks inside the (portalled) confirmation dialog', () => {
    expect(menuSrc).toContain(`closest?.('[role="dialog"]')`)
  })

  it('the admin header uses the menu instead of a standalone Sign Out button', () => {
    expect(pageSrc).toContain('<AccountMenu')
    expect(pageSrc).not.toContain('<SignOutButton')
    expect(pageSrc).not.toContain('Signed in as')
  })

  it('opens the Home tab at Change Password from the account menu', () => {
    expect(pageSrc).toContain('<AccountMenu profile={profile} onChangePassword={openChangePassword} />')
    expect(pageSrc).toContain("setTab('home')")
    expect(pageSrc).toContain("navigate('/admin#change-password')")
    expect(pageSrc).toContain("{tab === 'home' && <HomeTab />}")
    expect(pageSrc).not.toContain("key: 'password'")
  })

  it('the Subscription tab no longer holds the Change Password form', () => {
    const subSrc = readFileSync(fileURLToPath(new URL('./SubscriptionTab.jsx', import.meta.url)), 'utf8')
    expect(subSrc).not.toContain('ChangePassword')
    expect(subSrc).not.toContain('passwordRequest')
  })

  it('the title bar and sub navbar are pinned while the page scrolls', () => {
    expect(pageSrc).toMatch(/position: 'sticky', top: 0, zIndex: 30/)
    const stickyAt = pageSrc.indexOf("position: 'sticky'")
    expect(stickyAt).toBeLessThan(pageSrc.indexOf('<header'))
    expect(stickyAt).toBeLessThan(pageSrc.indexOf('<nav aria-label="Admin sections"'))
  })

  it('initials fall back sensibly', () => {
    expect(initialsOf({ first_name: 'ana', last_name: 'reyes' })).toBe('AR')
    expect(initialsOf({})).toBe('A')
  })
})
