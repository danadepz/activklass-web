/**
 * Phase 2 §5 — the eight missing-data states, each told apart from the others.
 *
 * The rule under every case: an absent score is NOT a zero. The system already
 * has three *recorded* states (graded / missing / excused) and "nothing
 * recorded" is a fourth, which is what this module reports. A teacher's
 * explicit M (missing = a deliberate zero) must never be reported as an
 * ungraded gap, and an ungraded gap must never be silently scored.
 */
import { describe, expect, it } from 'vitest'
import { describeReadiness, periodReadiness } from './gradeReadiness.js'
import { gradePolicy } from './grading.js'

const student = (id, last) => ({ student_id: id, first_name: 'A', last_name: last })

const asmt = (id, componentId, scores = {}, periodId = 'p1', title = id) => ({
  id, title, component_id: componentId, period_id: periodId, total_points: 100, scores,
})

const graded = (n) => ({ status: 'graded', raw_score: n })
const MISSING = { status: 'missing', raw_score: null }
const EXCUSED = { status: 'excused', raw_score: null }

const bundle = (over = {}) => ({
  periods: [{ id: 'p1', name: 'Q1', weight_percent: 100 }],
  components: [
    { id: 'ww', name: 'Written Works', weight_percent: 50 },
    { id: 'pt', name: 'Performance Tasks', weight_percent: 50 },
  ],
  policy: gradePolicy({}),
  students: [student('s1', 'Reyes'), student('s2', 'Santos')],
  assessments: [],
  ...over,
})

const codes = (b, p = 'p1') => periodReadiness(b, p).findings.map((f) => f.code)
const find = (b, code, p = 'p1') => periodReadiness(b, p).findings.find((f) => f.code === code)

describe('configuration problems are errors', () => {
  it('flags component weights that do not total 100', () => {
    const b = bundle({ components: [{ id: 'ww', name: 'WW', weight_percent: 40 }] })
    expect(codes(b)).toContain('weights_invalid')
    expect(find(b, 'weights_invalid').level).toBe('error')
  })

  it('checks each track separately on a laboratory class', () => {
    const b = bundle({
      policy: gradePolicy({ grading_structure: 'lecture_lab', lab_weight_percent: 100 / 3 }),
      components: [
        { id: 'cs', name: 'CS', weight_percent: 100, track: 'lecture' },
        { id: 'lx', name: 'Lab Exercise', weight_percent: 70, track: 'lab' },
        { id: 'le', name: 'Lab Exam', weight_percent: 20, track: 'lab' }, // 90, not 100
      ],
    })
    const f = find(b, 'weights_invalid')
    expect(f.level).toBe('error')
    expect(f.track).toBe('lab')
    expect(f.text).toMatch(/Laboratory/)
  })

  it('accepts a valid laboratory split that totals 200 across both tracks', () => {
    const b = bundle({
      policy: gradePolicy({ grading_structure: 'lecture_lab', lab_weight_percent: 100 / 3 }),
      components: [
        { id: 'cs', name: 'CS', weight_percent: 100, track: 'lecture' },
        { id: 'lx', name: 'Lab Exercise', weight_percent: 70, track: 'lab' },
        { id: 'le', name: 'Lab Exam', weight_percent: 30, track: 'lab' },
      ],
    })
    expect(codes(b)).not.toContain('weights_invalid')
  })

  it('flags an assessment whose component no longer exists', () => {
    const b = bundle({ assessments: [asmt('a1', 'deleted-component', { s1: graded(80) })] })
    const f = find(b, 'orphan_assessment')
    expect(f.level).toBe('error')
    expect(f.assessmentIds).toEqual(['a1'])
    expect(f.text).toMatch(/count toward nothing/)
  })

  it('flags an assessment whose period no longer exists', () => {
    const b = bundle({ assessments: [asmt('a1', 'ww', { s1: graded(80) }, 'deleted-period')] })
    expect(codes(b)).toContain('orphan_assessment')
  })
})

describe('nothing to grade yet', () => {
  it('reports an empty period', () => {
    expect(codes(bundle())).toContain('period_empty')
  })

  it('reports a component with no assessments and names the re-weighting', () => {
    const b = bundle({ assessments: [asmt('a1', 'ww', { s1: graded(80), s2: graded(70) })] })
    const f = find(b, 'component_no_assessments')
    expect(f.componentId).toBe('pt')
    expect(f.text).toMatch(/50% is re-weighted/)
  })

  it('reports a component whose assessments exist but were never scored', () => {
    const b = bundle({
      assessments: [
        asmt('a1', 'ww', { s1: graded(80), s2: graded(70) }),
        asmt('a2', 'pt', {}),
      ],
    })
    const f = find(b, 'component_ungraded')
    expect(f.componentId).toBe('pt')
    expect(f.text).toMatch(/not counted as zero/)
  })

  it('reports a laboratory half with no recorded scores', () => {
    const b = bundle({
      policy: gradePolicy({ grading_structure: 'lecture_lab', lab_weight_percent: 100 / 3 }),
      components: [
        { id: 'cs', name: 'CS', weight_percent: 100, track: 'lecture' },
        { id: 'lx', name: 'Lab Exercise', weight_percent: 100, track: 'lab' },
      ],
      assessments: [asmt('a1', 'cs', { s1: graded(80), s2: graded(70) }), asmt('a2', 'lx', {})],
    })
    const f = find(b, 'track_ungraded')
    expect(f.track).toBe('lab')
    expect(f.text).toMatch(/carries the whole period grade/)
  })

  it('does not report a track on a lecture-only class', () => {
    const b = bundle({ assessments: [asmt('a1', 'ww', {}), asmt('a2', 'pt', {})] })
    expect(codes(b)).not.toContain('track_ungraded')
  })
})

describe('grading progress', () => {
  it('reports an assessment nobody has been scored on', () => {
    const b = bundle({ assessments: [asmt('a1', 'ww', {}, 'p1', 'Quiz 1')] })
    const f = find(b, 'assessment_ungraded')
    expect(f.text).toMatch(/"Quiz 1" has no scores recorded for any of the 2 students/)
  })

  it('reports a part-scored assessment as info, not a warning', () => {
    const b = bundle({ assessments: [asmt('a1', 'ww', { s1: graded(80) }, 'p1', 'Quiz 1')] })
    const f = find(b, 'assessment_partial')
    expect(f.level).toBe('info')
    expect(f).toMatchObject({ recorded: 1, expected: 2 })
  })

  it('names the students with no recorded score', () => {
    const b = bundle({ assessments: [asmt('a1', 'ww', { s1: graded(80) })] })
    const f = find(b, 'students_unscored')
    expect(f.text).toMatch(/1 student has no recorded score/)
    expect(f.text).toMatch(/Santos/)
    expect(f.studentIds).toEqual(['s2'])
  })

  it('caps the named students and says how many more', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((x, i) => student(`s${i}`, x.toUpperCase()))
    const b = bundle({ students: many, assessments: [asmt('a1', 'ww', { s0: graded(80) })] })
    expect(find(b, 'students_unscored').text).toMatch(/\+1 more/)
  })
})

describe('the three recorded states are never confused with "not yet scored"', () => {
  it('treats an explicit M (missing) as a recorded mark, not a gap', () => {
    const b = bundle({
      components: [{ id: 'ww', name: 'WW', weight_percent: 100 }],
      assessments: [asmt('a1', 'ww', { s1: MISSING, s2: MISSING })],
    })
    const c = codes(b)
    expect(c).not.toContain('students_unscored')
    expect(c).not.toContain('assessment_ungraded')
    // a deliberate zero IS a score, so the component counts as graded
    expect(c).not.toContain('component_ungraded')
  })

  it('treats an excused mark as recorded for progress, but not as a score', () => {
    const b = bundle({
      components: [{ id: 'ww', name: 'WW', weight_percent: 100 }],
      assessments: [asmt('a1', 'ww', { s1: EXCUSED, s2: EXCUSED })],
    })
    const c = codes(b)
    // the teacher has decided about both students, so neither is "unscored"
    expect(c).not.toContain('students_unscored')
    // but nothing contributes a mark, so the component still has no grade
    expect(c).toContain('component_ungraded')
  })

  it('never reports a gap as a zero anywhere in its text', () => {
    const b = bundle({ assessments: [asmt('a1', 'ww', { s1: graded(80) })] })
    for (const f of periodReadiness(b, 'p1').findings) {
      expect(f.text).not.toMatch(/counted as 0\b|scored zero/)
    }
  })
})

describe('summary', () => {
  it('counts students, assessments and progress', () => {
    const b = bundle({
      assessments: [
        asmt('a1', 'ww', { s1: graded(80), s2: graded(70) }),
        asmt('a2', 'pt', { s1: graded(90) }),
      ],
    })
    const r = periodReadiness(b, 'p1')
    expect(r.counts).toMatchObject({ students: 2, assessments: 2, fullyScored: 1, unscored: 0 })
  })

  it('is complete only when every component is graded and every student scored', () => {
    const done = bundle({
      assessments: [
        asmt('a1', 'ww', { s1: graded(80), s2: graded(70) }),
        asmt('a2', 'pt', { s1: graded(90), s2: graded(60) }),
      ],
    })
    expect(periodReadiness(done, 'p1').complete).toBe(true)
    expect(describeReadiness(periodReadiness(done, 'p1'))).toBeNull()
    expect(periodReadiness(bundle(), 'p1').complete).toBe(false)
  })

  it('summarises errors ahead of warnings', () => {
    const b = bundle({ components: [{ id: 'ww', name: 'WW', weight_percent: 40 }] })
    expect(describeReadiness(periodReadiness(b, 'p1'))).toMatch(/1 problem to fix/)
    const warnOnly = bundle({ assessments: [asmt('a1', 'ww', { s1: graded(1), s2: graded(1) })] })
    expect(describeReadiness(periodReadiness(warnOnly, 'p1'))).toMatch(/need attention/)
  })

  it('orders findings worst first', () => {
    const b = bundle({
      components: [{ id: 'ww', name: 'WW', weight_percent: 40 }],
      assessments: [asmt('a1', 'ww', { s1: graded(80) })],
    })
    const levels = periodReadiness(b, 'p1').findings.map((f) => f.level)
    expect(levels).toEqual([...levels].sort((a, c) => ['error', 'warn', 'info'].indexOf(a) - ['error', 'warn', 'info'].indexOf(c)))
  })

  it('survives an empty class without throwing', () => {
    const r = periodReadiness(bundle({ students: [], assessments: [] }), 'p1')
    expect(r.counts.students).toBe(0)
    expect(r.complete).toBe(false)
  })
})
