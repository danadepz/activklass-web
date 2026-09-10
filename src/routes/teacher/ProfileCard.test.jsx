/**
 * The "Your profile" card on the Account page (T-49, triplecookiemonster-63):
 * a teacher who registered on their own sees the ID number they registered
 * with, read-only and labelled by type; everyone else's card is unchanged.
 * Static markup, the house pattern -- no DOM library here.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ profile: {} }))

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: state.profile, refreshProfile: vi.fn() }) }))
vi.mock('@/hooks/useMySubscription', () => ({ useMySubscription: () => ({ isLoading: true }) }))
vi.mock('@/hooks/useSchoolColleagues', () => ({ useSchoolColleagues: () => ({}) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))

import { ProfileCard } from './account.jsx'

const render = () => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><ProfileCard /></QueryClientProvider>)
const disabledInputs = (html) => (html.match(/<input [^>]*disabled=""[^>]*>/g) ?? [])

describe('ProfileCard', () => {
  it('shows a self-registered teacher their PRC licence number, read-only, beside the email', () => {
    state.profile = {
      id: 'T1', first_name: 'Allan', last_name: 'Namocatcat', email: 'allan@gmail.com',
      verification_id_type: 'prc', verification_id_number: '0123456',
    }
    const html = render()
    expect(html).toContain('PRC license no.')
    expect(html).toContain('the one we checked when your account was approved')
    const greyed = disabledInputs(html)
    expect(greyed).toHaveLength(2)
    expect(greyed[0]).toContain('value="allan@gmail.com"')
    expect(greyed[1]).toContain('value="0123456"')
  })

  it('labels a school ID by its type', () => {
    state.profile = {
      id: 'T1', first_name: 'A', last_name: 'B', email: 'a@b.com',
      verification_id_type: 'school_id', verification_id_number: 'UCB-2021-0042',
    }
    const html = render()
    expect(html).toContain('School / employee ID no.')
    expect(html).toContain('value="UCB-2021-0042"')
  })

  it('leaves an admin-issued teacher\'s card as it was: login id only, no empty ID row', () => {
    state.profile = { id: 'T2', first_name: 'Marites', last_name: 'Cruz', email: 'srnhs-260101@x', login_id: 'srnhs-260101' }
    const html = render()
    expect(html).toContain('Login ID')
    expect(html).not.toContain(' no.')
    expect(html).not.toContain('account was approved')
    expect(disabledInputs(html)).toHaveLength(1)
  })
})
