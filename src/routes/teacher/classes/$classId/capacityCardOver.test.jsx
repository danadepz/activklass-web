/**
 * T-92 (verification lock) — the Capacity card says a class is over its own
 * maximum, in colour, instead of printing the contradiction in ordinary grey.
 *
 * Kristine's screenshot (triplecookiemonster-120) was "Capacity 61 / 40
 * students enrolled" styled exactly like every healthy class. This pins the
 * three things that make that visible: the roster number is painted in the
 * theme's red rather than the default ink, the tile gets the flagged ring,
 * and the sub-line stops claiming the count is just "students enrolled".
 *
 * Static markup against the real page, hooks stubbed with vi.mock -- the
 * house pattern; there is no DOM library in this repo, so the over/under
 * state is varied through the stubbed query result, not by clicking.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ink, red } from '@/theme'

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

/* The Capacity tile alone: its blue tint is unique among the four stat
   cards, and "Roster" is the next heading after the row. */
function capacityCard(html) {
  const open = html.match(/<div class="transition-all[^"]*" style="background:rgba\(63,169,245,0\.13\)[^>]*>/)
  if (!open) throw new Error('Capacity card not found in the rendered page')
  const j = html.indexOf('>Roster', open.index)
  return html.slice(open.index, j < 0 ? undefined : j)
}

function show(roster, max) {
  const ids = Array.from({ length: roster }, (_, i) => `S${i + 1}`)
  bundle = {
    clazz: { id: 'C1', teacher_id: 'T1', student_ids: ids, max_students: max, subject: 'Mathematics 101', subject_code: 'MATH101', section: '1A' },
    students: ids.map((_, i) => student(i + 1)),
    summary: { total: roster },
  }
  return capacityCard(renderToStaticMarkup(<MemoryRouter><ClassDetailPage /></MemoryRouter>))
}

describe('T-92 — the Capacity card flags a class that is over its maximum', () => {
  it("paints Kristine's 61 / 40 red and says it is over", () => {
    const card = show(61, 40)
    expect(card).toContain('61')
    expect(card).toContain('/ 40')
    expect(card).toContain('over its maximum')
    // the roster number itself, not merely some coloured pixel on the tile
    expect(card).toContain(`color:${red}`)
    expect(card).not.toContain(`color:${ink}`)
    expect(card).not.toContain('students enrolled')
  })

  it('leaves a class at or under its maximum in the ordinary style', () => {
    for (const [roster, max] of [[39, 40], [40, 40]]) {
      const card = show(roster, max)
      expect(card, `${roster}/${max}`).toContain('students enrolled')
      expect(card, `${roster}/${max}`).not.toContain('over its maximum')
      expect(card, `${roster}/${max}`).not.toContain(`color:${red}`)
      expect(card, `${roster}/${max}`).toContain(`color:${ink}`)
    }
  })

  it('flags a class that is over by exactly one', () => {
    const card = show(41, 40)
    expect(card).toContain('over its maximum')
    expect(card).toContain(`color:${red}`)
  })

  it('does not flag a class with no capacity set at all', () => {
    const card = show(3, 0)
    expect(card).toContain('students enrolled')
    expect(card).not.toContain('over its maximum')
    expect(card).not.toContain(`color:${red}`)
  })
})
