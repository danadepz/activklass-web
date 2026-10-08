/**
 * T-135 (triplecookiemonster-181): the dashboard header's date chip ("📅 Oct 3,
 * 2026") reads as filler on a wide screen -- nothing on the page depends on
 * it, and T-111 already took the plan chip out of this same group. Removed;
 * "Go to Classes" stays.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'T1', role: 'teacher', first_name: 'Solo', last_name: 'Teacher' } }),
}))
vi.mock('@/hooks/useTeacherClasses', () => ({
  useTeacherClasses: () => ({ data: [], isLoading: false }),
}))

import TeacherDashboard from './index.jsx'

function page() {
  return renderToStaticMarkup(<MemoryRouter><TeacherDashboard /></MemoryRouter>)
}

describe('T-135 — the dashboard header has no date chip', () => {
  it('never renders a calendar-emoji date pill', () => {
    expect(page()).not.toContain('📅')
  })

  it('still offers Go to Classes', () => {
    expect(page()).toContain('Go to Classes')
  })
})
