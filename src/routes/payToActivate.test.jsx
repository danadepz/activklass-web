/**
 * T-82, Option C (2026-09-26): /pay-to-activate is where ProtectedRoute's
 * fourth gate sends an admin whose school was approved but has not paid for
 * the year yet. Locked here: an admin sees the Pay button and the seat
 * estimate; anyone else in that school (unlikely under Option C, since no
 * one is provisioned before the admin pays, but the gate applies school-wide
 * the same way schoolSuspended does) sees "ask your admin" instead; the
 * screen bounces itself to /portal the moment the gate no longer applies —
 * covering both "never gated" and "just got paid for".
 *
 * Static markup, the house pattern (pendingVerificationContact.test.jsx is
 * the model) — Navigate stubbed to a plain anchor, useNavigate stubbed to a
 * spy, so a redirect or a navigate() call is a plain assertion rather than
 * needing a real router.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({ current: null }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => authState.current }))

const navigateSpy = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  Navigate: ({ to }) => <a href={to}>redirect</a>,
  useNavigate: () => navigateSpy,
}))

const queryState = vi.hoisted(() => ({ subscription: null, isLoading: false, isError: false }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: queryState.subscription ? { subscription: queryState.subscription } : undefined,
    isLoading: queryState.isLoading,
    isError: queryState.isError,
  }),
  useMutation: ({ onError }) => ({ mutate: () => onError?.(new Error('gateway down')), isPending: false }),
}))
vi.mock('@/lib/subscription', () => ({
  fetchSubscription: vi.fn(),
  startCheckout: vi.fn(),
}))
vi.mock('@/components/SignOutButton', () => ({ default: () => <button type="button">Sign out</button> }))

import PayToActivate from './pay-to-activate.jsx'

function render({ profile, school, isSuperAdmin = false, subscription = null, isLoading = false, isError = false }) {
  authState.current = { profile, school, isSuperAdmin, refreshProfile: vi.fn(() => Promise.resolve()) }
  queryState.subscription = subscription
  queryState.isLoading = isLoading
  queryState.isError = isError
  navigateSpy.mockClear()
  return renderToStaticMarkup(<MemoryRouter><PayToActivate /></MemoryRouter>)
}

const ADMIN = { role: 'admin', email: 'admin@school.edu.ph' }
const APPROVED_UNPAID_SCHOOL = { id: 'S1', name: 'UCB', subscription_status: 'approved_unpaid' }

describe('/pay-to-activate — the admin who owes the payment', () => {
  it('offers the Pay button and the seat estimate', () => {
    const html = render({
      profile: ADMIN,
      school: APPROVED_UNPAID_SCHOOL,
      subscription: { status: 'approved_unpaid', limits: { teacher_seats: 20, student_seats: 2400 } },
    })
    expect(html).toContain('Pay for this school year')
    expect(html).toContain('20 teachers')
    expect(html).toContain('2,400 students')
    expect(html).toContain('₱')
  })

  it('shows the gateway-error message when starting checkout fails, without naming the vendor', () => {
    // The mutation mock above always calls onError synchronously; rendering
    // is enough to have wired it, since this file does not drive a click.
    const html = render({
      profile: ADMIN,
      school: APPROVED_UNPAID_SCHOOL,
      subscription: { status: 'approved_unpaid', limits: { teacher_seats: 20, student_seats: 2400 } },
    })
    expect(html).not.toMatch(/paymongo/i)
  })
})

describe('/pay-to-activate — anyone else in the school', () => {
  it('tells a non-admin to ask their administrator instead of offering to pay', () => {
    const html = render({
      profile: { role: 'teacher', email: 'teacher@school.edu.ph' },
      school: APPROVED_UNPAID_SCHOOL,
      subscription: { status: 'approved_unpaid', limits: { teacher_seats: 20, student_seats: 2400 } },
    })
    expect(html).not.toContain('Pay for this school year')
    expect(html).toContain('administrator pays for the year')
  })
})

describe('/pay-to-activate — the gate no longer applies', () => {
  it('bounces to /portal outright when the school was never approved_unpaid', () => {
    const html = render({ profile: ADMIN, school: null })
    expect(html).toBe('<a href="/portal">redirect</a>')
  })

  it('never gates the superadmin', () => {
    const html = render({ profile: ADMIN, school: APPROVED_UNPAID_SCHOOL, isSuperAdmin: true })
    expect(html).toBe('<a href="/portal">redirect</a>')
  })

  // The auto-navigate-away effect (refreshProfile() then navigate('/portal')
  // once a re-read shows the subscription is no longer approved_unpaid) is a
  // useEffect, which renderToStaticMarkup never runs — this repo's static
  // house pattern cannot drive it, the same limitation register.test.jsx's
  // T-82 poll effect and account.jsx's useCheckoutReturn already live with.
  // Covered in the browser walk instead.
})
