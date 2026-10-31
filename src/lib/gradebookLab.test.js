/**
 * The gradebook layer with a laboratory: the whole path from a bundle of
 * assessments and scores to the entry document a student reads.
 *
 * Covers what lib/gradingLab.test.js cannot — that the laboratory structure
 * actually reaches the computation from a saved gradebook document, that the
 * teacher's record and the student's entry end up at the same number, and
 * that a Lecture only class in the same codebase is untouched.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
  serverTimestamp: vi.fn(), writeBatch: vi.fn(),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn() }))

const { buildPeriodRecord, buildSummary, computeStudentFinal } = await import('./gradebook.js')
const { gradePolicy } = await import('./grading.js')

const PERIODS = [
  { id: 'mid', name: 'Midterm', weight_percent: 50 },
  { id: 'fin', name: 'Finals', weight_percent: 50 },
]

const LAB_COMPONENTS = [
  { id: 'lec', name: 'Lecture Work', weight_percent: 100, track: 'lecture' },
  { id: 'lx', name: 'Lab Exercise', weight_percent: 70, track: 'lab' },
  { id: 'le', name: 'Lab Exam', weight_percent: 30, track: 'lab' },
]

/* One 100-point assessment per component per period, scored for student s1 —
   the reference example's numbers. */
const assessment = (component, period, score) => ({
  id: `${component}-${period}`,
  title: `${component} ${period}`,
  component_id: component,
  period_id: period,
  total_points: 100,
  scores: score == null ? {} : { s1: { status: 'graded', raw_score: score } },
})

const ASSESSMENTS = [
  assessment('lec', 'mid', 82.4), assessment('lx', 'mid', 90), assessment('le', 'mid', 88),
  assessment('lec', 'fin', 78.8), assessment('lx', 'fin', 85), assessment('le', 'fin', 83),
]

const GRADEBOOK_DOC = {
  configured: true,
  grading_mode: 'ched_percentage',
  grading_structure: 'lecture_lab',
  lab_weight_percent: 100 / 3,
  passing_percent: 75,
  periods: PERIODS,
  components: LAB_COMPONENTS,
}

const bundleFrom = (gb, assessments) => ({
  configured: true,
  periods: gb.periods,
  components: gb.components,
  mode: gb.grading_mode ?? 'deped_k12',
  policy: gradePolicy(gb),
  overrides: gb.overrides ?? {},
  students: [{ student_id: 's1', first_name: 'Ana', last_name: 'Reyes' }],
  assessments,
  klass: { subject: 'Programming 1', subject_code: 'IT101', section: 'A', grade_level: null },
})

describe('the record grid', () => {
  const bundle = bundleFrom(GRADEBOOK_DOC, ASSESSMENTS)

  it('carries the lecture and laboratory results beside the combined grade', () => {
    const record = buildPeriodRecord(bundle, 'mid')
    const g = record.grades.s1
    expect(g.tracks.lecture).toBe(82.4)
    expect(g.tracks.lab).toBe(89.4)
    expect(g.grade).toBe(84.73)
  })

  it('marks a laboratory with no scores as incomplete rather than zero', () => {
    const withoutLab = ASSESSMENTS.filter((a) => a.period_id !== 'mid' || a.component_id === 'lec')
    const record = buildPeriodRecord(bundleFrom(GRADEBOOK_DOC, withoutLab), 'mid')
    const g = record.grades.s1
    expect(g.tracks.lab).toBeNull()
    expect(g.tracks.lab_status).toBe('ungraded')
    expect(g.grade).toBe(82.4) // lecture alone; a zero laboratory would give 54.93
  })

  it('reaches the reference 82.70 across both periods', () => {
    const summary = buildSummary(bundle)
    expect(summary.grades.s1.periods.mid.grade).toBe(84.73)
    expect(summary.grades.s1.periods.fin.grade).toBe(80.67)
    expect(summary.grades.s1.final_grade).toBe(82.7)
  })

  it('agrees with the cross-class helper the reports and student directory use', () => {
    expect(
      computeStudentFinal('s1', PERIODS, LAB_COMPONENTS, ASSESSMENTS, {}, 'ched_percentage', bundle.policy),
    ).toBe(82.7)
  })

  it('lets an override replace the combined grade without disturbing the tracks', () => {
    const gb = { ...GRADEBOOK_DOC, overrides: { mid: { s1: 90 } } }
    const g = buildPeriodRecord(bundleFrom(gb, ASSESSMENTS), 'mid').grades.s1
    expect(g.grade).toBe(90)
    expect(g.period_grade).toBe(84.73)
    expect(g.tracks.lab).toBe(89.4)
  })
})

describe('a Lecture only class in the same codebase', () => {
  const PLAIN = {
    configured: true,
    grading_mode: 'deped_k12',
    periods: [{ id: 'q1', name: 'Quarter 1', weight_percent: 100 }],
    components: [
      { id: 'ww', name: 'Written Works', weight_percent: 30 },
      { id: 'pt', name: 'Performance Tasks', weight_percent: 50 },
      { id: 'qa', name: 'Quarterly Assessment', weight_percent: 20 },
    ],
  }
  const plainAssessments = [
    assessment('ww', 'q1', 88), assessment('pt', 'q1', 92), assessment('qa', 'q1', 80),
  ]

  it('computes exactly as it did before and reports no tracks at all', () => {
    const g = buildPeriodRecord(bundleFrom(PLAIN, plainAssessments), 'q1').grades.s1
    expect(g.tracks).toBeNull()
    // 88.4 weighted, transmuted under DepEd Order No. 015 s. 2026 (the 87.70 band).
    expect(g.period_grade).toBe(90)
  })

  it('ignores a component that happens to carry a track', () => {
    const tagged = { ...PLAIN, components: PLAIN.components.map((c) => ({ ...c, track: 'lab' })) }
    const g = buildPeriodRecord(bundleFrom(tagged, plainAssessments), 'q1').grades.s1
    expect(g.period_grade).toBe(90)
  })
})
