/**
 * The "Your school" card on the Account page, with every hook hard-coded
 * (static markup, the house pattern -- no DOM library here), plus the pure
 * filter behind it.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  profile: { id: 'T1', role: 'teacher', teaching_school_id: 'ucb', teaching_school_name: 'University of Cebu-Banilad' },
  sub: { locks: { quizBank: false, teacherGroups: false } },
  colleagues: { schoolId: 'ucb', schoolName: 'University of Cebu-Banilad', colleagues: [], isLoading: false, isError: false },
}))

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: state.profile, refreshProfile: vi.fn() }) }))
vi.mock('@/hooks/useMySubscription', () => ({ useMySubscription: () => state.sub }))
vi.mock('@/hooks/useSchoolColleagues', async (importOriginal) => ({
  ...(await importOriginal()),
  useSchoolColleagues: () => state.colleagues,
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/schoolDirectory', () => ({ fetchSchoolDirectory: vi.fn(async () => []) }))

import SchoolColleaguesCard from './SchoolColleagues.jsx'
import { pickColleagues } from '@/hooks/useSchoolColleagues'

const render = (el) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

describe('pickColleagues', () => {
  it('drops self, unverified, rejected and deactivated teachers, and sorts by last name', () => {
    const users = [
      { id: 'me', last_name: 'Aaa', first_name: 'Me' },
      { id: 'p', last_name: 'Bbb', first_name: 'Pending', verification_status: 'pending' },
      { id: 'r', last_name: 'Ccc', first_name: 'Rejected', verification_status: 'rejected' },
      { id: 'x', last_name: 'Ddd', first_name: 'Gone', status: 'inactive' },
      { id: 'd', last_name: 'Eee', first_name: 'Off', disabled: true },
      { id: 'z', last_name: 'Zamora', first_name: 'Ana', verification_status: 'approved' },
      { id: 's', last_name: 'Santos', first_name: 'Ben' },
    ]
    expect(pickColleagues(users, 'me').map((u) => u.id)).toEqual(['s', 'z'])
  })
})

describe('SchoolColleaguesCard', () => {
  it('lists the colleagues at the school, with a count and no code anywhere', () => {
    state.colleagues = { ...state.colleagues, colleagues: [
      { id: 'a', last_name: 'Santos', first_name: 'Ben', email: 'ben@ucb.edu.ph' },
      { id: 'b', last_name: 'Zamora', first_name: 'Ana', email: 'ana@ucb.edu.ph' },
    ] }
    const html = render(<SchoolColleaguesCard />)
    expect(html).toContain('Your school')
    expect(html).toContain('University of Cebu-Banilad')
    expect(html).toContain('2 colleagues')
    expect(html).toContain('Santos, Ben')
    expect(html).toContain('ana@ucb.edu.ph')
    expect(html).not.toMatch(/code|invite|request/i)
  })

  it('with nobody else yet, says colleagues appear on their own', () => {
    state.colleagues = { ...state.colleagues, colleagues: [] }
    const html = render(<SchoolColleaguesCard />)
    expect(html).toContain('0 colleagues')
    expect(html).toContain('No other teachers from University of Cebu-Banilad yet')
    expect(html).toContain('nothing to share, request or approve')
  })

  it('a trial sees the card greyed with the paid-plan hint', () => {
    state.sub = { locks: { quizBank: true, teacherGroups: true } }
    const html = render(<SchoolColleaguesCard />)
    expect(html).toContain('Available on a paid plan')
    expect(html).toContain('aria-disabled="true"')
    state.sub = { locks: { quizBank: false, teacherGroups: false } }
  })

  it('an account with no school on it is asked to pick one from the directory', () => {
    state.profile = { ...state.profile, teaching_school_id: '' }
    const html = render(<SchoolColleaguesCard />)
    expect(html).toContain('id="school-pick"')
    expect(html).toContain('Save school')
    expect(html).toContain('grouped with you automatically')
    state.profile = { ...state.profile, teaching_school_id: 'ucb' }
  })
})
