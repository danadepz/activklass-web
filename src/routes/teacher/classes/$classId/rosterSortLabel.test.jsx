/**
 * T-134 (triplecookiemonster-176, -177): the roster's sort control had no
 * visible label at all, and its A→Z option just said "A → Z". Renamed to
 * "Sort by:" and "Alphabetical" -- label and option text only, `rosterSort`'s
 * values (az/za) and behaviour are untouched.
 *
 * Static markup, the house pattern (fixture borrowed from rosterView.test.jsx).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const student = {
  id: 'S1', student_id: 'S1', first_name: 'Beatriz', last_name: 'Aquino', email: 'b@activklass.internal',
  student_number: 'S2026-1001', course: '', year_level: 'Grade 9', remarks: '', enrollment_status: 'AC',
  status: 'active', lrn: '136428200011', birthdate: '2011-02-11',
}
const clazz = { id: 'C1', teacher_id: 'T1', student_ids: ['S1'], grade_level: 'Grade 9', max_students: 40, subject: 'Science 9', section: 'Newton' }

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' }, school: null }) }))
vi.mock('@/lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('@/lib/api', () => ({ api: {} }))
vi.mock('@/lib/admin', () => ({ setAccountDisabled: vi.fn() }))
vi.mock('@/lib/classes', () => ({ deleteClassSection: vi.fn() }))
vi.mock('@/lib/guardianCodes', () => ({ listMyGuardians: vi.fn(), revokeGuardianLink: vi.fn() }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: ({ queryKey }) => queryKey?.[0] === 'fs-guardians'
    ? { data: [], isLoading: false, isError: false }
    : { data: { clazz, students: [student], summary: { total: 1 } }, isLoading: false, isError: false },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ classId: 'C1' }),
  useNavigate: () => vi.fn(),
}))

import ClassDetailPage from './index.jsx'

function render() {
  return renderToStaticMarkup(<MemoryRouter><ClassDetailPage /></MemoryRouter>)
}

describe('T-134 — roster sort control: a visible label, and a clearer option', () => {
  it('the sort control now reads "Sort by:"', () => {
    const html = render()
    expect(html).toContain('Sort by:')
  })

  it('its A→Z option now reads "Alphabetical"; Z→A and the values are untouched', () => {
    const html = render()
    expect(html).toMatch(/<option value="az"[^>]*>Alphabetical<\/option>/)
    expect(html).toMatch(/<option value="za"[^>]*>Z → A<\/option>/)
    expect(html).not.toMatch(/<option value="az"[^>]*>A → Z<\/option>/)
  })

  it('the All students filter select is unchanged -- 176/177 are label-only, scoped to the sort control', () => {
    const html = render()
    expect(html).toMatch(/<option value="all"[^>]*>All students<\/option>/)
  })
})
