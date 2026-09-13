/**
 * The teacher's Modules tab: the student's tree, with the class's tasks under
 * each sub-module. Static markup, the house pattern -- every read is
 * hard-coded through the hooks the page calls.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ modules: null, tasks: [], quizzes: [], tasksFailed: false }))

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('@/lib/classTasks', () => ({
  classTasksKey: (id) => ['fs-class-tasks', id],
  createTask: vi.fn(), updateTask: vi.fn(), publishTask: vi.fn(), deleteTask: vi.fn(),
  uploadTaskFile: vi.fn(), newTaskId: () => 'new-id',
}))
vi.mock('@/hooks/useQuizzes', () => ({ useQuizzes: () => ({ data: state.quizzes }) }))
vi.mock('@/hooks/useClassTasks', () => ({
  useClassTasks: () => ({ data: state.tasks, isError: state.tasksFailed }),
  classTasksKey: (id) => ['fs-class-tasks', id],
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: () => ({ data: state.modules, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ classId: 'C1' }),
  useNavigate: () => vi.fn(),
}))

import ModulesPage from './modules.jsx'

/* The day boundary the states turn on. `now` is fixed so the sentence
   describeWindow prints is the same on every run. */
const NOW = new Date(2026, 8, 15, 10, 0) // Tue 15 Sep 2026, 10:00
vi.useFakeTimers()
vi.setSystemTime(NOW)

const syllabus = {
  modules: [
    {
      id: 'm1', title: 'Doing Science',
      topics: [
        { id: 't1', title: 'The Scientific Method', resources: [{ id: 'r1', title: 'Lecture slides', resource_type: 'link', url: 'https://example.com/slides' }] },
        { id: 't2', title: 'Measurement', resources: [] },
      ],
    },
    { id: 'm2', title: 'Matter', published: false, topics: [{ id: 't3', title: 'Atomic Structure' }] },
  ],
}

const base = { class_id: 'C1', teacher_id: 'T1', topic_id: 't1', module_id: 'm1', kind: 'assignment', instructions_markdown: '', attachments: [] }

function render() {
  return renderToStaticMarkup(<MemoryRouter><ModulesPage /></MemoryRouter>)
}

beforeEach(() => {
  state.modules = { clazz: { id: 'C1', student_ids: ['S1'] }, syllabusId: 'syl1', syllabus }
  state.tasks = []
  state.quizzes = []
  state.tasksFailed = false
})

describe('the tree', () => {
  it('numbers modules and sub-modules the way the student Modules tab does, and marks a hidden module', () => {
    const html = render()
    expect(html).toContain('Module 1 · Doing Science')
    expect(html).toContain('Sub-module 1 · The Scientific Method')
    expect(html).toContain('Sub-module 2 · Measurement')
    expect(html).toContain('Module 2 · Matter')
    expect(html).toContain('Hidden from students')
  })

  it('lists a material read-only with its icon and one link to the Syllabus page, and says when a sub-module is empty', () => {
    const html = render()
    expect(html).toContain('🔗') // RESOURCE_META.link
    expect(html).toContain('href="https://example.com/slides"')
    expect(html).toContain('Edit materials on the Syllabus page')
    expect(html).toContain('href="/teacher/syllabus"')
    // Measurement and Atomic Structure have nothing under them.
    expect(html.split('Nothing here yet for this class.').length - 1).toBe(2)
  })

  it('offers + Add on every sub-module with the four kinds, Exam labelled paper', () => {
    const html = render()
    expect(html.split('+ Add').length - 1).toBe(3)
  })

  it('shows a linked quiz under its sub-module with the window chip', () => {
    state.quizzes = [
      { id: 'q1', title: 'Method quiz', class_ids: ['C1'], topic_id: 't1', status: 'published', opens_at: '2026-09-14T08:00', closes_at: '2026-09-19T23:59' },
      { id: 'q2', title: 'Other class quiz', class_ids: ['C9'], topic_id: 't1', status: 'published' },
    ]
    const html = render()
    expect(html).toContain('Method quiz')
    expect(html).toContain('href="/teacher/quizzes/q1"')
    expect(html).toContain('Due Sat 19 Sep, 11:59 PM')
    expect(html).not.toContain('Other class quiz')
  })

  it('says no modules when the class has no syllabus', () => {
    state.modules = { clazz: { id: 'C1' }, syllabusId: null, syllabus: null }
    const html = render()
    expect(html).toContain('No modules yet for this class.')
  })
})

describe('task rows', () => {
  const row = (html) => html.match(/<div[^>]*data-testid="task-row"[^>]*>[\s\S]*?<\/div><\/div>/)?.[0] ?? ''

  it('draft: kind, title, Draft badge, no deadline, Edit and Delete', () => {
    state.tasks = [{ ...base, id: 'a', title: 'Lab report 1', status: 'draft', opens_at: null, due_at: null }]
    const html = render()
    expect(html).toContain('data-status="draft"')
    expect(html).toContain('data-testid="draft-badge"')
    expect(html).toContain('Assignment')
    expect(html).toContain('Lab report 1')
    expect(html).toContain('No deadline')
    expect(row(html)).toContain('>Edit<')
    expect(row(html)).toContain('>Delete<')
  })

  it('scheduled: opens in the future', () => {
    state.tasks = [{ ...base, id: 'b', title: 'Seatwork', kind: 'activity', status: 'published', opens_at: '2026-09-16T08:00', due_at: '2026-09-18T17:00' }]
    const html = render()
    expect(html).toContain('data-state="scheduled"')
    expect(html).toContain('Opens Wed 16 Sep, 8:00 AM')
    expect(html).not.toContain('data-testid="draft-badge"')
    expect(html).toContain('Activity')
  })

  it('open: due later this week, with points and attachment icons', () => {
    state.tasks = [{
      ...base, id: 'c', title: 'Paper exam', kind: 'exam', status: 'published', points: 50,
      opens_at: '2026-09-14T08:00', due_at: '2026-09-18T17:00',
      attachments: [
        { title: 'Reviewer', resource_type: 'file', url: 'https://firebasestorage.googleapis.com/v0/b/x/o/reviewer.pdf' },
        { title: 'Coverage', resource_type: 'link', url: 'https://example.com/coverage' },
      ],
    }]
    const html = render()
    expect(html).toContain('data-state="open"')
    expect(html).toContain('Due Fri 18 Sep, 5:00 PM')
    expect(html).toContain('50 pts')
    expect(html).toContain('aria-label="File: Reviewer"')
    expect(html).toContain('aria-label="Link: Coverage"')
    expect(html).toContain('Exam')
  })

  it('overdue: past its deadline, still listed and still editable -- never closed', () => {
    state.tasks = [{ ...base, id: 'd', title: 'Late one', status: 'published', opens_at: '2026-09-01T08:00', due_at: '2026-09-10T17:00' }]
    const html = render()
    expect(html).toContain('data-state="overdue"')
    expect(html).toContain('Overdue since Thu 10 Sep')
    expect(html).not.toContain('Closed')
    expect(row(html)).toContain('>Edit<')
  })

  it('a task whose sub-module is gone is still shown, under its own heading', () => {
    state.tasks = [{ ...base, id: 'e', title: 'Orphan', topic_id: 'gone', status: 'published', due_at: '2026-09-18T17:00' }]
    const html = render()
    expect(html).toContain('Not under a sub-module')
    expect(html).toContain('Orphan')
  })

  it('a failed task read does not blank the modules', () => {
    state.tasksFailed = true
    const html = render()
    expect(html).toContain('could not be loaded')
    expect(html).toContain('Module 1 · Doing Science')
  })
})
