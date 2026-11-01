import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ bundle: null }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: state.bundle }) }))
vi.mock('react-router-dom', async (load) => ({ ...(await load()), useParams: () => ({ classId: 'c' }) }))
vi.mock('@/components/PredictedRisk', () => ({ default: () => null }))
import PerformancePage from './performance.jsx'
function render(mode, direction, grades) {
  state.bundle = {
    configured: true, mode, policy: { passing_percent: 75, point_scale_direction: direction },
    periods: [{ id: 'p', name: 'Period' }], components: [], assessments: [],
    students: grades.map((grade, i) => ({ student_id: `s${i}`, first_name: '', last_name: `Student${i}` })),
    overrides: { p: Object.fromEntries(grades.map((grade, i) => [`s${i}`, grade])) },
  }
  return renderToStaticMarkup(<MemoryRouter><PerformancePage /></MemoryRouter>)
}
function card(html, title, end) { return html.slice(html.indexOf(title), html.indexOf(end, html.indexOf(title))) }
describe('T-226: performance respects grade direction', () => {
  it.each([
    ['ched_point', 'ched', [5, 3, 1], 'Student2', 'Student0'],
    ['ched_point', 'inverted', [1, 3, 5], 'Student2', 'Student0'],
    ['deped_k12', 'ched', [70, 80, 95], 'Student2', 'Student0'],
  ])('%s %s ranks the best first and limits the attention list', (mode, direction, grades, best, worst) => {
    const html = render(mode, direction, grades)
    const top = card(html, 'Top Performers', 'Below Very Satisfactory')
    expect(top.indexOf(best)).toBeLessThan(top.indexOf(worst))
    const attention = html.slice(html.indexOf('Below Very Satisfactory'))
    expect(attention).toContain(worst)
    expect(attention).not.toContain(best)
    const kpi = card(html, mode === 'ched_point' ? 'Best Grade' : 'Highest', 'Grade Distribution')
    expect(kpi).toContain(best)
  })
})
