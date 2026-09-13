import { describe, expect, it } from 'vitest'
import {
  assessmentFromTask,
  assessmentIdForTask,
  suggestComponent,
  suggestMapping,
  suggestPeriod,
  taskCountsTowardRecord,
} from './recordMapping'

const deped = [
  { id: 'ww', name: 'Written Works' },
  { id: 'pt', name: 'Performance Tasks' },
  { id: 'qa', name: 'Quarterly Assessment' },
]
const ched = [
  { id: 'cs', name: 'Class Standing' },
  { id: 'me', name: 'Major Exam' },
]

describe('suggestComponent', () => {
  it('sends a quiz to Written Works, an activity or assignment to Performance Tasks, an exam to Quarterly Assessment', () => {
    expect(suggestComponent(deped, 'quiz').id).toBe('ww')
    expect(suggestComponent(deped, 'activity').id).toBe('pt')
    expect(suggestComponent(deped, 'assignment').id).toBe('pt')
    expect(suggestComponent(deped, 'exam').id).toBe('qa')
  })

  it('on a CHED setup sends a quiz and an activity to Class Standing and an exam to Major Exam', () => {
    expect(suggestComponent(ched, 'quiz').id).toBe('cs')
    expect(suggestComponent(ched, 'activity').id).toBe('cs')
    expect(suggestComponent(ched, 'exam').id).toBe('me')
  })

  it('prefers a component actually named Quizzes over Written Works', () => {
    const custom = [{ id: 'a', name: 'Written Works' }, { id: 'b', name: 'Quizzes' }]
    expect(suggestComponent(custom, 'quiz').id).toBe('b')
  })

  it('falls back to the first component when no name fits, and to null with none', () => {
    const odd = [{ id: 'x', name: 'Alpha' }, { id: 'y', name: 'Beta' }]
    expect(suggestComponent(odd, 'exam').id).toBe('x')
    expect(suggestComponent(odd, 'other').id).toBe('x')
    expect(suggestComponent([], 'quiz')).toBeNull()
  })
})

describe('suggestPeriod', () => {
  it('picks the first period that is not locked', () => {
    const periods = [{ id: 'p1', locked: true }, { id: 'p2' }, { id: 'p3' }]
    expect(suggestPeriod(periods).id).toBe('p2')
  })
  it('falls back to the first when all are locked', () => {
    expect(suggestPeriod([{ id: 'p1', locked: true }, { id: 'p2', locked: true }]).id).toBe('p1')
  })
})

describe('suggestMapping', () => {
  const gb = { configured: true, components: deped, periods: [{ id: 'q1', locked: true }, { id: 'q2' }] }
  it('returns the component and period ids', () => {
    expect(suggestMapping(gb, 'exam')).toEqual({ component_id: 'qa', grading_period_id: 'q2' })
  })
  it('is null when the gradebook is not configured', () => {
    expect(suggestMapping({ configured: false, components: deped, periods: gb.periods }, 'quiz')).toBeNull()
    expect(suggestMapping(null, 'quiz')).toBeNull()
    expect(suggestMapping({ configured: true, components: [], periods: gb.periods }, 'quiz')).toBeNull()
  })
})

describe('the record column a task creates', () => {
  const task = { id: 't1', title: 'Lab report 1', kind: 'assignment', points: 20, due_at: '2026-09-20T17:00', component_id: 'pt', grading_period_id: 'q1' }

  it('needs a component, a period and positive points', () => {
    expect(taskCountsTowardRecord(task)).toBe(true)
    expect(taskCountsTowardRecord({ ...task, points: '' })).toBe(false)
    expect(taskCountsTowardRecord({ ...task, points: 0 })).toBe(false)
    expect(taskCountsTowardRecord({ ...task, component_id: null })).toBe(false)
    expect(taskCountsTowardRecord({ ...task, grading_period_id: '' })).toBe(false)
  })

  it('has a derived id, so a re-publish merges into the same row', () => {
    expect(assessmentIdForTask('t1')).toBe('task-t1')
  })

  it('carries title, component, period, kind, points, the deadline date and the source, and no scores', () => {
    expect(assessmentFromTask(task)).toEqual({
      title: 'Lab report 1',
      component_id: 'pt',
      period_id: 'q1',
      kind: 'assignment',
      total_points: 20,
      date_given: '2026-09-20',
      source_task_id: 't1',
    })
    expect('scores' in assessmentFromTask(task)).toBe(false)
    expect(assessmentFromTask({ ...task, due_at: null }).date_given).toBeNull()
  })
})
