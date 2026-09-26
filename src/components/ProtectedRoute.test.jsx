/**
 * T-82, Option C (2026-09-26): a superadmin approves an Institution request
 * before any money moves, and the approved admin lands on /pay-to-activate
 * instead of the real dashboard until they pay. This is the fourth gate,
 * built the same shape as the three that came before it (temp-password,
 * awaitingVerification, schoolSuspended): checked in both ProtectedRoute and
 * RoleHomeRedirect, opted out of by exactly the one screen it sends people
 * to, and never applied to a superadmin.
 *
 * Static markup, the house pattern (pendingVerificationContact.test.jsx is
 * the model) — Navigate is stubbed to a plain anchor so a redirect's target
 * is readable off the rendered markup instead of needing a real router to
 * actually navigate, and Outlet is stubbed to a marker so "did the gate let
 * this through" is a plain string match.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({ current: null }))
vi.mock('../context/useAuth', () => ({ useAuth: () => authState.current }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  Navigate: ({ to }) => <a href={to}>redirect</a>,
  Outlet: () => <div>OUTLET</div>,
}))

import ProtectedRoute, { RoleHomeRedirect } from './ProtectedRoute.jsx'

const BASE = {
  status: 'signed_in',
  profile: { role: 'admin', is_temp_password: false },
  school: null,
  errorDetail: null,
  isSuperAdmin: false,
}

function redirectTarget(html) {
  const m = html.match(/href="([^"]+)">redirect/)
  return m ? m[1] : null
}

function protectedRoute(overrides, authOverrides = {}) {
  authState.current = { ...BASE, ...authOverrides }
  return renderToStaticMarkup(<MemoryRouter><ProtectedRoute {...overrides} /></MemoryRouter>)
}

function roleHomeRedirect(authOverrides = {}) {
  authState.current = { ...BASE, ...authOverrides }
  return renderToStaticMarkup(<MemoryRouter><RoleHomeRedirect /></MemoryRouter>)
}

describe('ProtectedRoute — the approved_unpaid gate', () => {
  it('sends an admin whose school is approved_unpaid to /pay-to-activate instead of the page', () => {
    const html = protectedRoute({ roles: ['admin'] }, { school: { subscription_status: 'approved_unpaid' } })
    expect(redirectTarget(html)).toBe('/pay-to-activate')
    expect(html).not.toContain('OUTLET')
  })

  it('lets /pay-to-activate itself through via allowApprovedUnpaid, or the gate would loop', () => {
    const html = protectedRoute(
      { allowApprovedUnpaid: true },
      { school: { subscription_status: 'approved_unpaid' } },
    )
    expect(html).toContain('OUTLET')
  })

  it('never gates the superadmin', () => {
    const html = protectedRoute(
      { superAdmin: true },
      { school: { subscription_status: 'approved_unpaid' }, isSuperAdmin: true },
    )
    expect(html).toContain('OUTLET')
  })

  it('does not gate a school that is merely trial, active, or has no status yet', () => {
    for (const subscription_status of ['trial', 'active', undefined]) {
      const html = protectedRoute({ roles: ['admin'] }, { school: subscription_status ? { subscription_status } : null })
      expect(html).toContain('OUTLET')
    }
  })

  it('checks approved_unpaid before the roles check — an admin who fails role too is sent to /pay-to-activate, not /portal', () => {
    const html = protectedRoute({ roles: ['teacher'] }, { school: { subscription_status: 'approved_unpaid' } })
    expect(redirectTarget(html)).toBe('/pay-to-activate')
  })
})

describe('RoleHomeRedirect — the same gate, so "/" agrees with every other route', () => {
  it('sends an approved_unpaid admin to /pay-to-activate instead of /admin', () => {
    const html = roleHomeRedirect({ school: { subscription_status: 'approved_unpaid' } })
    expect(redirectTarget(html)).toBe('/pay-to-activate')
  })

  it('sends an ordinary admin home as before, once the school is not approved_unpaid', () => {
    const html = roleHomeRedirect({ school: null })
    expect(redirectTarget(html)).toBe('/admin')
  })

  it('never gates the superadmin, even one whose own school carries the status', () => {
    const html = roleHomeRedirect({ school: { subscription_status: 'approved_unpaid' }, isSuperAdmin: true })
    expect(redirectTarget(html)).toBe('/superadmin')
  })
})
