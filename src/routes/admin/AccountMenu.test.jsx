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
})

describe('wiring', () => {
  const menuSrc = readFileSync(fileURLToPath(new URL('./AccountMenu.jsx', import.meta.url)), 'utf8')
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

  it('Change Password opens Subscription AND asks it to jump to the form', () => {
    expect(pageSrc).toContain('onChangePassword={openChangePassword}')
    expect(pageSrc).toMatch(/function openChangePassword\(\) \{\s*setTab\('subscription'\)\s*setPasswordRequest\(\(n\) => n \+ 1\)/)
    expect(pageSrc).toContain('<SubscriptionTab passwordRequest={passwordRequest} />')
  })

  it('the Subscription tab scrolls to and focuses the Change Password form on each request', () => {
    const subSrc = readFileSync(fileURLToPath(new URL('./SubscriptionTab.jsx', import.meta.url)), 'utf8')
    expect(subSrc).toMatch(/<div ref=\{passwordRef\} id="change-password"[^>]*>\s*<ChangePassword \/>/)
    expect(subSrc).toContain("el.scrollIntoView({ behavior: 'smooth', block: 'start' })")
    expect(subSrc).toContain("el.querySelector('input')?.focus({ preventScroll: true })")
    expect(subSrc).toContain('[passwordRequest, loaded]')
    // The effect sits before the early returns, so hook order is stable.
    expect(subSrc.indexOf('[passwordRequest, loaded]')).toBeLessThan(subSrc.indexOf('if (resolving) return'))
  })

  it('initials fall back sensibly', () => {
    expect(initialsOf({ first_name: 'ana', last_name: 'reyes' })).toBe('AR')
    expect(initialsOf({})).toBe('A')
  })
})
