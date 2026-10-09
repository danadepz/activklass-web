/**
 * T-146 (andecobs-210): the Dashboard's "Your classes" table painted every
 * class badge navy-and-gold regardless of the colour the teacher picked on
 * My Classes (`badge_color`, written by routes/teacher/classes/index.jsx).
 * The badge now reads the same `badgeColor`/`badgeTextColor` helpers the
 * classes page already uses, imported rather than copy-pasted.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { navy, gold } from '@/theme'
import { badgeColor, badgeTextColor } from '@/routes/teacher/classes'

const recoloured = { id: 'c1', subject_code: 'SCI9', section: 'Newton', badge_color: '#0D7A6A', student_ids: [] }
const unpicked = { id: 'c2', subject_code: 'MATH10', section: 'Euclid', student_ids: [] }

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'T1', role: 'teacher', first_name: 'Solo', last_name: 'Teacher' } }),
}))
vi.mock('@/hooks/useTeacherClasses', () => ({
  useTeacherClasses: () => ({ data: [recoloured, unpicked], isLoading: false }),
}))

import TeacherDashboard from './index.jsx'

function page() {
  return renderToStaticMarkup(<MemoryRouter><TeacherDashboard /></MemoryRouter>)
}

describe('T-146 — the dashboard badge honours the class\'s own badge_color', () => {
  it('renders a recoloured class in the colour the teacher picked, not navy-and-gold', () => {
    const html = page()
    expect(html).toContain(`background:${badgeColor(recoloured)}`)
    expect(html).toContain(`color:${badgeTextColor(badgeColor(recoloured))}`)
    expect(badgeColor(recoloured)).toBe('#0D7A6A')
  })

  it('still falls back to navy-and-gold for a class with no badge_color', () => {
    const html = page()
    expect(badgeColor(unpicked)).toBe(navy)
    expect(badgeTextColor(navy)).toBe(gold)
    expect(html).toContain(`background:${navy}`)
  })
})
