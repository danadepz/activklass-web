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

/* Phase 2 reshaped the card from one period to the whole course, so the
   block below was rewritten against the new props. Every intent the old
   block pinned is still pinned: empty state, the never-claims-to-save
   badge, the grade, the Passed/Failed badge, the inverted scale with a
   lower pass mark, DepEd transmutation, and partial counting. What is new
   is the per-period breakdown, the overall grade and the warnings. */
const periods2 = [
  { id: null, name: 'Midterm', weight_percent: '50' },
  { id: null, name: 'Finals', weight_percent: '50' },
]

describe('PreviewPanel — what the card shows', () => {
  it('asks for a sample before there is anything to preview, and never claims to save', () => {
    const html = renderToStaticMarkup(
      <PreviewPanel periods={periods2} components={college} mode="ched_point" policy={{}} />,
    )
    const t = text(html)
    expect(t).toMatch(/Simulation · sample scores · nothing is saved/)
    expect(t).toMatch(/Type a sample score in any period to see it/)
    // one input per named component per named period; the unnamed row is dropped
    expect(html).toMatch(/Sample score for Class Standing in Midterm/)
    expect(html).toMatch(/Sample score for Class Standing in Finals/)
    expect(html).not.toMatch(/Sample score for\s+in /)
  })

  it('renders every configured period, not just one', () => {
    const t = text(renderToStaticMarkup(
      <PreviewPanel
        periods={[...periods2, { id: null, name: 'Prelim', weight_percent: '0' }]}
        components={college}
        mode="ched_percentage"
        policy={{}}
      />,
    ))
    expect(t).toMatch(/Midterm/)
    expect(t).toMatch(/Finals/)
    expect(t).toMatch(/Prelim/)
  })

  it('shows each period grade and the overall grade for the typed numbers', () => {
    const html = renderToStaticMarkup(
      <PreviewPanel
        periods={periods2}
        components={college}
        mode="ched_point"
        policy={{}}
        initialSamples={{ 0: { 0: '85', 1: '70' }, 1: { 0: '85', 1: '70' } }}
      />,
    )
    const t = text(html)
    // both periods land on 79 -> 2.50 on the point scale, so the overall is 2.50
    expect(html).toMatch(/data-testid="preview-final"[^>]*>2\.50</)
    expect(t).toMatch(/Passed/)
    expect(t).toMatch(/Overall course grade/)
    expect(t).toMatch(/Midterm 50% · Finals 50%/)
  })

  it('reads the inverted scale and a lower pass mark', () => {
    const html = renderToStaticMarkup(
      <PreviewPanel
        periods={periods2}
        components={college}
        mode="ched_point"
        policy={{ passing_percent: 60, point_scale_direction: 'inverted' }}
        initialSamples={{ 0: { 0: '85', 1: '70' }, 1: { 0: '85', 1: '70' } }}
      />,
    )
    // At 60, 79 sits in the 76-and-above band: 2.0 standard, 4.0 inverted.
    expect(html).toMatch(/data-testid="preview-final"[^>]*>4\.00</)
    expect(text(html)).toMatch(/Passed/)
  })

  it('fails and says so below the pass mark, and transmutes under DepEd', () => {
    const fail = text(renderToStaticMarkup(
      <PreviewPanel
        periods={periods2}
        components={college}
        mode="ched_percentage"
        policy={{}}
        initialSamples={{ 0: { 0: '70', 1: '70' }, 1: { 0: '70', 1: '70' } }}
      />,
    ))
    expect(fail).toMatch(/Failed/)

    const deped = text(renderToStaticMarkup(
      <PreviewPanel
        periods={periods2}
        components={college}
        mode="deped_k12"
        policy={{}}
        initialSamples={{ 0: { 0: '85', 1: '70' }, 1: { 0: '85', 1: '70' } }}
      />,
    ))
    // 79.00 -> band 78.26 -> 82 -> Satisfactory, in both periods and overall.
    expect(deped).toMatch(/82/)
    expect(deped).toMatch(/Satisfactory/)
    expect(deped).not.toMatch(/Very Satisfactory/)
    expect(deped).toMatch(/DepEd Order No\. 015/)
  })

  it('says when only some components were counted, and warns a blank is not a zero', () => {
    const t = text(renderToStaticMarkup(
      <PreviewPanel
        periods={periods2}
        components={college}
        mode="ched_percentage"
        policy={{}}
        initialSamples={{ 0: { 0: '85' } }}
      />,
    ))
    expect(t).toMatch(/1 of 2 components counted/)
    expect(t).toMatch(/part-sampled/)
    expect(t).toMatch(/A blank is not a zero/)
    // the untouched period is named as left out, and the overall flagged provisional
    expect(t).toMatch(/Finals has no sample scores/)
    expect(t).toMatch(/Overall grade is provisional — 1 of 2 periods/)
  })

  it('breaks a laboratory period into its two halves', () => {
    const labComponents = [
      { id: null, name: 'Class Standing', weight_percent: '100', track: 'lecture' },
      { id: null, name: 'Lab Exercise', weight_percent: '70', track: 'lab' },
      { id: null, name: 'Lab Exam', weight_percent: '30', track: 'lab' },
    ]
    const t = text(renderToStaticMarkup(
      <PreviewPanel
        periods={[{ id: null, name: 'Midterm', weight_percent: '100' }]}
        components={labComponents}
        mode="ched_percentage"
        labOn
        policy={{ grading_structure: 'lecture_lab', lab_weight_percent: 100 / 3 }}
        initialSamples={{ 0: { 0: '82.4', 1: '90', 2: '88' } }}
      />,
    ))
    expect(t).toMatch(/Lecture/)
    expect(t).toMatch(/Laboratory/)
    expect(t).toMatch(/89\.4/) // laboratory result
    expect(t).toMatch(/84\.73/) // combined, the reference figure
    expect(t).toMatch(/combined/)
  })

  it('says a laboratory half is not yet graded instead of scoring it zero', () => {
    const labComponents = [
      { id: null, name: 'Class Standing', weight_percent: '100', track: 'lecture' },
      { id: null, name: 'Lab Exercise', weight_percent: '100', track: 'lab' },
    ]
    const t = text(renderToStaticMarkup(
      <PreviewPanel
        periods={[{ id: null, name: 'Midterm', weight_percent: '100' }]}
        components={labComponents}
        mode="ched_percentage"
        labOn
        policy={{ grading_structure: 'lecture_lab', lab_weight_percent: 100 / 3 }}
        initialSamples={{ 0: { 0: '80' } }}
      />,
    ))
    expect(t).toMatch(/not yet graded/)
    expect(t).toMatch(/the laboratory half has no sample scores/)
    // lecture alone carries the period: 80, not 53.33
    expect(t).toMatch(/80/)
  })

  it('asks for rows before it will preview anything', () => {
    const t = text(renderToStaticMarkup(
      <PreviewPanel periods={[]} components={college} mode="ched_percentage" policy={{}} />,
    ))
    expect(t).toMatch(/Name at least one grading period and one component/)
  })
})
