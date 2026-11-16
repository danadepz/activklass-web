import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TestPaymentAccounts from './TestPaymentAccounts'

const state = { accounts: [] }
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { accounts: state.accounts } }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/lib/superadmin', () => ({ fetchTestPaymentAccounts: vi.fn(), setTestPaymentAccount: vi.fn() }))

const render = () => renderToStaticMarkup(<TestPaymentAccounts />)

describe('TestPaymentAccounts (superadmin enrollment card)', () => {
  it('needs an id before Enroll is pressable, and says approval changes no subscription', () => {
    state.accounts = []
    const html = render()
    expect(html).toMatch(/<button type="submit" disabled=""/)
    expect(html).toContain('Approving changes no subscription by itself')
    expect(html).toContain('No accounts enrolled.')
  })

  it('lists enrolled accounts with Disable only on enabled ones', () => {
    state.accounts = [{ owner_id: 'teacher-a', enabled: true }, { owner_id: 'school-b', enabled: false }]
    const html = render()
    expect(html).toContain('teacher-a')
    expect(html).toContain('school-b')
    expect(html.match(/>Disable</g)).toHaveLength(1)
  })
})
