import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const riskState = vi.hoisted(() => ({ data: {} }))
vi.mock('@/hooks/useClassRisk', async (importOriginal) => ({
  ...(await importOriginal()),
  useClassRisk: () => ({ data: riskState.data, isLoading: false, isError: false }),
}))

import PredictedRisk from './PredictedRisk.jsx'

const row = { student_id: 's1', first_name: 'A', last_name: 'Student', grade: 75 }

describe('teacher predicted-risk status handling', () => {
  beforeEach(() => { riskState.data = {} })

  it('does not show a numeric risk score for insufficient evidence', () => {
    // A stale/default score must not leak through when the model says the
    // evidence is insufficient.
    riskState.data = { s1: { status: 'insufficient_data', atRisk: true, score: 0.75, missing: ['quiz_trend'] } }
    const html = renderToStaticMarkup(<PredictedRisk classId="c1" rows={[row]} />)
    expect(html).toContain('insufficient recorded evidence')
    expect(html).not.toContain('A Student')
    expect(html).not.toContain('score 75')
    expect(html).not.toContain('No student is flagged')
    expect(html).not.toContain('On track')
    expect(html).toContain('Risk is an early guide only.')
  })

  it('reports the coverage that was recorded even when no student could be scored', () => {
    riskState.data = { s1: { status: 'insufficient_data', atRisk: false, score: null, coverage: 0.26, missing: ['quiz_trend'] } }
    const html = renderToStaticMarkup(<PredictedRisk classId="c1" rows={[row]} />)
    expect(html).toContain('Only 26% of what the model weighs is known')
    expect(html).not.toContain('Only 0%')
  })

  it('labels a valid result as an uncalibrated score, not a likelihood', () => {
    riskState.data = {
      s1: {
        status: 'scored', atRisk: true, score: 0.73, coverage: 1,
        signals: [], missing: [], training: { real_data: false, summary: 'Synthetic development model.' },
      },
    }
    const html = renderToStaticMarkup(<PredictedRisk classId="c1" rows={[row]} />)
    expect(html).toContain('uncalibrated score')
    expect(html).toContain('73')
    expect(html).toContain('Risk is an early guide only.')
    expect(html).not.toContain('likelihood')
  })
})
