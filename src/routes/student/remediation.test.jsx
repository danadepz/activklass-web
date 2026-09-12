/**
 * The student's review guide names the module and sub-module it came from and
 * links back to that sub-module on the class page; the class page marks the
 * sub-module and gives it the anchor the link lands on. Static markup, the
 * house pattern -- every read is hard-coded through useQuery.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: null }))

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'S1', role: 'student', first_name: 'Hana', last_name: 'Lorenzo' } }) }))
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

import StudentRemediation from './remediation.jsx'
import StudentClassDetail from './classes/$classId/index.jsx'

const syllabus = {
  modules: [
    { id: 'm1', title: 'Doing Science', topics: [{ id: 't1', title: 'The Scientific Method' }] },
    { id: 'm2', title: 'Matter and Its Properties', topics: [{ id: 't3', title: 'Atomic Structure', resources: [] }, { id: 't4', title: 'The Periodic Table' }] },
  ],
}
const assignment = { id: 'a1', class_id: 'demo-sci9-newton', student_id: 'S1', topic_id: 't3', topic: 'Atomic Structure', guidance: '', class_label: 'SCI9' }

describe('review guide → modules', () => {
  const render = (extra = {}) => {
    state.data = { remediations: [{ ...assignment, ...extra }], syllabusByClass: { 'demo-sci9-newton': syllabus }, quizzesByClass: {}, attemptsByQuiz: {} }
    return renderToStaticMarkup(<MemoryRouter><StudentRemediation /></MemoryRouter>)
  }

  it('names the module and sub-module in the numbering the Modules tab uses, and links to the sub-module', () => {
    const html = render()
    expect(html).toContain('Where this fits in your modules')
    expect(html).toContain('Module 2')
    expect(html).toContain('Matter and Its Properties')
    expect(html).toContain('Sub-module 1')
    expect(html).toContain('Atomic Structure')
    expect(html).toContain('href="/student/classes/demo-sci9-newton?tab=topics&amp;topic=t3"')
    expect(html).toContain('Read more in Modules')
  })

  it('says so when the topic is no longer published, or was never linked', () => {
    expect(render({ topic_id: 'gone' })).toContain('not in the published modules right now')
    const unlinked = render({ topic_id: null })
    expect(unlinked).toContain('not linked to a module')
    expect(unlinked).not.toContain('Read more in Modules')
  })
})

describe('modules → review guide', () => {
  const render = (url) => {
    state.data = {
      clazz: { id: 'demo-sci9-newton', subject: 'Science 9', section: 'Newton', student_ids: ['S1'] },
      teacher: null, entry: null, attendance: [], contestsByDate: {}, gradeContestsByAssessment: {},
      syllabus, announcements: [], quizzes: [], attemptsByQuiz: {},
      scaffoldedTopicIds: new Set(['t3']),
    }
    return renderToStaticMarkup(
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="/student/classes/:classId" element={<StudentClassDetail />} /></Routes>
      </MemoryRouter>,
    )
  }

  it('gives every sub-module the anchor the link lands on, and marks the scaffolded one', () => {
    const html = render('/student/classes/demo-sci9-newton?tab=topics&topic=t3')
    expect(html).toContain('id="topic-t3"')
    expect(html).toContain('id="topic-t1"')
    const marked = html.indexOf('id="topic-t3"')
    const nextTopic = html.indexOf('id="topic-t4"')
    const chip = html.indexOf('Review guide')
    expect(chip).toBeGreaterThan(marked)
    expect(chip).toBeLessThan(nextTopic)
    expect((html.match(/Review guide/g) ?? []).length).toBe(1)
    expect(html).toContain('href="/student/remediation"')
  })

  it('opens on the tab the link asked for, and ignores one that does not exist', () => {
    expect(render('/student/classes/demo-sci9-newton?tab=quizzes')).not.toContain('id="topic-t3"')
    expect(render('/student/classes/demo-sci9-newton?tab=bogus')).toContain('id="topic-t3"')
  })
})
