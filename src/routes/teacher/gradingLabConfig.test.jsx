/**
 * Grade Config renders the Lecture with Laboratory structure the way §6 asks:
 * a structure choice, a separate laboratory card, the ratio and a combined
 * summary -- and a Lecture only class still sees none of it.
 *
 * Static markup only, like the other Grade Config tests in this folder: the
 * arithmetic is pinned in lib/gradingLab.test.js, and what matters here is
 * that the saved structure reaches the screen and that a laboratory component
 * cannot be renamed or deleted out of the template.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const LECTURE_ONLY_PRESET = {
  grading_mode: 'deped_k12',
  periods: [
    { id: 'q1', name: 'Quarter 1', weight_percent: 50 },
    { id: 'q2', name: 'Quarter 2', weight_percent: 50 },
  ],
  components: [
    { id: 'ww', name: 'Written Works', weight_percent: 30 },
    { id: 'pt', name: 'Performance Tasks', weight_percent: 50 },
    { id: 'qa', name: 'Quarterly Assessment', weight_percent: 20 },
  ],
}

const LAB_PRESET = {
  grading_mode: 'ched_percentage',
  grading_structure: 'lecture_lab',
  lab_weight_percent: 100 / 3,
  periods: [
    { id: 'mid', name: 'Midterm', weight_percent: 50 },
    { id: 'fin', name: 'Finals', weight_percent: 50 },
  ],
  components: [
    { id: 'cs', name: 'Class Standing', weight_percent: 40, track: 'lecture' },
    { id: 'pe', name: 'Prelim Exam', weight_percent: 20, track: 'lecture' },
    { id: 'me', name: 'Major Exam', weight_percent: 40, track: 'lecture' },
    { id: 'lx', name: 'Lab Exercise', weight_percent: 70, track: 'lab', required: true },
    { id: 'le', name: 'Lab Exam', weight_percent: 30, track: 'lab', required: true },
  ],
}

let preset = LECTURE_ONLY_PRESET

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: preset, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', () => ({ useParams: () => ({}) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: vi.fn() }))
vi.mock('@/lib/gradebook', () => ({ syncEntries: vi.fn() }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [], isLoading: false }) }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import GlobalGradingSetupPage from './grading.jsx'

const render = (p) => {
  preset = p
  return renderToStaticMarkup(<GlobalGradingSetupPage />)
}

describe('Grade Config — course structure', () => {
  it('offers both structures on every class', () => {
    const html = render(LECTURE_ONLY_PRESET)
    expect(html).toContain('Course Structure')
    expect(html).toContain('Lecture only')
    expect(html).toContain('Lecture with Laboratory')
  })

  it('keeps a Lecture only class free of every laboratory control', () => {
    const html = render(LECTURE_ONLY_PRESET)
    expect(html).toContain('Grade Components')
    expect(html).toContain('Add component')
    expect(html).not.toContain('Add lecture component')
    expect(html).not.toContain('Laboratory Components')
    expect(html).not.toContain('Laboratory share of the grade')
    expect(html).not.toContain('Lab Exercise')
    // The grading standard selector is untouched by any of this.
    expect(html).toContain('Grading Type')
    expect(html).toContain('DepEd K-12')
  })

  it('shows a separate laboratory card for a laboratory class', () => {
    const html = render(LAB_PRESET)
    expect(html).toContain('Lecture Components')
    expect(html).toContain('Add lecture component')
    expect(html).toContain('Laboratory Components')
    expect(html).toContain('Add laboratory component')
    expect(html).toContain('Lab Exercise')
    expect(html).toContain('Lab Exam')
  })

  it('splits the saved components into the two cards by track, not by name', () => {
    const html = render(LAB_PRESET)
    // Class Standing sits above Lab Exercise: the lecture card renders first.
    expect(html.indexOf('Class Standing')).toBeLessThan(html.indexOf('Lab Exercise'))
  })

  it('shows the lecture-to-laboratory ratio and a combined summary totalling 100%', () => {
    const html = render(LAB_PRESET)
    expect(html).toContain('Laboratory share of the grade')
    expect(html).toContain('Lecture 66.67%')
    expect(html).toContain('Laboratory 33.33%')
    expect(html).toContain('Total 100%')
  })

  it('says the grading standard is applied once, to the combined result', () => {
    const html = render(LAB_PRESET)
    expect(html).toContain('applied once, to that combined')
  })

  it('locks the template-required laboratory components', () => {
    const html = render(LAB_PRESET)
    expect(html).toContain('Required by this grading template')
    expect(html).toContain('they cannot be')
  })

  it('still preserves periods, bulk targets and the preset buttons', () => {
    const html = render(LAB_PRESET)
    expect(html).toContain('Grading Periods')
    expect(html).toContain('Target Classes')
    expect(html).toContain('Quick-start with a preset')
    expect(html).toContain('College — Lecture with Laboratory')
  })
})

describe('Grade Config — saved templates card (Phase 2)', () => {
  it('offers to save the current setup and explains that nothing reaches a class yet', () => {
    const html = render(LAB_PRESET)
    expect(html).toContain('Saved Templates')
    expect(html).toContain('Save current setup')
    // The §3 guarantee, said on screen: a template is not linked to a class.
    expect(html).toContain('nothing reaches a class until you press Save')
    expect(html).toContain('never changes a class that already uses it')
  })

  it('shows the empty state before any template is saved', () => {
    expect(render(LECTURE_ONLY_PRESET)).toContain('No templates yet')
  })
})
