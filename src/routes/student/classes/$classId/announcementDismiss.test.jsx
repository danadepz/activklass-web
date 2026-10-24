/**
 * T-195 (andecobs-299), owner decision (b): a student can dismiss a read
 * announcement from their own class Announcements tab. Per-student only --
 * the teacher's announcement and every other student's list are untouched,
 * and there is deliberately no student-side Delete (that stays the
 * teacher's own confirm-dialog act).
 *
 * `dismissAnnouncement` is tested directly against a mocked
 * `firebase/firestore`, the taskSubmissions.test.js pattern -- the write
 * server-side isolation (a student cannot write another student's marker)
 * is proved for real against the rules engine in
 * ../../../lib/firestoreRules.test.js. The tab's markup is checked the
 * droppedClass.test.jsx / deliverables.test.jsx way: one static render per
 * state, through the real StudentClassDetail component.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const view = vi.hoisted(() => ({ data: null }))
const writes = vi.hoisted(() => [])

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'S1', role: 'student', first_name: 'Carlo', last_name: 'Mendoza' } }),
}))
vi.mock('@/lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal()),
  doc: (_db, ...parts) => ({ path: parts.join('/') }),
  setDoc: async (ref, data) => { writes.push([ref.path, data]) },
  serverTimestamp: () => 'TS',
}))
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
const { announcementDismissalId, dismissAnnouncement } = await import('./index.jsx')

beforeEach(() => { writes.length = 0 })

function page({ announcements = [], announcementsTotal = announcements.length } = {}) {
  view.data = {
    clazz: { id: 'C1', subject: 'Science 9', section: 'Newton', student_ids: ['S1'] },
    teacher: null, entry: null, attendance: [], contestsByDate: {}, gradeContestsByAssessment: {},
    syllabus: null, announcements, announcementsTotal, quizzes: [], attemptsByQuiz: {}, scaffoldedTopicIds: new Set(),
    tasks: [], submissionByTask: {}, dropped: false,
  }
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={['/student/classes/C1?tab=announcements']}><StudentClassDetail /></MemoryRouter>,
  )
  return html
}

const ann1 = { id: 'ann-1', title: 'Quiz on Monday', body: 'Bring a calculator.', created_at: { seconds: 1760000000 } }
const ann2 = { id: 'ann-2', title: 'Field trip form due', body: 'Return the slip by Friday.', created_at: { seconds: 1760100000 } }

describe('announcementDismissalId', () => {
  it('is the pair, announcement first', () => {
    expect(announcementDismissalId('ann-1', 'S1')).toBe('ann-1_S1')
  })
})

describe('dismissAnnouncement', () => {
  it('writes a per-student marker at the pair id, never touching the announcement itself', async () => {
    await dismissAnnouncement('ann-1', 'S1')
    expect(writes).toHaveLength(1)
    const [path, data] = writes[0]
    expect(path).toBe('announcement_dismissals/ann-1_S1')
    expect(data).toEqual({ announcement_id: 'ann-1', student_id: 'S1', dismissed_at: 'TS' })
  })
})

describe('Announcements tab -- dismiss control and the two empty states', () => {
  it('offers a way to dismiss each announcement a student still has', () => {
    const html = page({ announcements: [ann1, ann2] })
    expect(html).toContain('Quiz on Monday')
    expect(html).toContain('Field trip form due')
    // The control the tester would actually click -- not just the data that feeds it.
    expect(html.match(/>Dismiss</g)?.length).toBe(2)
  })

  it('reads "No Announcements" when the class has posted none at all', () => {
    const html = page({ announcements: [], announcementsTotal: 0 })
    expect(html).toContain('No Announcements')
    expect(html).not.toContain('All Caught Up')
  })

  it('reads a different empty state once every posted announcement has been dismissed', () => {
    const html = page({ announcements: [], announcementsTotal: 2 })
    expect(html).toContain('All Caught Up')
    expect(html).not.toContain('No Announcements')
  })
})
