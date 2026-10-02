/**
 * T-119 (triplecookiemonster-148, -149, -150): a red "Delete" used to sit in
 * the Roster toolbar next to Add Student and Bulk Upload, and deleted the
 * whole class. Delete Class now lives beside Edit Class on the class card
 * (_layout.jsx, not this page), and Bulk Upload is reachable only from
 * inside the Add Student modal's Bulk | Individual control.
 *
 * Static markup, the house pattern (see rosterView.test.jsx for the seeding
 * trick this file reuses to open the Add Student modal without a click).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ openModal: null, seeded: false }))

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useState: (init) => {
      if (init === null && state.openModal && !state.seeded) {
        state.seeded = true
        return real.useState(state.openModal)
      }
      return real.useState(init)
    },
  }
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

function render(openModal = null) {
  state.openModal = openModal
  state.seeded = false
  return renderToStaticMarkup(<MemoryRouter><ClassDetailPage /></MemoryRouter>)
}

/* The roster header: everything from the "Roster ·" heading to the search
   input, which is where the toolbar buttons sit. */
function rosterToolbar(html) {
  const start = html.indexOf('Roster <span')
  const end = html.indexOf('Search by name')
  return start < 0 || end < 0 ? '' : html.slice(start, end)
}

beforeEach(() => {
  state.openModal = null
  state.seeded = false
})

describe('T-119 — the Roster toolbar carries no class-level destructive action', () => {
  it('offers Add Student only, with no Delete and no Bulk Upload button', () => {
    const html = render()
    const toolbar = rosterToolbar(html)
    expect(toolbar).not.toBe('')
    expect(toolbar).toMatch(/>\s*Add Student\s*</)
    expect(toolbar).not.toMatch(/>\s*Delete(?:\s+class)?\s*</i)
    expect(toolbar).not.toMatch(/Bulk Upload/)
  })

  it('never renders a class-delete control anywhere on this page', () => {
    // index.jsx no longer owns deleteClassSection at all — Delete Class moved
    // to _layout.jsx, beside Edit Class, which this page does not render.
    const html = render()
    expect(html).not.toMatch(/Delete Class/)
    expect(html).not.toMatch(/>\s*Delete\s*</)
  })
})

describe('T-119 — Add Student offers Bulk | Individual, with bulk upload reachable from inside it', () => {
  it('opens on Individual, with both options in the segmented control', () => {
    const html = render('add')
    const i = html.indexOf('Add Student</h3>')
    expect(i).toBeGreaterThan(-1)
    const panel = html.slice(i)
    expect(panel).toMatch(/>\s*Bulk\s*</)
    expect(panel).toMatch(/>\s*Individual\s*</)
    expect(panel).toMatch(/Find Registered Student/)
    expect(panel).not.toMatch(/Create New Manually/)
  })
})
