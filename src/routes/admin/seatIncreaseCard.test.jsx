/**
 * Self-service seat increase (institution admin). `SeatIncreaseCard` lets an
 * admin add teacher/student seats mid-year, but only once there is an
 * active institution subscription to add them to -- a seat top-up before
 * the first payment is the first checkout, not this screen, and a solo
 * teacher's equivalent control lives on `teacher/account.jsx` instead
 * (locked by `accountPayButton.test.jsx`).
 *
 * House pattern: renderToStaticMarkup with the data hooks stubbed, same as
 * `subscriptionCardIdentity.test.jsx` beside this file -- no DOM library in
 * this repo.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const ADD_SEATS = 'Add Seats'
const OWNER_ID = 'school-1'

const state = vi.hoisted(() => ({ subscription: null }))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: ({ queryKey }) => {
    const key = queryKey?.[0]
    if (key === 'subscription-plans') {
      return {
        data: { plans: { teacher: {}, institution: {} } },
        isLoading: false, isError: false, error: null,
      }
    }
    if (key === 'subscription-owner') {
      return { data: { owner_id: OWNER_ID }, isLoading: false, isError: false, error: null }
    }
    if (key === 'subscription') {
      return {
        data: {
          subscription: state.subscription,
          usage: {
            students: { used: 0, seats: state.subscription?.limits?.student_seats, over: false },
            teachers: { used: 0, seats: state.subscription?.limits?.teacher_seats, over: false },
            storage: { used: 0, bytes: 0 },
          },
        },
        isLoading: false, isError: false, error: null,
      }
    }
    // admin-storage, institution-invites …
    return { data: { invites: [], members: [], bytes: 0, files: 0 }, isLoading: false, isError: false, error: null }
  },
  useMutation: () => ({ mutate: () => {}, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}))
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'A1', role: 'admin', school_id: OWNER_ID }, school: { name: 'Delta Elementary' } }),
}))
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({ doc: () => {}, serverTimestamp: () => {}, updateDoc: () => {} }))
vi.mock('@/lib/institution', () => ({
  fetchSchoolInvites: () => Promise.resolve({ invites: [] }),
  inviteTeacher: () => {}, releaseMember: () => {}, revokeInvite: () => {},
}))
vi.mock('@/components/ChangePassword', () => ({ default: () => null }))

import SubscriptionTab from './SubscriptionTab.jsx'

function render(subscription) {
  state.subscription = subscription
  return renderToStaticMarkup(<MemoryRouter><SubscriptionTab /></MemoryRouter>)
}

describe('self-service seat increase — "Add Seats" shows only for an already-active institution plan', () => {
  it('offers it once the institution is active', () => {
    const html = render({ type: 'institution', status: 'active', plan: 'standard', name: 'Delta Elementary',
      limits: { teacher_seats: 5, student_seats: 300, storage_gb: 5 } })
    expect(html).toContain(ADD_SEATS)
  })

  it('never offers it while the institution is still on trial — nothing paid yet to add seats to', () => {
    const html = render({ type: 'institution', status: 'trial', plan: 'standard', name: 'Delta Elementary',
      limits: { teacher_seats: 5, student_seats: 300, storage_gb: 5 } })
    expect(html).not.toContain(ADD_SEATS)
  })

  it('never offers it on a lapsed institution', () => {
    const html = render({ type: 'institution', status: 'expired', plan: 'standard', name: 'Delta Elementary',
      limits: { teacher_seats: 5, student_seats: 300, storage_gb: 5 } })
    expect(html).not.toContain(ADD_SEATS)
  })

  it("never offers it on a solo teacher's own card — this screen is the admin console", () => {
    const html = render({ type: 'teacher', status: 'active', plan: 'standard',
      limits: { teacher_seats: 1, student_seats: 40, storage_gb: 1 } })
    expect(html).not.toContain(ADD_SEATS)
  })
})
