/**
 * The signed-in admin is not a row in the Users table (a school can have
 * thousands of accounts). They live on the Home tab: a view-only My Account
 * card with the Reset Password button, then the Change Password form. Home is
 * the first tab, Users the second.
 *
 * Static markup, the house pattern.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const USERS = [
  { id: 'u1', first_name: 'Beatriz', last_name: 'Aquino', role: 'student', status: 'active', login_id: 'srnhs-200011' },
  { id: 'me', first_name: 'Derick', last_name: 'Lungcob', role: 'admin', status: 'active', email: 'me.admin@example.com' },
]

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { name: 'San Roque National High School', login_prefix: 'srnhs' }, isLoading: false, isError: false }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    profile: { id: 'me', role: 'admin', school_id: 'srnhs', first_name: 'Derick', last_name: 'Lungcob', email: 'me.admin@example.com', status: 'active' },
    school: { name: 'San Roque National High School', login_prefix: 'srnhs' },
  }),
}))
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
vi.mock('@/components/ChangePassword', () => ({ default: () => <h3>Change Password</h3> }))
vi.mock('./BulkUpload', () => ({ default: () => null }))

import UsersTab from './UsersTab.jsx'
import HomeTab from './HomeTab.jsx'

describe('Users table does not list the signed-in admin', () => {
  const html = renderToStaticMarkup(<UsersTab />)
  it('lists everyone else', () => {
    expect(html).toContain('srnhs-200011')
  })
  it('no longer holds the school cards, which moved to Home', () => {
    expect(html).not.toContain('Term End Dates')
    expect(html).not.toContain('Every issued login starts with this prefix')
  })
  it('leaves the signed-in admin out', () => {
    expect(html).not.toContain('me.admin@example.com')
    expect(html).not.toContain('Lungcob, Derick')
  })
})

describe('Home tab', () => {
  const html = renderToStaticMarkup(<HomeTab />)
  it('shows the signed-in admin view-only, with the school', () => {
    expect(html).toContain('My Account')
    expect(html).toContain('Derick Lungcob')
    expect(html).toContain('me.admin@example.com')
    expect(html).toContain('San Roque National High School')
    expect(html).not.toMatch(/<input/)
  })
  it('puts School & Login Prefix and Term End Dates before My Account', () => {
    const prefix = html.indexOf('School &amp; Login Prefix')
    expect(prefix).toBeGreaterThan(-1)
    expect(html.indexOf('Term End Dates')).toBeGreaterThan(prefix)
    expect(html.indexOf('My Account')).toBeGreaterThan(html.indexOf('Term End Dates'))
  })
  it('keeps the Reset Password button', () => {
    expect(html).toContain('Reset Password')
  })
  it('puts the Change Password form under the account card', () => {
    expect(html.indexOf('My Account')).toBeLessThan(html.indexOf('Change Password'))
  })
})

describe('Admin tab order', () => {
  const src = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')
  it('is Home, Users, Class Overview, Subscription -- with no Change Password tab', () => {
    const labels = [...src.matchAll(/label: '([^']+)', hint/g)].map((m) => m[1])
    expect(labels).toEqual(['Home', 'Users', 'Class Overview', 'Subscription'])
  })
  it('opens on Home', () => {
    expect(src).toContain(": 'home'")
  })
})
