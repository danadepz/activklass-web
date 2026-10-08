/**
 * T-137 (triplecookiemonster-187): Kristine asked for an info tooltip next to
 * Performance explaining the Performance figures and the Risk model, with
 * specific risk bands ("High 50%+, Medium 35-49%, Low under 35%"). Those
 * bands do not exist anywhere in this codebase -- `useClassRisk`/`predictRisk`
 * only ever return a binary `atRisk` flag (the backend's
 * `risk_flag = 'high_risk' if prob >= 0.5 else 'on_track'`), so the tooltip
 * must say that, not her three-tier wording. This pins the tooltip's actual
 * content and that it only reveals on click, not by default.
 *
 * Static markup, the house pattern (see rosterToolbar.test.jsx for the
 * useState-seeding trick this file reuses to open the tooltip without a
 * click).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ seeded: false }))

// Only the InfoTooltip's own `useState(false)` is seeded open; performance.jsx's
// own `useState(null)` (the period picker) is a different initial value and is
// left to behave normally.
vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useState: (init) => {
      if (init === false && !state.seeded) {
        state.seeded = true
        return real.useState(true)
      }
      return real.useState(init)
    },
  }
})

const bundle = {
  configured: true,
  periods: [{ id: 'q1', name: 'Quarter 1' }],
  components: [{ id: 'ww', name: 'Written Works' }],
  mode: 'deped_k12',
  policy: { passing_percent: 75, point_scale_direction: 'ched' },
  overrides: {},
  students: [{ student_id: 'S1', first_name: 'Beatriz', last_name: 'Aquino', lrn: null, age: null }],
  assessments: [],
}

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: () => ({ data: bundle, isLoading: false, isError: false }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ classId: 'C1' }),
}))
vi.mock('@/components/PredictedRisk', () => ({ default: () => null }))

import PerformancePage from './performance.jsx'

function render() {
  state.seeded = false
  return renderToStaticMarkup(<MemoryRouter><PerformancePage /></MemoryRouter>)
}

describe('T-137 — Performance/Risk tooltip', () => {
  it('the ⓘ control is closed by default', () => {
    state.seeded = true // skip the seed entirely -> real useState(false), stays closed
    const html = renderToStaticMarkup(<MemoryRouter><PerformancePage /></MemoryRouter>)
    expect(html).toMatch(/aria-expanded="false"/)
    // The panel markup is present (for a11y) but hidden.
    expect(html).toMatch(/<span[^>]*role="tooltip"[^>]*hidden=""/)
  })

  it('opens to reveal the verified Performance scope and Risk description', () => {
    const html = render()
    expect(html).toMatch(/aria-expanded="true"/)
    expect(html).not.toMatch(/role="tooltip"[^>]*hidden=""/)

    // Performance scope: this class, this grading period -- confirmed against
    // loadPerf/buildRows in performance.jsx.
    expect(html).toContain("computed from this class&#x27;s own record")
    expect(html).toContain('grading period selected above')

    // Risk inputs: confirmed against hooks/useClassRisk.js -- attendance
    // (level + trend), quiz (level + trend), missing work, and grade.
    expect(html).toContain('attendance')
    expect(html).toContain('quiz')
    expect(html).toContain('missing or unsubmitted work')
    expect(html).toContain("student&#x27;s grade")

    // Her 50/35/Medium/Low bands do not exist in the code -- only a single
    // 50% cutoff and a binary flag. The tooltip must say that, not her bands.
    expect(html).toContain('50%')
    expect(html).toContain('no separate medium or low tier')
    expect(html).not.toMatch(/35/)
    expect(html).not.toMatch(/[Mm]edium \(/)
  })
})
