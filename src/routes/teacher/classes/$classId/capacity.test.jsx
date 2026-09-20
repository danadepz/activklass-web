/**
 * The Capacity card reads as over, not as ordinary text, once a class's
 * roster already exceeds its own cap (T-92, triplecookiemonster-120).
 *
 * Kristine's screenshot was the end state -- "Capacity 61 / 40 students
 * enrolled" in the same neutral grey every normal class gets. The two add
 * paths already refuse to create this state; this pins the other half of
 * the fix -- that a class already in it stops being silent about it.
 *
 * Static markup against the real page, same mocking shape as
 * rosterView.test.jsx (that file owns the roster-row behaviour; this one is
 * the stat card only).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const student = (n) => ({
  id: `S${n}`, student_id: `S${n}`, first_name: `Student${n}`, last_name: 'Test',
  email: `s${n}@activklass.internal`, student_number: `S2026-${1000 + n}`, course: '',
  year_level: 'Grade 10', remarks: '', enrollment_status: 'AC', status: 'active',
  lrn: '', birthdate: '2010-01-01',
})

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' }, school: null }) }))
vi.mock('@/lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('@/lib/api', () => ({ api: {} }))
vi.mock('@/lib/admin', () => ({ setAccountDisabled: vi.fn() }))
vi.mock('@/lib/classes', () => ({ deleteClassSection: vi.fn() }))
vi.mock('@/lib/guardianCodes', () => ({ listMyGuardians: vi.fn(), revokeGuardianLink: vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ classId: 'C1' }),
  useNavigate: () => vi.fn(),
}))

let bundle
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: ({ queryKey }) => queryKey?.[0] === 'fs-guardians'
    ? { data: [], isLoading: false, isError: false }
    : { data: bundle, isLoading: false, isError: false },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import ClassDetailPage from './index.jsx'

function render() {
  return renderToStaticMarkup(<MemoryRouter><ClassDetailPage /></MemoryRouter>)
}

/* The Capacity MetricCard's own opening <div> (its tint, rgba(63,169,245,…),
   is unique among the four stat cards) through the next label, "Roster". */
function capacityCard(html) {
  const open = html.match(/<div class="transition-all duration-150 hover:shadow-md hover:-translate-y-0\.5" style="background:rgba\(63,169,245,0\.13\)[^>]*>/)
  if (!open) return null
  const i = open.index
  const j = html.indexOf('>Roster', i)
  return html.slice(i, j < 0 ? undefined : j)
}

describe('T-92 — the Capacity card names an over-capacity class as over', () => {
  it('reads as ordinary when the roster is at or under the cap', () => {
    const clazz = { id: 'C1', teacher_id: 'T1', student_ids: ['S1', 'S2'], max_students: 40, subject: 'Math', section: 'A' }
    bundle = { clazz, students: [student(1), student(2)], summary: { total: 2 } }
    const card = capacityCard(render())
    expect(card).toContain('students enrolled')
    expect(card).not.toMatch(/rgba\(245,197,24,0\.55\)/)
  })

  it('reads as over once the roster exceeds the cap, with a red value and a note', () => {
    const ids = Array.from({ length: 3 }, (_, i) => `S${i + 1}`)
    const clazz = { id: 'C1', teacher_id: 'T1', student_ids: ids, max_students: 2, subject: 'Math', section: 'A' }
    bundle = { clazz, students: ids.map((_, i) => student(i + 1)), summary: { total: 3 } }
    const card = capacityCard(render())
    expect(card).toContain('over its maximum')
    expect(card).toContain('3')
    // valueColor -> red, and highlight -> the amber ring Card.jsx uses for a flagged tile.
    expect(card).toMatch(/color:#[0-9a-fA-F]{6}/)
    expect(card).toMatch(/rgba\(245,197,24,0\.55\)/)
  })

  it('does not flag a class with no cap set (max_students 0)', () => {
    const clazz = { id: 'C1', teacher_id: 'T1', student_ids: ['S1'], max_students: 0, subject: 'Math', section: 'A' }
    bundle = { clazz, students: [student(1)], summary: { total: 1 } }
    const card = capacityCard(render())
    expect(card).toContain('students enrolled')
    expect(card).not.toContain('over its maximum')
  })
})
