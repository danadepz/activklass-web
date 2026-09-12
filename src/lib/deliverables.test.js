import { describe, expect, it } from 'vitest'
import {
  KIND_LABEL, TASK_KINDS, STATES,
  parseWindowDate, taskHref, quizHref, assignedToStudent,
  fromQuiz, fromTask, stateOf, bucket, sortDeliverables, describeWindow,
  formatDay, formatTime,
} from './deliverables'

/* Every date here is a zone-less local string, exactly what the quiz builder
   and the task dialog write, and `NOW` is a local Date -- the tests hold in
   any zone because both sides are read the same way. */
const NOW = new Date(2026, 8, 15, 10, 0) // Tue 15 Sep 2026, 10:00 local

const quiz = (over = {}) => ({ id: 'q1', title: 'Quiz 1', status: 'published', topic_id: 't1', ...over })
const task = (over = {}) => ({
  id: 'k1', class_id: 'c1', kind: 'assignment', title: 'Assignment 1', topic_id: 't1', module_id: 'm1',
  status: 'published', ...over,
})
const finished = { status: 'submitted', attempt_number: 1 }
const inProgress = { status: 'in_progress', attempt_number: 1 }

describe('parseWindowDate', () => {
  it('reads the zone-less string as local time, as canStart does', () => {
    const d = parseWindowDate('2026-09-15T08:30')
    expect(d).toEqual(new Date(2026, 8, 15, 8, 30))
    expect(d.getTime()).toBe(new Date('2026-09-15T08:30').getTime())
  })
  it('is null for blanks, junk, and values this app never writes', () => {
    expect(parseWindowDate('')).toBeNull()
    expect(parseWindowDate('   ')).toBeNull()
    expect(parseWindowDate(null)).toBeNull()
    expect(parseWindowDate(undefined)).toBeNull()
    expect(parseWindowDate('soon')).toBeNull()
    expect(parseWindowDate(1_700_000_000_000)).toBeNull()
    expect(parseWindowDate({ seconds: 1 })).toBeNull()
  })
  it('hands a Date back untouched and drops an invalid one', () => {
    expect(parseWindowDate(NOW)).toBe(NOW)
    expect(parseWindowDate(new Date('nope'))).toBeNull()
  })
})

describe('links and labels', () => {
  it('a task opens the Modules tab at its sub-module; without one, just the tab', () => {
    expect(taskHref('c1', 't3')).toBe('/student/classes/c1?tab=topics&topic=t3')
    expect(taskHref('c1', null)).toBe('/student/classes/c1?tab=topics')
  })
  it('a quiz opens the player route', () => {
    expect(quizHref('c1', 'q9')).toBe('/student/classes/c1/quizzes/q9')
  })
  it('every kind has a label and the task kinds are the four the rules expect', () => {
    expect(KIND_LABEL).toEqual({ quiz: 'Quiz', activity: 'Activity', assignment: 'Assignment', exam: 'Exam', other: 'Task' })
    expect(TASK_KINDS).toEqual(['activity', 'assignment', 'exam', 'other'])
    expect(STATES).toHaveLength(6)
  })
  it('assignedToStudent matches the class page rule', () => {
    expect(assignedToStudent({}, 's1')).toBe(true)
    expect(assignedToStudent({ assigned_to: 'all' }, 's1')).toBe(true)
    expect(assignedToStudent({ assigned_to: ['s1'] }, 's1')).toBe(true)
    expect(assignedToStudent({ assigned_to: ['s2'] }, 's1')).toBe(false)
  })
})

describe('fromQuiz', () => {
  it('closes_at is the deadline, opens_at the opening, and the href is the player', () => {
    const d = fromQuiz(quiz({ opens_at: '2026-09-14T08:00', closes_at: '2026-09-19T23:59' }), { classId: 'c1', className: 'Science 9', now: NOW })
    expect(d).toMatchObject({
      id: 'q1', source: 'quiz', kind: 'quiz', title: 'Quiz 1', classId: 'c1', className: 'Science 9', topicId: 't1',
      opensAt: new Date(2026, 8, 14, 8, 0), dueAt: new Date(2026, 8, 19, 23, 59),
      done: false, closedByTeacher: false, state: 'open', href: '/student/classes/c1/quizzes/q1',
    })
  })
  it('a finished attempt makes it done', () => {
    expect(fromQuiz(quiz(), { classId: 'c1', attempts: [finished], now: NOW }).state).toBe('done')
    expect(fromQuiz(quiz(), { classId: 'c1', attempts: [{ status: 'graded' }], now: NOW }).state).toBe('done')
  })
  it('an attempt still in progress does not', () => {
    const d = fromQuiz(quiz(), { classId: 'c1', attempts: [inProgress], now: NOW })
    expect(d.done).toBe(false)
    expect(d.state).toBe('open')
  })
  it('a discarded attempt does not count either', () => {
    expect(fromQuiz(quiz(), { classId: 'c1', attempts: [{ status: 'discarded' }], now: NOW }).state).toBe('open')
  })
  it('a quiz the teacher closed is closed whatever its dates say', () => {
    const d = fromQuiz(quiz({ status: 'closed', closes_at: '2026-09-30T23:59' }), { classId: 'c1', now: NOW })
    expect(d.closedByTeacher).toBe(true)
    expect(d.state).toBe('closed')
  })
  it('done wins over closed: a finished quiz past its window is finished', () => {
    const d = fromQuiz(quiz({ closes_at: '2026-09-01T23:59' }), { classId: 'c1', attempts: [finished], now: NOW })
    expect(d.state).toBe('done')
  })
})

describe('fromTask', () => {
  it('normalises the document, keeps attachments and instructions, and links to the sub-module', () => {
    const d = fromTask(task({
      opens_at: '2026-09-14T08:00', due_at: '2026-09-19T23:59', points: '20',
      instructions_markdown: 'Do it.', attachments: [{ title: 'T', resource_type: 'link', url: 'https://x.ph/a' }],
    }), { className: 'Science 9', now: NOW })
    expect(d).toMatchObject({
      id: 'k1', source: 'task', kind: 'assignment', title: 'Assignment 1', classId: 'c1', className: 'Science 9',
      topicId: 't1', moduleId: 'm1', points: 20, instructions: 'Do it.', status: 'published',
      done: false, closedByTeacher: false, state: 'open', href: '/student/classes/c1?tab=topics&topic=t1',
    })
    expect(d.attachments).toHaveLength(1)
  })
  it('an unknown kind reads as other, and missing fields have safe defaults', () => {
    const d = fromTask({ id: 'k2', class_id: 'c1', kind: 'homework' }, { now: NOW })
    expect(d.kind).toBe('other')
    expect(d.title).toBe('Task')
    expect(d.points).toBeNull()
    expect(d.attachments).toEqual([])
    expect(d.instructions).toBe('')
    expect(d.status).toBe('draft')
    expect(d.opensAt).toBeNull()
    expect(d.dueAt).toBeNull()
    expect(d.href).toBe('/student/classes/c1?tab=topics')
  })
  it('points: blank and null are none; a number string is a number', () => {
    expect(fromTask(task({ points: null })).points).toBeNull()
    expect(fromTask(task({ points: '' })).points).toBeNull()
    expect(fromTask(task({ points: 'many' })).points).toBeNull()
    expect(fromTask(task({ points: 0 })).points).toBe(0)
  })
})

describe('stateOf', () => {
  const at = (opens, due, over = {}) => fromTask(task({ opens_at: opens, due_at: due, ...over }), { now: NOW })
  const qz = (opens, closes, over = {}) => fromQuiz(quiz({ opens_at: opens, closes_at: closes, ...over }), { classId: 'c1', now: NOW })

  it('scheduled: opens in the future', () => {
    expect(stateOf(at('2026-09-16T08:00', '2026-09-20T23:59'), NOW)).toBe('scheduled')
    expect(stateOf(qz('2026-09-16T08:00', '2026-09-20T23:59'), NOW)).toBe('scheduled')
  })
  it('open: opened, deadline later this week or none at all', () => {
    expect(stateOf(at('2026-09-14T08:00', '2026-09-18T23:59'), NOW)).toBe('open')
    expect(stateOf(at(null, null), NOW)).toBe('open')
    expect(stateOf(qz(null, null), NOW)).toBe('open')
  })
  it('due_today: the deadline falls on the local day of now', () => {
    expect(stateOf(at(null, '2026-09-15T23:59'), NOW)).toBe('due_today')
    expect(stateOf(qz('2026-09-10T08:00', '2026-09-15T17:00'), NOW)).toBe('due_today')
  })
  it('the day boundary: 23:59 tonight is today, 00:00 tomorrow is not', () => {
    expect(stateOf(at(null, '2026-09-15T23:59'), NOW)).toBe('due_today')
    expect(stateOf(at(null, '2026-09-16T00:00'), NOW)).toBe('open')
    // and 00:00 today, already past, is overdue -- not due today
    expect(stateOf(at(null, '2026-09-15T00:00'), NOW)).toBe('overdue')
    // the same for a quiz, whose past window is closed
    expect(stateOf(qz(null, '2026-09-15T00:00'), NOW)).toBe('closed')
  })
  it('overdue: a task past its deadline is late, not shut', () => {
    expect(stateOf(at('2026-09-01T08:00', '2026-09-14T23:59'), NOW)).toBe('overdue')
  })
  it('closed: only a quiz, past closes_at or closed by the teacher', () => {
    expect(stateOf(qz('2026-09-01T08:00', '2026-09-14T23:59'), NOW)).toBe('closed')
    expect(stateOf(qz(null, null, { status: 'closed' }), NOW)).toBe('closed')
    // a teacher-closed quiz whose opening is still ahead is closed, not scheduled
    expect(stateOf(qz('2026-09-20T08:00', null, { status: 'closed' }), NOW)).toBe('closed')
  })
  it('done: a quiz with a finished attempt, whatever the window', () => {
    const d = fromQuiz(quiz({ opens_at: '2026-09-20T08:00' }), { classId: 'c1', attempts: [finished], now: NOW })
    expect(stateOf(d, NOW)).toBe('done')
  })
  it('the exact closing minute is still open, as canStart has it', () => {
    const edge = new Date(2026, 8, 15, 17, 0)
    expect(stateOf(qz(null, '2026-09-15T17:00'), edge)).toBe('due_today')
    expect(stateOf(qz(null, '2026-09-15T17:00'), edge.getTime() + 1)).toBe('closed')
  })
  it('accepts now as a number or a Date', () => {
    const d = at(null, '2026-09-15T23:59')
    expect(stateOf(d, NOW.getTime())).toBe('due_today')
    expect(stateOf(d, NOW)).toBe('due_today')
  })
})

describe('bucket', () => {
  const items = [
    fromTask(task({ id: 'late', due_at: '2026-09-14T23:59' }), { now: NOW }),
    fromTask(task({ id: 'today', due_at: '2026-09-15T23:59' }), { now: NOW }),
    fromTask(task({ id: 'week', due_at: '2026-09-19T23:59' }), { now: NOW }),
    fromTask(task({ id: 'week-edge', due_at: '2026-09-21T23:59' }), { now: NOW }),
    fromTask(task({ id: 'next', due_at: '2026-09-22T00:00' }), { now: NOW }),
    fromTask(task({ id: 'undated' }), { now: NOW }),
    fromTask(task({ id: 'soon', opens_at: '2026-09-16T08:00', due_at: '2026-09-25T23:59' }), { now: NOW }),
    fromQuiz(quiz({ id: 'missed', closes_at: '2026-09-10T23:59' }), { classId: 'c1', now: NOW }),
    fromQuiz(quiz({ id: 'finished', closes_at: '2026-09-18T23:59' }), { classId: 'c1', attempts: [finished], now: NOW }),
  ]
  const ids = (list) => list.map((d) => d.id)

  it('puts each item in the section the student expects', () => {
    const b = bucket(items, NOW)
    expect(ids(b.overdue)).toEqual(['missed', 'late'])
    expect(ids(b.today)).toEqual(['today'])
    expect(ids(b.thisWeek)).toEqual(['week', 'week-edge'])
    expect(ids(b.later)).toEqual(['next', 'undated'])
    expect(ids(b.notYetOpen)).toEqual(['soon'])
    expect(ids(b.done)).toEqual(['finished'])
  })
  it('a closed quiz nobody took sits with the overdue work, chip still saying Closed', () => {
    const b = bucket(items, NOW)
    expect(describeWindow(b.overdue[0], NOW)).toBe('Closed Thu 10 Sep')
  })
  it('undated tasks go to later, after the dated ones', () => {
    const b = bucket([items[5], items[4]], NOW)
    expect(ids(b.later)).toEqual(['next', 'undated'])
  })
  it('sorts by deadline, then opening, then title, and leaves the input alone', () => {
    const a = fromTask(task({ id: 'a', title: 'B', opens_at: '2026-09-14T09:00' }), { now: NOW })
    const b = fromTask(task({ id: 'b', title: 'A', opens_at: '2026-09-14T09:00' }), { now: NOW })
    const c = fromTask(task({ id: 'c', title: 'C', opens_at: '2026-09-14T08:00' }), { now: NOW })
    const d = fromTask(task({ id: 'd', title: 'D', due_at: '2026-09-30T08:00' }), { now: NOW })
    const input = [a, b, c, d]
    expect(ids(sortDeliverables(input))).toEqual(['d', 'c', 'b', 'a'])
    expect(ids(input)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('recomputes state against the now it is given, not the one the item was built with', () => {
    const later = new Date(2026, 8, 16, 10, 0)
    const b = bucket(items, later)
    expect(ids(b.overdue)).toEqual(['missed', 'late', 'today'])
    expect(ids(b.notYetOpen)).toEqual([])
    expect(ids(b.thisWeek)).toEqual(['week', 'week-edge', 'next'])
  })
  it('an empty or missing list is six empty sections', () => {
    expect(bucket([], NOW)).toEqual({ overdue: [], today: [], thisWeek: [], later: [], notYetOpen: [], done: [] })
    expect(bucket(undefined, NOW)).toEqual({ overdue: [], today: [], thisWeek: [], later: [], notYetOpen: [], done: [] })
  })
})

describe('describeWindow', () => {
  const at = (opens, due, over = {}) => fromTask(task({ opens_at: opens, due_at: due, ...over }), { now: NOW })
  const qz = (opens, closes, over = {}) => fromQuiz(quiz({ opens_at: opens, closes_at: closes, ...over }), { classId: 'c1', now: NOW })

  it('one sentence per state, in words a teacher would use', () => {
    expect(describeWindow(at('2026-09-16T08:00', '2026-09-20T23:59'), NOW)).toBe('Opens Wed 16 Sep, 8:00 AM')
    expect(describeWindow(at(null, '2026-09-19T23:59'), NOW)).toBe('Due Sat 19 Sep, 11:59 PM')
    expect(describeWindow(at(null, '2026-09-15T23:59'), NOW)).toBe('Due today, 11:59 PM')
    expect(describeWindow(at(null, '2026-09-14T23:59'), NOW)).toBe('Overdue since Mon 14 Sep')
    expect(describeWindow(qz(null, '2026-09-11T17:00'), NOW)).toBe('Closed Fri 11 Sep')
    expect(describeWindow(fromQuiz(quiz(), { classId: 'c1', attempts: [finished], now: NOW }), NOW)).toBe('Done')
  })
  it('undated: no deadline; teacher-closed with the window still ahead: just Closed', () => {
    expect(describeWindow(at(null, null), NOW)).toBe('No deadline')
    expect(describeWindow(qz(null, null, { status: 'closed' }), NOW)).toBe('Closed')
    expect(describeWindow(qz(null, '2026-09-30T23:59', { status: 'closed' }), NOW)).toBe('Closed')
  })
  it('midnight reads as 12:00 AM and noon as 12:00 PM', () => {
    expect(describeWindow(at(null, '2026-09-16T00:00'), NOW)).toBe('Due Wed 16 Sep, 12:00 AM')
    expect(describeWindow(at(null, '2026-09-16T12:00'), NOW)).toBe('Due Wed 16 Sep, 12:00 PM')
  })
  it('names the year only when it is not this one', () => {
    expect(describeWindow(at(null, '2027-01-08T08:00'), NOW)).toBe('Due Fri 8 Jan 2027, 8:00 AM')
    expect(formatDay(new Date(2026, 8, 15), NOW)).toBe('Tue 15 Sep')
    expect(formatTime(new Date(2026, 8, 15, 23, 5))).toBe('11:05 PM')
  })
  it('never contains vendor or error words', () => {
    const all = [
      at('2026-09-16T08:00', null), at(null, '2026-09-19T23:59'), at(null, '2026-09-15T23:59'),
      at(null, '2026-09-14T23:59'), qz(null, '2026-09-11T17:00'), at(null, null), qz(null, null, { status: 'closed' }),
    ].map((d) => describeWindow(d, NOW))
    for (const s of all) expect(s).not.toMatch(/firebase|firestore|error|failed|undefined|null|NaN|Invalid/i)
  })
})
