/**
 * T-233 (andecobs-318) — "Issued Password" is the wrong word and wraps onto two lines.
 *
 * In the Users list Status column:
 * 1. The label changes from "Issued Password" to "Default Password".
 * 2. It sits on the same line beside "Active" in an inline flex layout
 *    (replacing the old <div style={{ marginTop: 6 }}> block container that forced it
 *    under "Active" and made the table rows taller).
 * 3. It renders with a slightly smaller font size (fontSize: 10 vs 11) and whiteSpace: nowrap
 *    so it never wraps onto two lines inside the pill or column.
 * 4. When is_temp_password is false / absent, the default password chip does not render.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const USERS = [
  {
    id: 'u1', first_name: 'Amara', last_name: 'Belrose', role: 'student', status: 'active',
    login_id: 'srnhs-300029', email: 'srnhs-300029@activklass.internal',
    student_number: '2026300029', is_temp_password: true,
  },
  {
    id: 'u2', first_name: 'Ignatius', last_name: 'Blackwood', role: 'teacher', status: 'active',
    login_id: 'srnhs-950007', email: 'srnhs-950007@activklass.internal',
    employee_number: 'EMP950007', is_temp_password: true,
  },
  {
    id: 'u3', first_name: 'Cedric', last_name: 'Ainsworth', role: 'student', status: 'active',
    login_id: 'srnhs-300028', email: 'srnhs-300028@activklass.internal',
    student_number: '2026300028', is_temp_password: false,
  },
]

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { name: 'San Roque National High School', login_prefix: 'srnhs' }, isLoading: false, isError: false }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'admin1', role: 'admin', school_id: 'srnhs' }, school: { login_prefix: 'srnhs' } }) }))
vi.mock('@/hooks/useAdminUsers', () => ({
  adminUsersKey: ['fs-admin-users'],
  useAdminUsers: () => ({ data: USERS, isLoading: false, isError: false, error: null }),
  setUserRole: vi.fn(), setUserStatus: vi.fn(),
}))
vi.mock('@/lib/admin', () => ({
  createUser: vi.fn(), resetPassword: vi.fn(), setAccountDisabled: vi.fn(),
  adminSchoolKey: ['fs-admin-school'], fetchSchoolSettings: vi.fn(), saveSchoolSettings: vi.fn(),
}))
vi.mock('@/lib/csv', () => ({ downloadCsv: vi.fn(), stampedName: (p) => `${p}.csv` }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true), promptDialog: vi.fn() }))
vi.mock('./BulkUpload', () => ({ default: () => null }))

import UsersTab from './UsersTab.jsx'

const html = renderToStaticMarkup(<UsersTab />)

function rowOf(marker) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/g) ?? []
  const row = rows.find((r) => r.includes(marker))
  expect(row, `no table row containing ${marker}`).toBeTruthy()
  return row
}

describe('T-233 — Users list Default Password chip wording and inline layout', () => {
  it('renders "default password" on a user with is_temp_password, not "issued password"', () => {
    const row = rowOf('srnhs-300029')
    expect(row).toContain('default password')
    expect(row).not.toContain('issued password')
  })

  it('renders the chip beside Active in an inline flex layout without the block marginTop container', () => {
    const row = rowOf('srnhs-300029')
    expect(row).toMatch(/display:\s*inline-flex/)
    expect(row).not.toMatch(/margin-top:\s*6px/)
  })

  it('uses a smaller font size (10px) and white-space: nowrap to prevent wrapping', () => {
    const row = rowOf('srnhs-300029')
    expect(row).toMatch(/font-size:\s*10px/)
    expect(row).toMatch(/white-space:\s*nowrap/)
  })

  it('does not render default password chip when is_temp_password is false', () => {
    const row = rowOf('srnhs-300028')
    expect(row).not.toContain('default password')
    expect(row).not.toContain('issued password')
  })
})
