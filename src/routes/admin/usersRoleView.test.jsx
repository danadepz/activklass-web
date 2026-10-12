/**
 * The Users roster gets visible role tabs instead of a dropdown someone has
 * to notice, and its own scroll instead of pushing the page's own controls
 * off screen (T-174, andecobs-255: "mixing all accounts makes tracking
 * difficult" on a 100+ teacher / 500+ student roster; "the list lacks an
 * independent scrollable container... pushing upper components out of
 * view").
 *
 * Two things are locked. `filterUsers` is the whole view-switch decision —
 * pure, so the role/search combination the screen always ran can be pinned
 * without a DOM library. The markup check (static, the house pattern) pins
 * that the dropdown is actually gone rather than left beside the tabs (the
 * card's "do not ship tabs AND keep the dropdown doing the same job"), and
 * that the table sits in its own capped, scrollable container rather than
 * growing with the roster.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { filterUsers } from './UsersTab.jsx'

describe('T-174 — filterUsers narrows by role view, then by search', () => {
  const users = [
    { id: 'u1', first_name: 'Beatriz', last_name: 'Aquino', role: 'student', login_id: 'srnhs-200011' },
    { id: 'u2', first_name: 'Grace', last_name: 'Abad', role: 'teacher', login_id: 'srnhs-260102' },
    { id: 'u3', first_name: 'System', last_name: 'Administrator', role: 'admin', email: 'admin@activklass.edu.ph' },
    { id: 'u4', first_name: 'Noel', last_name: 'Reyes', role: 'parent', email: 'noel@example.com' },
  ]

  it('"all" with no search shows everyone', () => {
    expect(filterUsers(users, 'all', '')).toHaveLength(4)
  })

  it('narrows to just the active role view', () => {
    expect(filterUsers(users, 'teacher', '').map((u) => u.id)).toEqual(['u2'])
    expect(filterUsers(users, 'student', '').map((u) => u.id)).toEqual(['u1'])
  })

  it('combines role view and search — not two independent filters', () => {
    // "Aquino" is a student; filtering to teachers first finds nobody.
    expect(filterUsers(users, 'teacher', 'Aquino')).toHaveLength(0)
    expect(filterUsers(users, 'student', 'Aquino')).toHaveLength(1)
  })

  it('search still works on every role view, including "all"', () => {
    expect(filterUsers(users, 'all', 'Abad').map((u) => u.id)).toEqual(['u2'])
  })
})

const USERS = [
  { id: 'u1', first_name: 'Beatriz', last_name: 'Aquino', role: 'student', status: 'active',
    login_id: 'srnhs-200011', email: 'srnhs-200011@activklass.internal',
    student_number: 'S2026-1001', lrn: '136428200011' },
  { id: 'u2', first_name: 'Grace', last_name: 'Abad', role: 'teacher', status: 'active',
    login_id: 'srnhs-260102', email: 'srnhs-260102@activklass.internal',
    employee_number: 'T-2026-0102' },
]

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { name: 'San Roque National High School', login_prefix: 'srnhs' }, isLoading: false, isError: false }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'u2', role: 'admin', school_id: 'srnhs' }, school: { login_prefix: 'srnhs' } }) }))
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

describe('T-174 — the roster shows role tabs, not a role dropdown', () => {
  it('renders a role radiogroup naming every role plus "all"', () => {
    expect(html).toMatch(/role="radiogroup"[^>]*aria-label="Filter users by role"/)
    expect(html).toMatch(/role="radio"[^>]*>all</)
    expect(html).toMatch(/role="radio"[^>]*>admin</)
    expect(html).toMatch(/role="radio"[^>]*>teacher</)
    expect(html).toMatch(/role="radio"[^>]*>student</)
    expect(html).toMatch(/role="radio"[^>]*>parent</)
  })

  it('ships no second, competing role-filter control', () => {
    // The old "All roles" dropdown is gone. A per-row re-role <select> still
    // legitimately exists (UserRow's own role changer) -- that is a
    // different control for a different job and this card does not touch it.
    expect(html).not.toContain('All roles')
    expect(html).not.toMatch(/<option value="all">/)
  })

  it('still has the search box, unaffected by the tabs', () => {
    expect(html).toMatch(/placeholder="Search name, email, login or ID"/)
  })
})

describe('T-174 — the table scrolls inside itself, not the page', () => {
  it('wraps the table in a capped, viewport-relative scroll container', () => {
    expect(html).toMatch(/max-height:\s*55vh/)
    expect(html).toMatch(/overflow-y:\s*auto/)
  })

  it('keeps the header row visible while the body scrolls', () => {
    expect(html).toMatch(/<tr style="background:#F7F8FA;position:sticky;top:0">/)
  })
})
