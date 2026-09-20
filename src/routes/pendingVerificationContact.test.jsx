/**
 * T-78 (maykel_64440-98): the "Verifying your account" screen named nobody to
 * ask.
 *
 * maykel registered on the Individual path, landed on the hold screen and
 * asked "Who verifies this ate?" — in the group chat and then on a ticket, so
 * there would be a record. The screen already said a member of the team checks
 * every self-registered teacher; what it never said was how to reach them.
 *
 * What is locked here is the tester's question being answerable from the
 * screen: a waiting teacher is shown a contact, and it is a real mailto link
 * rather than an address printed as prose. The address itself is deliberately
 * read out of the component rather than hard-coded into the assertion — this
 * test pins that a contact is offered and reachable, not which inbox the owner
 * chose, so changing the address later does not fail it.
 *
 * The rejected branch is pinned too, in the opposite direction: today it shows
 * the resubmit form and NO contact line. That is recorded as the current truth
 * so that a future change there is a deliberate one, not a silent drift.
 *
 * Static markup, the house pattern — no DOM library. Every state comes from the
 * stubbed profile, which is the component's only input (it reads `profile` and
 * `refreshProfile` from useAuth and nothing else).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({ current: { profile: null, refreshProfile: vi.fn() } }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => authState.current }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn(),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  Navigate: ({ to }) => <a href={to}>redirect</a>,
}))
vi.mock('@/components/SignOutButton', () => ({ default: () => <button type="button">Sign out</button> }))

import PendingVerification from './pending-verification.jsx'

const render = (profile) => {
  authState.current = { profile, refreshProfile: vi.fn() }
  return renderToStaticMarkup(<MemoryRouter><PendingVerification /></MemoryRouter>)
}

const waiting = {
  email: 'maykelmendoza22@gmail.com',
  verification_status: 'pending',
  verification_id_type: 'prc',
  verification_id_number: '1234567',
  verification_id_link: 'https://drive.google.com/x',
}

/* The mailto the screen actually offers, read off the rendered markup. */
function contactLink(html) {
  const m = html.match(/href="mailto:([^"]+)"/)
  return m ? m[1] : null
}

describe('T-78 — a teacher waiting on verification is told how to reach the team', () => {
  it('offers a contact, as a mailto link, not just prose', () => {
    const html = render(waiting)
    expect(html).toContain('Your ID is with the team.')

    const address = contactLink(html)
    expect(address).not.toBeNull()          // a way to reach anyone at all
    expect(address).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)   // a usable address
    // and it is offered as a question a waiting person would recognise
    expect(html).toMatch(/Questions\?[\s\S]{0,80}ActivKlass team/)
  })

  it('shows the same address in the link text, so it survives a copy-paste', () => {
    const html = render(waiting)
    const address = contactLink(html)
    expect(html).toContain(`>${address}</a>`)
  })

  it('names no vendor and no exception text on the waiting screen', () => {
    const html = render(waiting)
    for (const word of ['Firebase', 'Firestore', 'Flask', 'Vite', 'auth/', 'undefined']) {
      expect(html).not.toContain(word)
    }
  })

  /* Current truth, recorded deliberately: the rejected branch swaps the card
     for the resubmit form and offers no contact. If someone adds one there,
     this should be updated on purpose — see the note on the issue. */
  it('rejected shows the resubmit form, and today offers no contact line', () => {
    const html = render({ ...waiting, verification_status: 'rejected' })
    expect(html).toContain('Send again')
    expect(contactLink(html)).toBeNull()
  })

  it('an approved or non-self-registered account never sees this screen', () => {
    expect(render({ ...waiting, verification_status: 'approved' })).toContain('href="/portal"')
    expect(render({ email: 'x@y.z' })).toContain('href="/portal"')
  })
})
