/**
 * The admin Users list shows each person's ID number and LRN (andecobs-46 / T-30).
 *
 * The Sign-in column carries only the last six digits of an ID (`sccu-609419`),
 * which is enough to log in and useless to a registrar holding the full number
 * on paper. Every field wanted was already on each row -- the hook spreads the
 * whole profile -- the table just never rendered it, search ignored it, and the
 * CSV omitted it.
 *
 * Static markup, the house pattern: three rows shaped the way the seeded school
 * really is (a G12 student with an LRN, a teacher with an employee number, the
 * admin with neither) and the column read back out of the first render. The
 * search matcher is state-driven and cannot be typed into here; the browser
 * pass covers that, this covers what a registrar sees without typing.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const USERS = [
  { id: 'u1', first_name: 'Beatriz', last_name: 'Aquino', role: 'student', status: 'active',
    login_id: 'srnhs-200011', email: 'srnhs-200011@activklass.internal',
    student_number: 'S2026-1001', lrn: '136428200011' },
  { id: 'u2', first_name: 'Grace', last_name: 'Abad', role: 'teacher', status: 'active',
    login_id: 'srnhs-260102', email: 'srnhs-260102@activklass.internal',
    employee_number: 'T-2026-0102' },
  { id: 'u3', first_name: 'System', last_name: 'Administrator', role: 'admin', status: 'active',
    email: 'admin@activklass.edu.ph' },
]

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { name: 'San Roque National High School', login_prefix: 'srnhs' }, isLoading: false, isError: false }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'u3', role: 'admin', school_id: 'srnhs' }, school: { login_prefix: 'srnhs' } }) }))
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

/** The <tr> holding a given login/email, so a cell can be read in context. */
function rowOf(marker) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/g) ?? []
  const row = rows.find((r) => r.includes(marker))
  expect(row, `no table row containing ${marker}`).toBeTruthy()
  return row
}

describe('Users list ID / LRN column (T-30)', () => {
  it('has the column, between Sign-in and Role', () => {
    const headers = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1].trim())
    expect(headers).toContain('ID / LRN')
    expect(headers.indexOf('ID / LRN')).toBe(headers.indexOf('Sign-in') + 1)
  })

  it('shows a G12 student\'s full student number with the LRN beneath it', () => {
    const row = rowOf('srnhs-200011')
    expect(row).toContain('S2026-1001')
    expect(row).toMatch(/LRN\s*136428200011/)
  })

  it('shows a teacher\'s employee number, and no LRN line', () => {
    const row = rowOf('srnhs-260102')
    expect(row).toContain('T-2026-0102')
    expect(row).not.toMatch(/LRN\s*\d/)
  })

  it('leaves the cell blank for an admin, who has neither', () => {
    const row = rowOf('admin@activklass.edu.ph')
    expect(row).not.toMatch(/S2026|T-2026|LRN\s*\d/)
  })

  it('tells the admin the search box takes an ID now', () => {
    expect(html).toMatch(/placeholder="Search name, email, login or ID"/)
  })
})
