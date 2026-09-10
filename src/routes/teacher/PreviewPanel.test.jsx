/**
 * Grade Config's Preview card (T-45 Tier 2, maykel_64440-39).
 *
 * The card is a simulation over computeFinalGrade: one 100-point assessment
 * per named component, the typed sample as its score, the same policy the
 * record uses. What is pinned here is that the simulation cannot drift from
 * the record's arithmetic -- simulateGrade is held against computeFinalGrade
 * on the equivalent shape -- and that the rendered card shows the grade, the
 * Passed / Failed badge and the formula for the numbers typed, in every mode
 * and both point-scale directions.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { computeFinalGrade } from '@/lib/grading'

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', () => ({ useParams: () => ({}) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: vi.fn() }))
vi.mock('@/lib/gradebook', () => ({ syncEntries: vi.fn() }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [] }) }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { PreviewPanel } from './grading.jsx'
import { simulateGrade } from './gradePreview.js'

// The form's rows: strings, as the editor stores them, plus an unnamed row
// that must not count.
const college = [
  { id: null, name: 'Class Standing', weight_percent: '60' },
  { id: null, name: 'Major Exam', weight_percent: '40' },
  { id: null, name: '', weight_percent: '15' },
]

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('simulateGrade — the preview is computeFinalGrade on the typed numbers', () => {
  it('matches computeFinalGrade component for component, in every mode', () => {
    const equivalent = [
      { id: 'c0', weight_percent: 60, assessments: [{ id: 'a0', total_points: 100 }] },
      { id: 'c1', weight_percent: 40, assessments: [{ id: 'a1', total_points: 100 }] },
    ]
    const scores = { a0: { status: 'graded', raw_score: 85 }, a1: { status: 'graded', raw_score: 70 } }
    for (const mode of ['deped_k12', 'ched_percentage', 'ched_point']) {
      for (const policy of [undefined, { passing_percent: 60, point_scale_direction: 'inverted' }]) {
        const sim = simulateGrade(college, { 0: '85', 1: '70' }, mode, policy)
        const direct = computeFinalGrade(equivalent, scores, mode, policy)
        expect(sim.initial).toBe(direct.initial) // (60·85 + 40·70) / 100 = 79
        expect(sim.final).toBe(direct.final)
        expect(sim.descriptor).toBe(direct.descriptor)
      }
    }
    expect(simulateGrade(college, { 0: '85', 1: '70' }, 'ched_point').final).toBe(2.5)
    expect(simulateGrade(college, { 0: '85', 1: '70' }, 'ched_point', { point_scale_direction: 'inverted' }).final).toBe(3.5)
  })

  it('leaves blank components out and re-weights the rest, as the record does', () => {
    const sim = simulateGrade(college, { 0: '85' }, 'ched_percentage')
    expect(sim.initial).toBe(85)
    expect(sim.used).toHaveLength(1)
    expect(sim.weightUsed).toBe(60)
    expect(sim.passed).toBe(true)
  })

  it('reads the pass mark and the direction for the badge', () => {
    expect(simulateGrade(college, { 0: '65', 1: '65' }, 'ched_percentage').passed).toBe(false)
    expect(simulateGrade(college, { 0: '65', 1: '65' }, 'ched_percentage', { passing_percent: 60 }).passed).toBe(true)
    expect(simulateGrade(college, { 0: '50', 1: '50' }, 'ched_point', { point_scale_direction: 'inverted' })).toMatchObject({ final: 1.0, passed: false })
    expect(simulateGrade(college, { 0: '96', 1: '96' }, 'ched_point', { point_scale_direction: 'inverted' })).toMatchObject({ final: 5.0, passed: true })
  })

  it('clamps a typed score to 0–100 and ignores junk', () => {
    expect(simulateGrade(college, { 0: '150', 1: 'abc' }, 'ched_percentage').initial).toBe(100)
    expect(simulateGrade(college, {}, 'ched_percentage')).toMatchObject({ final: null, passed: null, used: [] })
  })
})

describe('PreviewPanel — what the card shows', () => {
  it('asks for a sample before there is anything to preview, and never claims to save', () => {
    const html = renderToStaticMarkup(<PreviewPanel components={college} mode="ched_point" policy={{}} />)
    expect(text(html)).toMatch(/Simulation · nothing is saved/)
    expect(text(html)).toMatch(/Type a sample score/)
    expect(html).toMatch(/Sample score for Class Standing/)
    expect(html).not.toMatch(/Sample score for\s*"/)
  })

  it('shows the grade, the badge and the formula for the typed numbers', () => {
    const html = renderToStaticMarkup(
      <PreviewPanel components={college} mode="ched_point" policy={{}} initialSamples={{ 0: '85', 1: '70' }} />,
    )
    const t = text(html)
    expect(html).toMatch(/data-testid="preview-final"[^>]*>2\.50</)
    expect(t).toMatch(/Passed/)
    expect(t).toMatch(/\(60 × 85 \+ 40 × 70\) ÷ \(60 \+ 40\) = 79/)
    expect(t).toMatch(/79 falls in the “79 and above” band → 2\.50 \(1\.0 is highest\) · passes at 3\.00 or lower/)
  })

  it('reads the inverted scale and a lower pass mark', () => {
    const html = renderToStaticMarkup(
      <PreviewPanel
        components={college}
        mode="ched_point"
        policy={{ passing_percent: 60, point_scale_direction: 'inverted' }}
        initialSamples={{ 0: '85', 1: '70' }}
      />,
    )
    // At 60, 79 sits in the 76-and-above band: 2.0 standard, 4.0 inverted.
    expect(html).toMatch(/data-testid="preview-final"[^>]*>4\.00</)
    expect(text(html)).toMatch(/\(5\.0 is highest\) · passes at 3\.00 or higher/)
    expect(text(html)).toMatch(/Passed/)
  })

  it('fails and says so on a percentage below the pass mark, and transmutes under DepEd', () => {
    const fail = text(renderToStaticMarkup(
      <PreviewPanel components={college} mode="ched_percentage" policy={{}} initialSamples={{ 0: '70', 1: '70' }} />,
    ))
    expect(fail).toMatch(/Failed/)
    expect(fail).toMatch(/passes at 75 or higher/)
    const deped = text(renderToStaticMarkup(
      <PreviewPanel components={college} mode="deped_k12" policy={{}} initialSamples={{ 0: '85', 1: '70' }} />,
    ))
    // 79 → band 77.6 → 86, Very Satisfactory.
    expect(deped).toMatch(/86/)
    expect(deped).toMatch(/Very Satisfactory/)
    expect(deped).toMatch(/DepEd Order No\. 8/)
  })

  it('says when only some components were counted', () => {
    const t = text(renderToStaticMarkup(
      <PreviewPanel components={college} mode="ched_percentage" policy={{}} initialSamples={{ 0: '85' }} />,
    ))
    expect(t).toMatch(/1 of 2 components counted/)
  })
})
