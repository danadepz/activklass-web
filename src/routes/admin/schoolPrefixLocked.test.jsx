/**
 * T-255 (maykel_64440-339): after registering, an admin found the school
 * abbreviation box empty and had to type it again. The prefix now arrives at
 * approval (backend, smoke_superadmin.py), and once it is there the School &
 * Login Prefix card is view-only with a support route (owner decision
 * 2026-11-14). A school with no prefix yet (pre-T-169) still sets it once.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ school: null }))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { school: state.school }, isLoading: false, isError: false }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'u1', role: 'admin', school_id: 's1' }, school: state.school }),
}))
vi.mock('@/hooks/useAdminUsers', () => ({
  adminUsersKey: ['fs-admin-users'],
  useAdminUsers: () => ({ data: [], isLoading: false, isError: false, error: null }),
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

const input = (html, placeholder) => html.match(new RegExp(`<input[^>]*placeholder="${placeholder}"[^>]*>`))?.[0] ?? ''
const card = (html) => html.slice(html.indexOf('School &amp; Login Prefix'), html.indexOf('School &amp; Login Prefix') + 4000)

describe('School & Login Prefix card after registration (T-255)', () => {
  it('shows the registered name and abbreviation already filled, view-only, with a way to ask for a change', () => {
    state.school = { name: 'University of San Carlos', login_prefix: 'usc' }
    const html = renderToStaticMarkup(<UsersTab />)
    const abbr = input(html, 'e.g. UCB')
    expect(abbr).toContain('value="usc"')
    expect(abbr).toContain('readOnly=""')
    expect(input(html, 'e.g. University of Cebu-Banilad')).toContain('readOnly=""')
    expect(card(html)).not.toMatch(/>Save</)
    expect(card(html)).toContain('Contact ActivKlass support')
  })

  it('locked fields cannot be clicked or tabbed into, so they never look editable (2026-11-17)', () => {
    state.school = { name: 'University of San Carlos', login_prefix: 'usc' }
    const html = renderToStaticMarkup(<UsersTab />)
    for (const placeholder of ['e.g. UCB', 'e.g. University of Cebu-Banilad']) {
      const el = input(html, placeholder)
      expect(el, placeholder).toContain('tabindex="-1"')
      expect(el, placeholder).toMatch(/pointer-events:\s*none/)
      // Disabled, so a click on the wrapping label cannot put a caret in it.
      expect(el, placeholder).toContain('disabled=""')
    }
  })

  it('still lets a school with no prefix yet set it once', () => {
    state.school = { name: 'Lorma Colleges, Inc.', login_prefix: '' }
    const html = renderToStaticMarkup(<UsersTab />)
    expect(input(html, 'e.g. UCB')).not.toContain('readOnly')
    expect(input(html, 'e.g. UCB')).not.toContain('tabindex="-1"')
    expect(input(html, 'e.g. UCB')).not.toContain('disabled')
    expect(input(html, 'e.g. UCB')).not.toMatch(/pointer-events:\s*none/)
    expect(card(html)).toMatch(/>Save</)
  })
})
