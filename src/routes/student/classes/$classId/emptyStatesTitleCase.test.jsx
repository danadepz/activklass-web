/**
 * T-189 (andecobs-297, maykel_64440-303), casing round six: rounds one
 * through four swept admin and teacher; nobody had swept the student
 * portal. Derick's four empty states on the class tabs were sentence
 * case -- "No modules yet", "No analytics yet", "No attendance recorded",
 * "No grades yet" -- and so was the fifth Empty on this page, "No quizzes
 * yet" (not in his list, found by reading the file rather than trusting
 * it). docs/UI-COPY.md section 2.6 calls an empty-state heading Title
 * Case; the helper sentence under each stays sentence case (section 3.2,
 * T-178's done-means).
 *
 * Static markup, the droppedClass.test.jsx pattern: one render per tab,
 * with the data shaped to hit that tab's empty branch.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'

const view = vi.hoisted(() => ({ data: null }))

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'S1', role: 'student', first_name: 'Carlo', last_name: 'Mendoza' } }),
}))
vi.mock('@/lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: () => ({ data: view.data, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ classId: 'C1' }),
}))

const StudentClassDetail = (await import('./index.jsx')).default

const base = {
  clazz: { id: 'C1', subject: 'Science 9', section: 'Newton', student_ids: ['S1'] },
  teacher: null, entry: null, attendance: [], contestsByDate: {}, gradeContestsByAssessment: {},
  syllabus: null, announcements: [], announcementsTotal: 0, quizzes: [], attemptsByQuiz: {},
  scaffoldedTopicIds: new Set(), tasks: [], submissionByTask: {}, dropped: false,
}
const emptyAttendance = { log: [], tally: { present: 0, late: 0, absent: 0, excused: 0 }, rate: null }

function page(tab, extra = {}) {
  view.data = { ...base, ...extra }
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/student/classes/C1?tab=${tab}`]}><StudentClassDetail /></MemoryRouter>,
  )
}

describe('Empty-state headings -- Title Case, helper sentence untouched', () => {
  it('Modules: "No Modules Yet", and the helper sentence stays sentence case', () => {
    const html = page('topics', { syllabus: null })
    expect(html).toContain('No Modules Yet')
    expect(html).toContain('Your teacher hasn')
    expect(html).toContain('t published the modules and sub-modules for this class.')
  })

  it('Quizzes: "No Quizzes Yet"', () => {
    const html = page('quizzes', { quizzes: [] })
    expect(html).toContain('No Quizzes Yet')
  })

  it('Grade Center: "No Grades Yet"', () => {
    const html = page('grades', { entry: null })
    expect(html).toContain('No Grades Yet')
  })

  it('Analytics: "No Analytics Yet"', () => {
    const html = page('analytics', { entry: null })
    expect(html).toContain('No Analytics Yet')
  })

  it('Attendance: "No Attendance Recorded"', () => {
    const html = page('attendance', { attendance: emptyAttendance })
    expect(html).toContain('No Attendance Recorded')
  })
})
