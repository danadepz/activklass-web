import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useTeacherClasses', () => ({
  useTeacherClasses: () => ({ data: [{ id: 'c1' }] }),
}))
vi.mock('@/hooks/useTeacherStudents', () => ({
  useTeacherStudents: () => ({
    data: { rows: [{
      classId: 'c1', studentId: 's1', firstName: 'Ada', lastName: 'Student',
      classLabel: 'Fictional class', grade: null, configured: true,
      riskScore: null, riskStatus: 'insufficient_data',
      riskTraining: { real_data: false },
    }, {
      classId: 'c1', studentId: 's2', firstName: 'Ben', lastName: 'Scored',
      classLabel: 'Fictional class', grade: 46, configured: true,
      riskScore: 0.75, riskStatus: 'scored',
      riskTraining: { real_data: false },
    }] },
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('@/hooks/useMySubscription', () => ({
  useMySubscription: () => ({ isSolo: false }),
}))
vi.mock('./StudentAccounts', () => ({ default: () => null }))

import StudentsPage, { RiskBadge } from './students.jsx'

describe('student directory risk badge', () => {
  it('labels insufficient evidence without exposing a numeric risk score', () => {
    const html = renderToStaticMarkup(
      <RiskBadge score={0.75} status="insufficient_data" training={{ real_data: false }} />,
    )

    expect(html).toContain('Insufficient data')
    expect(html).not.toContain('75')
    expect(html).not.toContain('%')
  })

  it('keeps a supported risk score for students with sufficient evidence', () => {
    const html = renderToStaticMarkup(
      <RiskBadge score={0.73} status="scored" training={{ real_data: false }} />,
    )

    expect(html).toContain('High (provisional)')
    expect(html).toContain('not a validated chance of failing')
    expect(html).toContain('score 73')
    expect(html).not.toContain('%')
    // The footnote it pointed to was removed; RISK_CAVEAT now explains the score.
    expect(html).not.toContain('†')
  })

  it('never shows a number for insufficient evidence, whatever score arrives', () => {
    for (const score of [0, 0.2, 0.4, 0.99, null]) {
      const html = renderToStaticMarkup(<RiskBadge score={score} status="insufficient_data" />)
      expect(html).toContain('Insufficient data')
      expect(html.replace(/<[^>]*>/g, '')).not.toMatch(/\d/) // visible text only
    }
  })

  it('shows the plain caution beside the roster risk labels', () => {
    const html = renderToStaticMarkup(<MemoryRouter><StudentsPage /></MemoryRouter>)
    expect(html).toContain('Insufficient data')
    expect(html).toContain('score 75')
    expect(html).not.toContain('†')
    expect(html).toContain('Risk is an early guide only. It uses sample data, not real ActivKlass results yet.')
    expect(html.indexOf('Risk is an early guide only.')).toBeLessThan(html.indexOf('>Roster</h3>'))
  })
})
