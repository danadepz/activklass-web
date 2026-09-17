/**
 * T-68 (dawny808-87): payment happens inside the website. The teacher-visible
 * half is one button on the Account page's plan card -- it must be there for
 * the people who owe money and nowhere else.
 *
 * The backend half (amount recomputed from stored seats, no flip until
 * PayMongo confirms, no double-apply) is locked by
 * activklass-backend/tests/smoke_payments.py.
 *
 * describeSubscription is deliberately NOT mocked: it is the helper the badge
 * and the dashboard box read too, so the button and they cannot drift apart.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ profile: null, subscription: null, noDoc: false }))

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: state.profile, school: null, refreshProfile: vi.fn() }) }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: ({ queryKey }) => {
    if (queryKey?.[0] === 'subscription-plans') return { data: { plans: { teacher: {}, institution: {} } }, isLoading: false, isError: false, error: null }
    if (queryKey?.[0] !== 'subscription') return { data: { invites: [] }, isLoading: false, isError: false, error: null }
    // No subscription document => the API answers 404 and this query ERRORS.
    // The page's error branch is where a self-registered teacher is offered the
    // button, so stubbing "no data and no error" is a state that cannot happen.
    if (state.noDoc) {
      // lib/api attaches the HTTP status; the page's 404 branch reads it.
      const err = Object.assign(new Error('No subscription for that owner'), { status: 404 })
      return { data: undefined, isLoading: false, isError: true, error: err }
    }
    return {
      data: {
        subscription: state.subscription,
        usage: { students: { used: 0, seats: 40, over: false }, teachers: { used: 1, seats: 1, over: false }, storage: { used: 0, bytes: 0 } },
        invites: [],
      },
      isLoading: false, isError: false, error: null,
    }
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn() }))
vi.mock('@/lib/institution', () => ({ acceptInvite: vi.fn(), declineInvite: vi.fn(), fetchMyInvites: vi.fn(), isAbsorbed: () => false }))
vi.mock('@/components/ChangePassword', () => ({ default: () => null }))
vi.mock('@/components/SignOutButton', () => ({ default: () => null }))
vi.mock('@/routes/teacher/SchoolColleagues', () => ({ default: () => null }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn() }))

import TeacherAccountPage from './account.jsx'

const PAY = 'Pay for this school year'
const DAY = 24 * 60 * 60 * 1000

function page({ profile = {}, subscription = null, noDoc = false } = {}) {
  state.noDoc = noDoc
  state.profile = { id: 'T1', role: 'teacher', first_name: 'Solo', last_name: 'Teacher', ...profile }
  state.subscription = subscription
  return renderToStaticMarkup(<MemoryRouter><TeacherAccountPage /></MemoryRouter>)
}

describe('T-68 — the Account page offers to pay, inside the website', () => {
  it('offers it to a teacher on a trial', () => {
    expect(page({ subscription: { type: 'teacher', status: 'trial', trial_ends_at: Date.now() + 20 * DAY } })).toContain(PAY)
  })

  it('offers it to a teacher whose trial has expired', () => {
    expect(page({ subscription: { type: 'teacher', status: 'expired', trial_ends_at: Date.now() - DAY } })).toContain(PAY)
  })

  it('offers it on the self-registered path, where no subscription document exists yet', () => {
    expect(page({ profile: { subscription_status: 'trial', trial_ends_at: Date.now() + 5 * DAY }, noDoc: true })).toContain(PAY)
  })

  it('never offers it to a teacher already paid up', () => {
    expect(page({ subscription: { type: 'teacher', status: 'active', paid_through: Date.now() + 300 * DAY } })).not.toContain(PAY)
  })

  it("never offers it on a school's plan — the admin pays for those seats", () => {
    expect(page({ profile: { school_id: 'S1' }, subscription: { type: 'institution', status: 'trial' } })).not.toContain(PAY)
    expect(page({ subscription: { type: 'institution', status: 'expired' } })).not.toContain(PAY)
  })
})
