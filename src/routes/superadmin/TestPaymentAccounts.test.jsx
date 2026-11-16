import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TestPaymentAccounts from './TestPaymentAccounts'

const state = { eligibility: null, accounts: [] }
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }) => ({ data: queryKey.includes('eligibility') ? state.eligibility : { accounts: state.accounts } }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/lib/superadmin', () => ({
  fetchTestPaymentAccounts: vi.fn(), fetchTestPaymentEligibility: vi.fn(), setTestPaymentAccount: vi.fn(),
}))

const render = () => renderToStaticMarkup(<TestPaymentAccounts />)

describe('TestPaymentAccounts (superadmin enrollment card)', () => {
  it('closes enrollment when the server has no cutoff', () => {
    state.eligibility = { open: false, created_after: null }
    const html = render()
    expect(html).toContain('Enrollment is closed')
    expect(html).toMatch(/<button type="submit" disabled=""/)
  })

  it('states the cutoff and lists enrolled accounts with Disable only on enabled ones', () => {
    state.eligibility = { open: true, created_after: '2026-11-17T00:00:00+00:00' }
    state.accounts = [{ owner_id: 'teacher-new', enabled: true }, { owner_id: 'school-old', enabled: false }]
    const html = render()
    expect(html).toContain('Only accounts created after')
    expect(html).toContain('teacher-new')
    expect(html).toContain('school-old')
    expect(html.match(/>Disable</g)).toHaveLength(1)
  })
})
