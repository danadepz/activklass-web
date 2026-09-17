/**
 * T-62 (triplecookiemonster-81, amended by dawny808-89): the roster's actions
 * are View · Edit · Disable, and View opens the student read-only.
 *
 * Static markup, the house pattern. The page keeps the open modal in its own
 * first `useState(null)`, which a static render can never click open, so the
 * test seeds that one call: `state.openModal` is handed back to the FIRST
 * null-initialised useState of the render (ClassDetailPage's `modal`), and
 * every other call gets the real hook. The assertions below that the modal
 * rendered at all prove the seed landed.
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

function render(openModal = null) {
  state.openModal = openModal
  state.seeded = false
  return renderToStaticMarkup(<MemoryRouter><ClassDetailPage /></MemoryRouter>)
}

/* The <td> holding a row's action buttons: the last cell of the student's row. */
function rowActions(html) {
  const row = html.match(/<tr[^>]*>(?:(?!<\/tr>).)*S2026-1001(?:(?!<\/tr>).)*<\/tr>/s)?.[0] ?? ''
  const cells = row.match(/<td[^>]*>.*?<\/td>/gs) ?? []
  const last = cells[cells.length - 1] ?? ''
  return [...last.matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())
}

/* The modal panel: everything from its <h3> to the end of the markup. */
function modalOf(html, title) {
  const i = html.indexOf(`<h3 class="text-lg font-semibold text-slate-800">${title}</h3>`)
  return i < 0 ? null : html.slice(i)
}

beforeEach(() => {
  state.openModal = null
  state.seeded = false
})

describe('T-62 — the roster row', () => {
  it('reads View · Edit · Disable, in that order, and offers Remove nowhere on the page', () => {
    const html = render()
    expect(rowActions(html)).toEqual(['View', 'Edit', 'Disable'])
    expect(html).not.toMatch(/>\s*Remove(?: from class)?\s*</)
  })
})

describe('T-62 — View opens the student read-only', () => {
  // T-70 added a "Disable sign-in" link inside this same modal (both modes) —
  // the account-wide switch, moved off the row where the row's own
  // Disable/Enable is now class-scoped. Same modal, one more button.
  it('titles the modal "Student", disables every field, and offers Disable sign-in, Close and Edit', () => {
    const html = render({ student, mode: 'view' })
    const panel = modalOf(html, 'Student')
    expect(panel).not.toBeNull()
    const fields = panel.match(/<(input|select)\b[^>]*>/g) ?? []
    expect(fields.length).toBeGreaterThan(5)
    for (const f of fields) expect(f).toMatch(/\sdisabled=""/)
    const buttons = [...panel.matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map((m) => m[1].trim())
    expect(buttons).toEqual(['Disable sign-in', 'Close', 'Edit'])
    expect(panel).not.toMatch(/>\s*Save\s*</)
    expect(panel).not.toMatch(/Remove from class/)
  })

  it('Edit (the row action) still opens the live form with Save, Disable sign-in and no Remove from class', () => {
    const html = render({ student, mode: 'edit' })
    const panel = modalOf(html, 'Edit Student')
    expect(panel).not.toBeNull()
    const fields = panel.match(/<(input|select)\b[^>]*>/g) ?? []
    expect(fields.length).toBeGreaterThan(5)
    for (const f of fields) expect(f).not.toMatch(/\sdisabled=""/)
    const buttons = [...panel.matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map((m) => m[1].trim())
    expect(buttons).toEqual(['Disable sign-in', 'Cancel', 'Save'])
  })
})

/* T-70 (dawny808-89): Disable on the row is a CLASS state now -- the student
   stays on the roster, greyed, reading Disabled with Enable beside it. The
   student side of the same state is droppedClass.test.jsx. */
describe('T-70 — a student disabled on this class stays on the roster, greyed', () => {
  function rowOf(html) {
    return html.match(/<tr[^>]*>(?:(?!<\/tr>).)*S2026-1001(?:(?!<\/tr>).)*<\/tr>/s)?.[0] ?? ''
  }

  it("an active student's row is not greyed and offers Disable", () => {
    clazz.dropped_student_ids = []
    const row = rowOf(render())
    expect(row).not.toMatch(/opacity:\s*0\.55/)
    expect(rowActions(render())).toEqual(['View', 'Edit', 'Disable'])
  })

  it('a dropped student keeps their row, greyed, reading Disabled, with Enable in place of Disable', () => {
    clazz.dropped_student_ids = ['S1']
    try {
      const html = render()
      const row = rowOf(html)
      expect(row).toContain('Aquino')
      expect(row).toMatch(/<tr[^>]*style="opacity:\s*0\.55"/)
      expect(row).toMatch(/>\s*Disabled\s*</)
      expect(rowActions(html)).toEqual(['View', 'Edit', 'Enable'])
      expect(html).not.toMatch(/>\s*Remove(?: from class)?\s*</)
    } finally {
      delete clazz.dropped_student_ids
    }
  })
})
