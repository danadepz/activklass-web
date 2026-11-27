import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import BloomsBreakdown, { BLOOMS_LEVELS } from './BloomsBreakdown.jsx'

const render = (performance) => renderToStaticMarkup(<BloomsBreakdown performance={performance} />)
const emptyMetric = () => ({ questionCount: 0, earnedPoints: 0, maximumPoints: 0, pendingCount: 0, pendingPoints: 0, percentage: null })
const performance = (overrides = {}) => ({
  levels: Object.fromEntries(BLOOMS_LEVELS.map(({ key }) => [key, emptyMetric()])),
  unknown: { ...emptyMetric(), attemptsWithoutMetadata: 0, unitemizedAttempts: 0, unitemizedQuestions: 0 },
  pending: { questionCount: 0, maximumPoints: 0 },
  selectedAttemptCount: 0,
  ...overrides,
})

describe('Bloom assessment performance', () => {
  it('renders all six levels with counts, point totals, and N/A when there are no scored questions', () => {
    const html = render(performance())
    expect(html).toContain('data-state="connected"')
    for (const { key, label } of BLOOMS_LEVELS) {
      expect(html).toContain(`data-level="${key}" data-percentage="na"`)
      expect(html).toContain(`${label}</div>`)
    }
    expect((html.match(/N\/A/g) ?? []).length).toBeGreaterThanOrEqual(7)
    expect(html).toContain('0 scored question results')
  })

  it('shows earned/max points and preserves zero percent as a scored result', () => {
    const data = performance({
      levels: {
        ...performance().levels,
        remember: { questionCount: 1, earnedPoints: 0, maximumPoints: 5, pendingCount: 0, pendingPoints: 0, percentage: 0 },
      },
    })
    const html = render(data)
    expect(html).toContain('data-level="remember" data-percentage="0"')
    expect(html).toContain('0 / 5 pts')
    expect(html).toContain('0%')
    expect(html).toContain('Remembering is below 75%')
  })

  it('identifies pending manual grading separately and explicitly excludes it from percentages', () => {
    const base = performance()
    base.levels.evaluate = { questionCount: 1, earnedPoints: 3, maximumPoints: 3, percentage: 100, pendingCount: 1, pendingPoints: 7 }
    base.pending = { questionCount: 1, maximumPoints: 7 }
    const html = render(base)
    expect(html).toContain('1 pending · 7 pts')
    expect(html).toContain('Pending grading:</strong> 1 question · 7 pts')
    expect(html).toContain('Pending items are excluded from percentages.')
  })

  it('reports untagged results and attempts lacking snapshots as Unknown, without mastery or remediation claims', () => {
    const base = performance()
    base.unknown = { questionCount: 2, earnedPoints: 1, maximumPoints: 4, percentage: 25, pendingCount: 0, pendingPoints: 0, attemptsWithoutMetadata: 3, unitemizedAttempts: 1, unitemizedQuestions: 4 }
    const html = render(base)
    expect(html).toContain('Unknown · untagged')
    expect(html).toContain('1 / 4 pts')
    expect(html).toContain('3 selected attempts without a metadata snapshot')
    expect(html).toContain('Item-level results are unavailable for 1 attempt (4 questions)')
    expect(html).toContain('Possible areas for review')
    expect(html).not.toContain('mastered')
    expect(html).not.toContain('Remediation Recommendations')
  })

  it('renders a loading state before assessment data arrives', () => {
    const html = render(null)
    expect(html).toContain('data-state="loading"')
    expect(html).toContain('Assessment results are loading.')
  })
})

describe('Scaffold Topics wiring', () => {
  const src = readFileSync(fileURLToPath(new URL('../routes/teacher/classes/$classId/scaffolds.jsx', import.meta.url)), 'utf8')

  it('aggregates the existing class quiz attempts and passes results to the breakdown', () => {
    expect(src).toContain('aggregateBloomPerformance(data)')
    expect(src).toContain('<BloomsBreakdown performance={bloomPerformance} />')
    expect(src).toContain("where('class_id', '==', classId)")
  })
})
