/**
 * Add User is one row of controls: Teacher | Student (Teacher by default) and a
 * Bulk on/off toggle after them. Off shows the manual form, on shows the bulk
 * uploader for the picked role; the row itself never changes. There is no
 * Individual button.
 *
 * Static markup, the house pattern (rosterToolbar.test.jsx is the model for
 * seeding React state without a click: `react`'s `useState` is wrapped so
 * AddUserSection's own two states -- bulk (false) and role ('teacher') -- take
 * a seeded value once per render, tracked with a bitmask in `seed.calls`).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const seed = vi.hoisted(() => ({ mode: '', role: '', calls: 0 }))

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useState: (init) => {
      // AddUserSection's own two states: bulk (false) then role ('teacher').
        // seed.calls is a bitmask so each is taken once per render.
        if (init === false && !(seed.calls & 1)) { seed.calls |= 1; return real.useState(seed.mode === 'bulk') }
        if (init === 'teacher' && !(seed.calls & 2)) { seed.calls |= 2; return real.useState(seed.role || 'teacher') }
      return real.useState(init)
    },
  }
})

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/admin', () => ({
  createUser: vi.fn(), bulkCreateUsers: vi.fn(),
  adminSchoolKey: ['fs-admin-school'], fetchSchoolSettings: vi.fn(), saveSchoolSettings: vi.fn(),
}))
vi.mock('@/lib/roster', () => ({ parseCsv: vi.fn() }))
vi.mock('@/lib/xlsx', () => ({ downloadXlsx: vi.fn(), readXlsxRows: vi.fn() }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true), promptDialog: vi.fn() }))

import { AddUserSection } from './UsersTab.jsx'

const SETTINGS = { school: { name: 'Tabor Hill College', login_prefix: 'thc' } }

function render({ mode = '', role = '' } = {}) {
  seed.mode = mode
  seed.role = role
  seed.calls = 0
  return renderToStaticMarkup(
    <AddUserSection onCreated={() => {}} settings={SETTINGS} users={[]} />,
  )
}

beforeEach(() => { seed.mode = ''; seed.role = ''; seed.calls = 0 })

describe('Add User -- one row: Teacher | Student, then a Bulk toggle', () => {
  it('opens on Teacher with the manual form, and no Individual button', () => {
    const html = render()
    expect(html).toContain('Add User')
    expect(html).toMatch(/>teacher</i)
    expect(html).toMatch(/>student</i)
    expect(html).toMatch(/>Bulk</)
    expect(html).not.toMatch(/>individual</i)
    // The manual Teacher form is already on screen.
    expect(html).toContain('First Name')
    expect(html).toContain('Employee Number')
    expect(html).not.toMatch(/Choose [Ff]ile/)
    // No hint line that appears and disappears under the controls.
    expect(html).not.toContain('Pick a role and the rest appears')
    expect(html).not.toContain('Pick Bulk or Individual first')
  })

  it('Bulk is an on/off toggle that reads as off by default', () => {
    expect(render()).toMatch(/aria-pressed="false"[^>]*>Bulk</)
    expect(render({ mode: 'bulk' })).toMatch(/aria-pressed="true"[^>]*>Bulk</)
  })

  it('the controls are the same row in both states', () => {
    const rowOf = (html) => html.slice(html.indexOf('role="radiogroup"'), html.indexOf('>Bulk<') + 6)
    expect(rowOf(render({ mode: 'bulk' }))).toContain('>teacher<')
    expect(rowOf(render())).toContain('>teacher<')
  })

  it('renders the manual form for Teacher', () => {
    const html = render({ mode: 'individual', role: 'teacher' })
    expect(html).toContain('First Name')
    expect(html).toContain('Employee Number')
    expect(html).not.toMatch(/Choose [Ff]ile/)
  })

  it('renders the bulk uploader when Bulk is on for Student', () => {
    const html = render({ mode: 'bulk', role: 'student' })
    expect(html).toMatch(/Choose [Ff]ile/)
    expect(html).toContain('What a student row needs')
    expect(html).not.toContain('First name')
  })

  it('never offers an Admin option in either control', () => {
    const html = render({ mode: 'individual' })
    expect(html).not.toMatch(/>admin</i)
  })
})
