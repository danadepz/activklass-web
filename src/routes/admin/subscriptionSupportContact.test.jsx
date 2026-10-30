/**
 * T-172 (andecobs-248): the Subscription screen names support but gives no
 * way to reach it.
 *
 * Derick tried to change his school's plan from the Admin > Subscription
 * screen and was refused -- `POST /api/subscription/{owner}/plan` is
 * superadmin-only (`app/api/subscriptions.py`, "Self-service plan changes
 * belong behind billing") -- and the refusal surfaced verbatim as
 * "Plan changes are handled by ActivKlass support" with no address, link or
 * form anywhere on the card. The owner decided 2026-10-12 that self-service
 * upgrade/downgrade and an in-app request form are both out of scope; what
 * ships is the one sentence naming how to reach that support.
 *
 * The address is not invented: `activklassteam.2026@gmail.com` is the same inbox
 * already named on the "Verifying your account" hold screen
 * (`pending-verification.jsx`, T-78) as "the ActivKlass team" -- a real,
 * monitored route that already exists in this product, reused rather than
 * guessed.
 *
 * `PlanChangeNotice` is exported directly off `SubscriptionTab.jsx` so this
 * locks the actual markup the card renders, not a parallel re-implementation
 * of it. No DOM library in this repo -- static markup is the house pattern.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlanChangeNotice, SUPPORT_EMAIL, isSupportOnlyError } from './SubscriptionTab.jsx'

const REFUSAL = 'Plan changes are handled by ActivKlass support'

describe('T-172 — the plan-change refusal names a way to reach support', () => {
  it('is the real, already-used ActivKlass contact, not an invented mailbox', () => {
    expect(SUPPORT_EMAIL).toBe('activklassteam.2026@gmail.com')
  })

  it('recognises the backend\'s exact refusal sentence', () => {
    expect(isSupportOnlyError(REFUSAL)).toBe(true)
    expect(isSupportOnlyError(REFUSAL.toUpperCase())).toBe(true)
  })

  it('does not treat an unrelated error as a support dead end', () => {
    expect(isSupportOnlyError('Could not load the subscription.')).toBe(false)
    expect(isSupportOnlyError('')).toBe(false)
    expect(isSupportOnlyError(null)).toBe(false)
  })

  it('renders the refusal with a real mailto route to support', () => {
    const html = renderToStaticMarkup(<PlanChangeNotice error={REFUSAL} />)
    expect(html).toContain(REFUSAL)
    expect(html).toContain(`href="mailto:${SUPPORT_EMAIL}"`)
    // copy-paste survives: the visible text matches the link target
    expect(html).toContain(`>${SUPPORT_EMAIL}</a>`)
  })

  it('leaves an unrelated error exactly as it was -- no contact bolted onto it', () => {
    const html = renderToStaticMarkup(<PlanChangeNotice error="Could not load the subscription." />)
    expect(html).toContain('Could not load the subscription.')
    expect(html).not.toContain('mailto:')
  })

  it('renders nothing when there is no error', () => {
    expect(renderToStaticMarkup(<PlanChangeNotice error="" />)).toBe('')
  })
})
