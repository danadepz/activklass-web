/**
 * T-113 (triplecookiemonster-141 item 7, Kristine's hand-drawn sketch):
 * Add User asks two ordered questions -- Bulk | Individual, then
 * Teacher | Student -- and nothing below either control renders until BOTH
 * are answered. Before this card, Bulk upload and Add a user were two
 * permanent sibling cards with their own independent role pickers; this
 * pins the new single section's gate.
 *
 * Static markup, the house pattern (rosterToolbar.test.jsx is the model for
 * seeding React state without a click: `react`'s `useState` is wrapped so
 * the first two calls initialised with `''` -- AddUserSection's own `mode`
 * and `role` -- return a seeded value instead of the real default. Nothing
 * else in the tree calls `useState('')` before those two, since the gated
 * children (CreateUserForm, BulkUpload) are not mounted at all until both
 * are set, so the interception is safe by construction, not by luck).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const seed = vi.hoisted(() => ({ mode: '', role: '', calls: 0 }))

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useState: (init) => {
      if (init === '') {
        seed.calls += 1
        if (seed.calls === 1) return real.useState(seed.mode)
        if (seed.calls === 2) return real.useState(seed.role)
      }
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

describe('Add User (T-113) -- nothing renders until both controls are set', () => {
  it('shows only the Bulk | Individual control when neither is picked', () => {
    const html = render()
    expect(html).toContain('Add User')
    expect(html).toMatch(/>bulk</i)
    expect(html).toMatch(/>individual</i)
    // The second control (Teacher | Student) must not even be on the page yet.
    expect(html).not.toMatch(/>teacher</i)
    expect(html).not.toMatch(/>student</i)
    // Neither form's own content is reachable.
    expect(html).not.toContain('First name')
    expect(html).not.toContain('Choose file')
    expect(html).toContain('Pick Bulk or Individual first')
  })

  it('shows the Teacher | Student control once a mode is picked, but still no form', () => {
    const html = render({ mode: 'individual' })
    expect(html).toMatch(/>teacher</i)
    expect(html).toMatch(/>student</i)
    expect(html).not.toContain('First name')
    expect(html).not.toContain('Choose file')
    expect(html).toContain('Pick a role and the rest appears')
  })

  it('renders the individual form once Individual + Teacher are both set', () => {
    const html = render({ mode: 'individual', role: 'teacher' })
    expect(html).toContain('First Name')
    expect(html).toContain('Employee Number')
    expect(html).not.toContain('Choose file')
  })

  it('renders the bulk uploader once Bulk + Student are both set', () => {
    const html = render({ mode: 'bulk', role: 'student' })
    expect(html).toContain('Choose file')
    expect(html).toContain('What a student row needs')
    expect(html).not.toContain('First name')
  })

  it('never offers an Admin option in either control', () => {
    const html = render({ mode: 'individual' })
    expect(html).not.toMatch(/>admin</i)
  })
})
