/**
 * T-163 — saving term dates used to fail on an abbreviation the admin was not
 * editing. TermDatesCard's mutation re-sent the school's name and login
 * prefix purely to satisfy the (now-fixed) backend endpoint's all-or-nothing
 * shape; a school with no abbreviation set yet (maykel's "Lorma Colleges,
 * Inc.") had its empty prefix validated and refused before the dates were
 * ever looked at.
 *
 * This pins the client half of the fix: the term-dates mutation must send
 * `{ term_dates }` alone, never `name` or `prefix`.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// vi.mock factories are hoisted above the whole file, so anything they close
// over must be created through vi.hoisted() rather than a plain top-level
// const -- a plain const here throws "Cannot access before initialization".
const { saveSchoolSettings, mutationConfigs } = vi.hoisted(() => ({
  saveSchoolSettings: vi.fn(),
  mutationConfigs: [],
}))

// LoginPrefixCard and TermDatesCard are both top-level, unconditional cards
// in UsersTab (the Add User form only mounts once a mode is picked), so the
// first two useMutation calls on a bare render are theirs, in render order.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { name: 'Lorma Colleges, Inc.', login_prefix: '' },
    isLoading: false, isError: false,
  }),
  useMutation: (config) => {
    mutationConfigs.push(config)
    return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'u1', role: 'admin', school_id: 'school-2' }, school: { login_prefix: '' } }),
}))
vi.mock('@/hooks/useAdminUsers', () => ({
  adminUsersKey: ['fs-admin-users'],
  useAdminUsers: () => ({ data: [], isLoading: false, isError: false, error: null }),
  setUserRole: vi.fn(), setUserStatus: vi.fn(),
}))
vi.mock('@/lib/admin', () => ({
  createUser: vi.fn(), resetPassword: vi.fn(), setAccountDisabled: vi.fn(),
  adminSchoolKey: ['fs-admin-school'], fetchSchoolSettings: vi.fn(), saveSchoolSettings,
}))
vi.mock('@/lib/csv', () => ({ downloadCsv: vi.fn(), stampedName: (p) => `${p}.csv` }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true), promptDialog: vi.fn() }))
vi.mock('./BulkUpload', () => ({ default: () => null }))

import UsersTab from './UsersTab.jsx'

renderToStaticMarkup(<UsersTab />)

describe('Term dates card mutation (T-163)', () => {
  it('sends only term_dates, never the school name or abbreviation it does not own', () => {
    expect(mutationConfigs.length).toBeGreaterThanOrEqual(2)
    const [loginPrefixConfig, termDatesConfig] = mutationConfigs

    // LoginPrefixCard's mutationFn is saveSchoolSettings itself -- a direct
    // passthrough, which is how we know index 1 is the other card.
    expect(loginPrefixConfig.mutationFn).toBe(saveSchoolSettings)
    expect(termDatesConfig.mutationFn).not.toBe(saveSchoolSettings)

    termDatesConfig.mutationFn({ school_year_end: '2027-04-15' })

    expect(saveSchoolSettings).toHaveBeenCalledTimes(1)
    expect(saveSchoolSettings).toHaveBeenCalledWith({ term_dates: { school_year_end: '2027-04-15' } })
    expect(Object.keys(saveSchoolSettings.mock.calls[0][0])).toEqual(['term_dates'])
  })
})
