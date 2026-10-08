/**
 * T-140 (triplecookiemonster-195): Kristine's screenshot was the Attendance
 * tab (her ticket text said "Class Record", but the attachment is this
 * screen -- going by the screenshot per the card). "Remove outright for
 * consistency with other tabs, goods ra siya without it." Unlike T-191's
 * auto-post line on Class Record, nothing here is a live status readout --
 * both the day-view and term-view sentences are static copy, so both go, no
 * tooltip.
 *
 * Static markup, the house pattern. useQuery is stubbed straight to its
 * loading state so the page never needs real sheet/contest data to prove
 * what's in the static header markup.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
  query: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), where: vi.fn(),
}))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ notifyStudents: vi.fn() }))
vi.mock('@/lib/attendanceMirror', () => ({ syncAttendanceSummaries: vi.fn() }))
vi.mock('@/lib/schedule', () => ({ scheduleMeetings: vi.fn(() => []) }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  // Always "still loading" -- the header markup this test checks does not
  // depend on sheet or contest data.
  useQuery: () => ({ data: undefined, isLoading: true, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ classId: 'C1' }),
}))

import AttendancePage from './attendance.jsx'

function render() {
  return renderToStaticMarkup(<MemoryRouter><AttendancePage /></MemoryRouter>)
}

describe('T-140 — the Attendance subheader is gone, in both view states', () => {
  it('day view: no explanatory paragraph under the heading', () => {
    const html = render()
    expect(html).toContain('Attendance')
    expect(html).not.toContain('Track and record daily student attendance for the selected date.')
  })

  it('the term-view sentence is gone too -- static copy, not a status line', () => {
    const html = render()
    expect(html).not.toContain('Every day this class met, on one sheet. Marking is done on the By day tab.')
  })
})
