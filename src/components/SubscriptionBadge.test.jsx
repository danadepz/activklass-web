/**
 * Render tests for the dashboard subscription box, hooks hard-coded, static
 * markup only (the house pattern -- see AnalyticsBand.test.jsx). Pins what the
 * box says on each plan shape; the chip beside it is covered in
 * routes/teacher/StudentAccounts.test.jsx.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  sub: { kind: 'trial', label: 'Free trial', detail: '12 days left', isLoading: false },
  school: null,
}))

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { role: 'teacher' }, school: state.school }) }))
vi.mock('@/hooks/useMySubscription', () => ({ useMySubscription: () => state.sub }))

import { SubscriptionBox } from './SubscriptionBadge.jsx'

const NO_CARD = 'No card needed for the trial. We&#x27;ll ask for payment details before it ends.'

const show = (sub, school = null) => {
  state.sub = { isLoading: false, ...sub }
  state.school = school
  return renderToStaticMarkup(<MemoryRouter><SubscriptionBox /></MemoryRouter>)
}

describe('SubscriptionBox', () => {
  // T-54: the trial never asked for a card, and a tester wanted to know why.
  // The box says so and says when one will be asked -- no date, the provider
  // is still undecided.
  it('a running trial says no card is needed and that payment is asked before it ends', () => {
    const html = show({ kind: 'trial', label: 'Free trial', detail: '12 days left' })
    expect(html).toContain('Free trial')
    expect(html).toContain('12 days left')
    expect(html).toContain(NO_CARD)
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('an ended trial, a paid plan and a school plan do not carry the trial line', () => {
    expect(show({ kind: 'expired', label: 'Trial ended', detail: 'Subscribe to keep the full features' })).not.toContain('No card needed')
    expect(show({ kind: 'active', label: 'Subscribed', detail: 'Plus plan' })).not.toContain('No card needed')
    expect(show({ kind: 'school', label: 'School plan', detail: 'Covered by your school' }, { name: 'Tabor Hill College' })).not.toContain('No card needed')
  })
})
