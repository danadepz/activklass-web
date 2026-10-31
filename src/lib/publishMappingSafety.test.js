/**
 * Publishing a quiz must not guess which grading component the scores land in.
 *
 * `suggestMapping` (lib/recordMapping.js) matched the component by NAME, and
 * the publish dialog opened on its guess. On a Lecture with Laboratory class
 * that is a grade-changing guess: a laboratory quiz whose class happens to
 * have a component called "Quizzes" was pre-mapped into the lecture half, and
 * a teacher who clicked straight through never saw it happen. The dialog now
 * opens with nothing selected unless the quiz ALREADY carries a mapping for
 * that class and both halves of it still exist in that class's setup.
 *
 * The dialog itself is a React component inside a 2,900-line route file; what
 * is pinned here is the decision behind it, written as the same expression the
 * dialog runs, plus the guarantee that suggestMapping is no longer wired to a
 * quiz publish at all.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LAB, componentTrack, hasLab } from './grading.js'

const QUIZ_ROUTE = new URL('../routes/teacher/quizzes.$quizId.jsx', import.meta.url)

/* The dialog's own rule, lifted: inherit only a mapping this quiz already has
   for THIS class, and only when both halves still resolve. */
function initialMapping(gb, prior) {
  const componentOk = gb.components.some((c) => c.id === prior?.component_id)
  const periodOk = gb.periods.some((p) => p.id === prior?.grading_period_id)
  return componentOk && periodOk
    ? { component_id: prior.component_id, grading_period_id: prior.grading_period_id, inherited: true }
    : { component_id: '', grading_period_id: '' }
}

const LAB_GB = {
  configured: true,
  grading_structure: 'lecture_lab',
  lab_weight_percent: 100 / 3,
  periods: [{ id: 'mid', name: 'Midterm' }, { id: 'fin', name: 'Finals' }],
  components: [
    { id: 'cs', name: 'Class Standing', weight_percent: 60, track: 'lecture' },
    { id: 'me', name: 'Major Exam', weight_percent: 40, track: 'lecture' },
    { id: 'lx', name: 'Lab Exercise', weight_percent: 70, track: 'lab' },
    { id: 'le', name: 'Lab Exam', weight_percent: 30, track: 'lab' },
  ],
}

const PLAIN_GB = {
  configured: true,
  periods: [{ id: 'q1', name: 'Quarter 1' }],
  components: [
    { id: 'ww', name: 'Written Works', weight_percent: 30 },
    { id: 'pt', name: 'Performance Tasks', weight_percent: 50 },
  ],
}

describe('publish mapping has no unsafe default', () => {
  it('opens empty for a quiz that has never been published to this class', () => {
    expect(initialMapping(LAB_GB, undefined)).toEqual({ component_id: '', grading_period_id: '' })
    expect(initialMapping(PLAIN_GB, undefined)).toEqual({ component_id: '', grading_period_id: '' })
  })

  it('inherits a mapping the quiz already carries for this class', () => {
    const prior = { component_id: 'lx', grading_period_id: 'mid' }
    expect(initialMapping(LAB_GB, prior)).toEqual({ ...prior, inherited: true })
  })

  it('drops an inherited mapping whose component no longer exists', () => {
    const stale = { component_id: 'deleted-component', grading_period_id: 'mid' }
    expect(initialMapping(LAB_GB, stale)).toEqual({ component_id: '', grading_period_id: '' })
  })

  it('drops an inherited mapping whose period no longer exists', () => {
    const stale = { component_id: 'lx', grading_period_id: 'deleted-period' }
    expect(initialMapping(LAB_GB, stale)).toEqual({ component_id: '', grading_period_id: '' })
  })

  it('does not carry one class mapping over to another class', () => {
    // A valid mapping for the laboratory class is meaningless in the plain one.
    const prior = { component_id: 'lx', grading_period_id: 'mid' }
    expect(initialMapping(PLAIN_GB, prior)).toEqual({ component_id: '', grading_period_id: '' })
  })

  it('no longer guesses a quiz mapping from the component name', () => {
    const src = readFileSync(QUIZ_ROUTE, 'utf8')
    expect(src).not.toContain('suggestMapping')
  })
})

describe('laboratory components are only offered where they exist', () => {
  it('splits a laboratory class into two groups', () => {
    expect(hasLab(LAB_GB)).toBe(true)
    const lab = LAB_GB.components.filter((c) => componentTrack(c) === LAB)
    expect(lab.map((c) => c.name)).toEqual(['Lab Exercise', 'Lab Exam'])
  })

  it('offers a lecture-only class one flat list with no laboratory group', () => {
    expect(hasLab(PLAIN_GB)).toBe(false)
    expect(PLAIN_GB.components.every((c) => componentTrack(c) !== LAB)).toBe(true)
  })
})
