/**
 * The class page's Modules and Quizzes tabs read a window the way
 * lib/deliverables does: a published task sits under its own sub-module with
 * the kind, the chip, its attachment and a way to read the instructions; a
 * quiz carries the same chip in both tabs, and the Quizzes card's badge and
 * button follow stateOf -- not open yet, closed, due today. Static markup,
 * the remediation.test.jsx pattern: every read is mocked through useQuery.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { describeWindow, fromQuiz, fromTask } from '@/lib/deliverables'

const state = vi.hoisted(() => ({ data: null }))

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'S1', role: 'student', first_name: 'Carlo', last_name: 'Mendoza' } }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/studentData', () => ({
  loadSyllabus: vi.fn(), loadStudentEntry: vi.fn(), loadStudentAttendance: vi.fn(),
  loadStudentContests: vi.fn(), loadStudentGradeContests: vi.fn(),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: () => ({ data: state.data, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import StudentClassDetail from './index.jsx'

const syllabus = {
  modules: [
    { id: 'm1', title: 'Doing Science', topics: [{ id: 't1', title: 'The Scientific Method' }, { id: 't2', title: 'Measurement', resources: [{ id: 'r1', title: 'Lab handout', resource_type: 'link', url: 'https://example.org/handout' }] }] },
    { id: 'm2', title: 'Matter and Its Properties', topics: [{ id: 't3', title: 'Atomic Structure' }, { id: 't4', title: 'The Periodic Table' }] },
  ],
}

const soon = new Date()
soon.setDate(soon.getDate() + 3)
const past = new Date()
past.setDate(past.getDate() - 3)
const local = (d, h, m) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

const tasks = [
  {
    id: 'demo-task-sci9-1', class_id: 'demo-sci9-newton', module_id: 'm1', topic_id: 't2', kind: 'activity', status: 'published',
    title: 'Activity 2 - Pendulum Measurement Lab', points: 20, due_at: local(soon, 23, 59),
    instructions_markdown: 'Measure the period at **three** string lengths.',
    attachments: [{ title: 'PhET Pendulum Lab (simulation)', resource_type: 'link', url: 'https://phet.colorado.edu/en/simulations/pendulum-lab' }],
  },
  {
    id: 'demo-task-sci9-2', class_id: 'demo-sci9-newton', module_id: 'm2', topic_id: 't4', kind: 'exam', status: 'published',
    title: 'Quarter 2 Examination (written, in class)', due_at: local(past, 8, 0), instructions_markdown: '', attachments: [],
  },
]

const quizzes = [
  { id: 'q-open', title: 'Quiz on measurement', status: 'published', topic_id: 't2', questions: [{ points: 1 }], closes_at: local(soon, 17, 0), attempts_allowed: 1 },
  { id: 'q-later', title: 'Quiz opening later', status: 'published', topic_id: 't3', questions: [{ points: 1 }], opens_at: local(soon, 8, 0), attempts_allowed: 1 },
  { id: 'q-past', title: 'Quiz that closed', status: 'published', topic_id: 't1', questions: [{ points: 1 }], closes_at: local(past, 17, 0), attempts_allowed: 1 },
  { id: 'q-today', title: 'Quiz due today', status: 'published', topic_id: null, questions: [{ points: 1 }], closes_at: local(new Date(), 23, 59), attempts_allowed: 1 },
]

const render = (url, extra = {}) => {
  state.data = {
    clazz: { id: 'demo-sci9-newton', subject: 'Science 9', section: 'Newton', student_ids: ['S1'] },
    teacher: null, entry: null, attendance: [], contestsByDate: {}, gradeContestsByAssessment: {},
    syllabus, announcements: [], quizzes, attemptsByQuiz: {}, scaffoldedTopicIds: new Set(), tasks,
    ...extra,
  }
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/student/classes/:classId" element={<StudentClassDetail />} /></Routes>
    </MemoryRouter>,
  )
}

const between = (html, startId, endId) => {
  const a = html.indexOf(`id="${startId}"`)
  const b = endId ? html.indexOf(`id="${endId}"`) : html.length
  return html.slice(a, b)
}

describe('Modules tab -- class tasks under their sub-module', () => {
  const html = render('/student/classes/demo-sci9-newton?tab=topics&topic=t2')

  it('lists each published task under the sub-module its topic_id names, and nowhere else', () => {
    const t2 = between(html, 'topic-t2', 'topic-t3')
    expect(t2).toContain('data-task-id="demo-task-sci9-1"')
    expect(t2).toContain('Activity · 20 pts')
    expect(t2).toContain('Activity 2 - Pendulum Measurement Lab')
    expect(t2).not.toContain('demo-task-sci9-2')
    const t4 = between(html, 'topic-t4', null)
    expect(t4).toContain('data-task-id="demo-task-sci9-2"')
    expect(t4).toContain('>Exam<')
    expect((html.match(/data-task-id=/g) ?? []).length).toBe(2)
  })

  it('shows the describeWindow chip on the task and on the quiz beside it', () => {
    const t2 = between(html, 'topic-t2', 'topic-t3')
    expect(t2).toContain(describeWindow(fromTask(tasks[0])))
    expect(t2).toContain(describeWindow(fromQuiz(quizzes[0], { classId: 'demo-sci9-newton' })))
    const t4 = between(html, 'topic-t4', null)
    expect(t4).toContain(describeWindow(fromTask(tasks[1])))
    expect(t4).toContain('data-state="overdue"')
  })

  it('renders the attachment as a material row and offers the instructions', () => {
    const t2 = between(html, 'topic-t2', 'topic-t3')
    expect(t2).toContain('PhET Pendulum Lab (simulation)')
    expect(t2).toContain('>Link<')
    expect(t2).toContain('Read instructions')
    // The exam has no instructions and no attachment: nothing to read, nothing to open.
    const t4 = between(html, 'topic-t4', null)
    expect(t4).not.toContain('Read instructions')
  })

  it('keeps the anchor the task deep link lands on', () => {
    expect(html).toContain('id="topic-t2"')
  })

  it('still shows the modules when the task read failed and there are no tasks', () => {
    const none = render('/student/classes/demo-sci9-newton?tab=topics', { tasks: [] })
    expect(none).toContain('id="topic-t2"')
    expect(none).not.toContain('data-task-id')
    const missing = render('/student/classes/demo-sci9-newton?tab=topics', { tasks: undefined })
    expect(missing).toContain('id="topic-t2"')
  })
})

describe('Quizzes tab -- the card state follows stateOf', () => {
  const html = render('/student/classes/demo-sci9-newton?tab=quizzes')
  // Each card is a <div data-state=…>; the chip inside it is a <span>.
  const card = (id) => html.split('<div data-state=').find((s) => s.includes(id))

  it('marks a quiz that has not opened, one that closed, and one due today', () => {
    expect(card('Quiz opening later')).toMatch(/^"scheduled"/)
    expect(card('Quiz opening later')).toContain('Not open yet')
    expect(card('Quiz opening later')).toContain('Opens later')
    expect(card('Quiz opening later')).not.toContain('Take quiz')

    expect(card('Quiz that closed')).toMatch(/^"closed"/)
    expect(card('Quiz that closed')).toContain('Not taken')
    expect(card('Quiz that closed')).not.toContain('Take quiz')

    expect(card('Quiz due today')).toMatch(/^"due_today"/)
    expect(card('Quiz due today')).toContain('Due today,')
    expect(card('Quiz due today')).toContain('Take quiz')

    expect(card('Quiz on measurement')).toMatch(/^"open"/)
    expect(card('Quiz on measurement')).toContain('Take quiz')
  })

  it('shows the describeWindow sentence on every card, exactly once each', () => {
    for (const q of quizzes) {
      const sentence = describeWindow(fromQuiz(q, { classId: 'demo-sci9-newton' }))
      expect(card(q.title)).toContain(sentence)
    }
    // The badge does not repeat the chip: "Closed" appears in the chip only.
    expect((card('Quiz that closed').match(/>Closed[^<]*</g) ?? []).length).toBe(1)
  })
})
