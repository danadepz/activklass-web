/**
 * T-190 (andecobs-297, Derickk): on the student class Analytics tab, the
 * "Projected standing" card's heading, explanatory sentence and footnotes
 * read boxed to roughly half the card while the green status banner beneath
 * them spans the full width -- because the sentence (and only the sentence)
 * carried an explicit `maxWidth: '68ch'` that nothing else in the card had,
 * so it wrapped onto two lines well short of where the banner's background
 * actually ends. The heading and footnotes were never literally capped --
 * they just read as narrow next to a box that visibly fills the row.
 *
 * Fix: drop the cap so the sentence uses the same measure (the card's own
 * width) as the banner. Static markup, confirming the style is gone from
 * the rendered paragraph rather than asserting against the component's own
 * source.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const queryState = vi.hoisted(() => ({ data: null }))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: () => ({ data: queryState.data, isLoading: false, isError: false }),
}))

const ClassStandingForecast = (await import('./ClassStandingForecast.jsx')).default

function render(data) {
  queryState.data = data
  return renderToStaticMarkup(
    <ClassStandingForecast
      studentId="S1" grade={72} attendanceRate={41} quizAverage={62}
      attendanceLog={[]} attempts={[]} assessments={[]} quizzes={[]} attemptedQuizIds={new Set()}
    />,
  )
}

const loaded = { atRisk: false, coverage: 1, signals: [], supplied: [] }

describe('ClassStandingForecast -- the sentence shares the banner\'s measure (T-190)', () => {
  it('does not cap the explanatory sentence narrower than the card', () => {
    const html = render(loaded)
    const p = html.match(/<p[^>]*>A projection, not a grade[\s\S]*?<\/p>/)[0]
    expect(p).not.toMatch(/max-width/)
  })

  it('the status banner still has no width cap either, so both share the card\'s own measure', () => {
    const html = render(loaded)
    const banner = html.match(/<div style="display:flex[\s\S]*?<\/div>/)[0]
    expect(banner).not.toMatch(/max-width/)
  })

  it('renders the heading, sentence and banner together', () => {
    const html = render(loaded)
    expect(html).toContain('Projected standing')
    expect(html).toContain('A projection, not a grade')
    expect(html).toContain('On track')
  })
})
