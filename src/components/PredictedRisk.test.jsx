import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const riskState = vi.hoisted(() => ({ data: {}, isError: false, error: null }))
vi.mock('@/hooks/useClassRisk', async (importOriginal) => ({
  ...(await importOriginal()),
  useClassRisk: () => ({ data: riskState.data, isLoading: false, isError: riskState.isError, error: riskState.error }),
}))

import PredictedRisk from './PredictedRisk.jsx'

const row = { student_id: 's1', first_name: 'A', last_name: 'Student', grade: 75 }

describe('teacher predicted-risk status handling', () => {
  beforeEach(() => { riskState.data = {}; riskState.isError = false; riskState.error = null })

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

  it('A7: names an insufficient-data student with their record, described and unscored', () => {
    riskState.data = {
      s1: {
        status: 'insufficient_data', atRisk: false, score: null, coverage: 0.8, missing: ['quiz_trend', 'prior_average_grade'],
        evidence: { attendance: { marks: 4, held_sessions: 5, not_recorded: 1 }, quizzes: { gradedQuizzes: 1 }, work: { missing: 2, submitted: 1 } },
      },
    }
    const html = renderToStaticMarkup(<PredictedRisk classId="c1" rows={[row]} />)
    expect(html).toContain('Insufficient Data — not scored (1)')
    expect(html).toContain('Student, A')
    expect(html).toContain('Not yet available: quiz trend, prior average grade')
    expect(html).toContain('Record: 4 attendance marks of 5 held sessions (1 not recorded)')
    expect(html).toContain('they are not a prediction')
    expect(html).not.toContain('uncalibrated score')
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

// 2026-11-23: a failed load is described plainly. The panel cannot tell a
// Firestore read from the prediction call, so it blames neither, and no raw
// exception text reaches the teacher (useClassRisk logs it to the console).
describe('teacher predicted-risk load failure', () => {
  const NEUTRAL = 'Risk predictions could not be loaded right now, so no student has been scored.'
  const FORBIDDEN = [/flask/i, /firebase/i, /firestore/i, /backend/i, /prediction service/i, /permission/i, /traceback/i, /status 5\d\d/i]

  beforeEach(() => { riskState.data = {}; riskState.isError = true })

  it.each([
    ['a refused Firestore evidence read', Object.assign(new Error('Missing or insufficient permissions.'), { name: 'FirebaseError', code: 'permission-denied' })],
    ['a failed quiz query', Object.assign(new Error('FirebaseError: [code=unavailable]: Firestore backend unreachable'), { code: 'unavailable' })],
    ['a prediction API failure', Object.assign(new Error('Request failed with status 502: Traceback (most recent call last) gunicorn worker'), { status: 502 })],
  ])('%s shows the neutral message and nothing of the exception', (_label, error) => {
    riskState.error = error
    const html = renderToStaticMarkup(<PredictedRisk classId="c1" rows={[row]} />)
    expect(html).toContain(NEUTRAL)
    expect(html).toContain('Try again')
    expect(html).not.toContain(error.message)
    if (error.code) expect(html).not.toContain(error.code)
    for (const word of FORBIDDEN) expect(html).not.toMatch(word)
    // Nothing is filled in for the failed evidence: no student, no score, no "on track".
    expect(html).not.toContain('A Student')
    expect(html).not.toContain('Student, A')
    expect(html).not.toMatch(/score \d/)
    expect(html).not.toContain('On track')
    expect(html).not.toContain('No scored students are flagged')
  })

  it('the neutral message never appears on a successful load', () => {
    riskState.isError = false
    riskState.data = { s1: { status: 'scored', atRisk: true, score: 0.73, coverage: 1, signals: [], missing: [], training: { real_data: false, summary: 'Synthetic development model.' } } }
    const html = renderToStaticMarkup(<PredictedRisk classId="c1" rows={[row]} />)
    expect(html).not.toContain(NEUTRAL)
    expect(html).toContain('Student, A')
  })
})
