/**
 * T-133 (maykel_64440-161):
 * Admin account screen: Title Case labels, and drop the helper paragraphs.
 *
 * Seven labels in Title Case:
 * - First Name
 * - Middle Name (Optional)
 * - Last Name
 * - Employee Number
 * - Personal Email
 * - Temporary Password
 * - Create Student / Create Teacher
 *
 * Two helper texts removed:
 * - "Temporary on purpose..."
 * - "recommended — a contact..."
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

function render({ mode = 'individual', role = 'student' } = {}) {
  seed.mode = mode
  seed.role = role
  seed.calls = 0
  return renderToStaticMarkup(
    <AddUserSection onCreated={() => {}} settings={SETTINGS} users={[]} />,
  )
}

describe('T-133 — Admin account screen: Title Case and helper paragraphs removed', () => {
  beforeEach(() => { seed.mode = ''; seed.role = ''; seed.calls = 0 })

  it('renders labels in Title Case for student form', () => {
    const html = render({ mode: 'individual', role: 'student' })
    expect(html).toContain('First Name')
    expect(html).toContain('Middle Name')
    expect(html).toContain('(Optional)')
    expect(html).toContain('Last Name')
    expect(html).toContain('Personal Email')
    expect(html).toContain('Temporary Password')
    expect(html).toContain('Create Student')
  })

  it('renders labels in Title Case for teacher form', () => {
    const html = render({ mode: 'individual', role: 'teacher' })
    expect(html).toContain('Employee Number')
    expect(html).toContain('Create Teacher')
  })

  it('removes both helper texts from the form fields', () => {
    const html = render({ mode: 'individual', role: 'student' })
    expect(html).not.toContain('Temporary on purpose')
    expect(html).not.toContain('recommended — a contact address')
    expect(html).not.toContain('Recorded here or nowhere')
  })
})
