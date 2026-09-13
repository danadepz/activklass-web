/**
 * The teacher's Modules tab: the student's tree, with the class's tasks under
 * each sub-module. Static markup, the house pattern -- every read is
 * hard-coded through the hooks the page calls.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ modules: null, tasks: [], quizzes: [], tasksFailed: false, submissions: [], roster: [] }))

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('@/lib/classTasks', () => ({
  classTasksKey: (id) => ['fs-class-tasks', id],
  createTask: vi.fn(), updateTask: vi.fn(), publishTask: vi.fn(), deleteTask: vi.fn(),
  uploadTaskFile: vi.fn(), newTaskId: () => 'new-id',
}))
vi.mock('@/hooks/useQuizzes', () => ({ useQuizzes: () => ({ data: state.quizzes }) }))
vi.mock('@/hooks/useTaskSubmissions', () => ({
  useTaskSubmissions: () => ({ data: state.submissions, isError: false }),
  taskSubmissionsKey: (c, t) => ['fs-task-submissions', c, t],
}))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn(async () => []), IN_CHUNK: 10 }))
vi.mock('@/hooks/useClassTasks', () => ({
  useClassTasks: () => ({ data: state.tasks, isError: state.tasksFailed }),
  classTasksKey: (id) => ['fs-class-tasks', id],
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: ({ queryKey }) => queryKey?.[0] === 'fs-class-roster-lite'
    ? { data: state.roster, isLoading: false, isError: false }
    : { data: state.modules, isLoading: false, isError: false },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ classId: 'C1' }),
  useNavigate: () => vi.fn(),
}))

import ModulesPage, { SubmissionsList, TaskDialog } from './modules.jsx'

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
  state.submissions = []
  state.roster = []
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

/* The submission bin (plan section 9, S-3): the teacher's side. */
describe('the submission bin on the Modules tab', () => {
  const roster = [
    { id: 'S1', first_name: 'Hana', last_name: 'Lorenzo' },
    { id: 'S2', first_name: 'Carlo', last_name: 'Reyes' },
    { id: 'S3', first_name: 'Mika', last_name: 'Solano' },
  ]
  const accepting = { ...base, id: 'lab', title: 'Pendulum lab', status: 'published', due_at: '2026-09-19T23:59', accepts_submissions: true }
  const hana = { id: 'lab_S1', task_id: 'lab', class_id: 'C1', student_id: 'S1', submitted_at: new Date(2026, 8, 19, 15, 12), attachment: { title: 'My doc', resource_type: 'link', url: 'https://docs.google.com/d/x' }, note: 'Repeated the 60 cm run.', resubmitted_count: 1 }

  it('a published task whose bin is open shows the count chip, closed; one whose bin is off shows none', () => {
    state.roster = roster
    state.submissions = [hana]
    state.tasks = [accepting, { ...base, id: 'nobin', title: 'No bin', status: 'published', accepts_submissions: false }]
    const html = render()
    expect(html.split('data-testid="submissions-chip"').length - 1).toBe(1)
    expect(html).toContain('1 of 3 submitted')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('data-testid="submissions-list"')
  })

  it('a draft never shows the chip, even with the box ticked', () => {
    state.tasks = [{ ...accepting, status: 'draft' }]
    expect(render()).not.toContain('data-testid="submissions-chip"')
  })

  it('the list names every student on the roster: the one who handed in with when, her link and note; the rest greyed as not yet', () => {
    state.submissions = [hana]
    const html = renderToStaticMarkup(<MemoryRouter><SubmissionsList classId="C1" task={accepting} roster={roster} now={NOW} /></MemoryRouter>)
    const rows = html.match(/data-testid="submission-row"[^>]*>/g) ?? []
    expect(rows).toHaveLength(3)
    expect(html.split('data-submitted="true"').length - 1).toBe(1)
    expect(html.split('data-submitted="false"').length - 1).toBe(2)
    expect(html).toContain('Lorenzo, Hana')
    expect(html).toContain('Submitted · Sat 19 Sep, 3:12 PM')
    expect(html).not.toContain('· late')
    expect(html).toContain('https://docs.google.com/d/x')
    expect(html).toContain('Repeated the 60 cm run.')
    expect(html).toContain('re-submitted ×1')
    expect(html).toContain('— not yet')
    expect(html).toContain('/teacher/classes/C1/record')
    // nothing is graded here
    expect(html).not.toMatch(/score|mark|grade<|points/i)
  })

  it('says late when the hand-in came after the deadline', () => {
    state.submissions = [{ ...hana, submitted_at: new Date(2026, 8, 20, 8, 5) }]
    const html = renderToStaticMarkup(<MemoryRouter><SubmissionsList classId="C1" task={accepting} roster={roster} now={NOW} /></MemoryRouter>)
    expect(html).toContain('Submitted · Sun 20 Sep, 8:05 AM · late')
  })

  const dialog = (kind, task = null) => renderToStaticMarkup(
    <MemoryRouter><TaskDialog classId="C1" clazz={{ id: 'C1', student_ids: ['S1'] }} syllabusId="syl1" module={syllabus.modules[0]} topic={syllabus.modules[0].topics[0]} task={task} kind={kind} teacherId="T1" onClose={() => {}} onSaved={() => {}} /></MemoryRouter>,
  )

  it('the dialog offers "Accept submissions through the app", unticked, for a new activity', () => {
    const html = dialog('activity')
    expect(html).toContain('Accept submissions through the app')
    expect(html).toMatch(/<input type="checkbox" id="task-accepts-submissions"(?![^>]*checked)/)
    expect(html).toContain('grading stays in the class record')
  })

  it('hides the box for a paper exam', () => {
    expect(dialog('exam')).not.toContain('Accept submissions through the app')
  })

  it('opens ticked on a task whose bin is open, and says unticking closes it', () => {
    const html = dialog('assignment', accepting)
    expect(html).toMatch(/<input type="checkbox" id="task-accepts-submissions"[^>]*checked/)
    expect(html).toContain('unticking is how the bin closes')
  })
})
