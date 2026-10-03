/**
 * T-121 (triplecookiemonster-152): `login_id ?? email` -- and, in the
 * roster table, a bare `{s.email}` -- used to surface the synthetic
 * `...@activklass.internal` address whenever a student had no login_id.
 * That address exists only so Firebase Auth can key a login-ID account; it
 * receives no mail, and a teacher reading it where contact details are
 * expected would reasonably try to write to it.
 *
 * `displayIdentifier` is the one place that now decides what shows instead
 * (the student's ID number or LRN, or nothing) at both the Add Student
 * find-result and the Bulk Upload preview. This locks that it never falls
 * back to an email, and that the roster table -- which dropped the email
 * line entirely -- renders no `.internal` address anywhere.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { displayIdentifier } from './index.jsx'

describe('T-121 — displayIdentifier never falls back to an email', () => {
  it('prefers the student number', () => {
    expect(displayIdentifier({ student_number: 'S2026-1001', lrn: '136428200011', email: 'b@activklass.internal' })).toBe('S2026-1001')
  })

  it('falls back to the LRN when there is no student number', () => {
    expect(displayIdentifier({ student_number: '', lrn: '136428200011', email: 'b@activklass.internal' })).toBe('136428200011')
  })

  it('returns nothing -- never the email -- when neither identifier is on file', () => {
    expect(displayIdentifier({ student_number: '', lrn: '', email: 'b@activklass.internal' })).toBe('')
  })
})

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
}))

import ClassDetailPage from './index.jsx'

describe('T-121 — the roster table renders no .internal address', () => {
  it('a student with a synthetic email shows no email line at all', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ClassDetailPage /></MemoryRouter>)
    expect(html).not.toMatch(/\.internal/)
    // The ID is still there -- in its own column, not duplicated under the name.
    expect(html).toMatch(/S2026-1001/)
  })
})
