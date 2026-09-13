/**
 * The Quizzes page speaks the same language as class tasks (2026-09-13).
 *
 * Two things pinned. (1) Every quiz card carries the describeWindow sentence
 * from lib/deliverables.js -- "Opens …", "Due …", "Closed …" -- the same one
 * the student's dashboard prints, beside the Draft / Published / Closed pill
 * it already had. (2) `/teacher/quizzes?topic={topicId}`, the link the class
 * page's Modules tab sends from "+ Add -> Quiz", opens the Generate dialog
 * with that topic preselected and the class that holds it picked; when the
 * picked class's syllabus does not list the topic, the dialog says so instead
 * of silently showing the first option.
 *
 * Rendered to static markup with the data hooks stubbed, the way
 * quizzes.test.jsx does it; nothing here touches Firestore.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = { quizzes: [], classes: [], syllabi: [], search: '', classMeta: null, syllabus: null }

vi.mock('react-router-dom', () => ({
  Link: ({ children }) => children,
  useNavigate: () => () => {},
  useSearchParams: () => [new URLSearchParams(state.search), vi.fn()],
}))
vi.mock('@tanstack/react-query', () => ({
  // The dialog's two reads, told apart by their key prefix.
  useQuery: ({ queryKey }) => {
    if (queryKey[0] === 'fs-class-meta-gen') return { data: state.classMeta, isFetched: true }
    if (queryKey[0] === 'fs-syllabus-gen') return { data: state.syllabus, isFetched: true }
    return { data: undefined, isLoading: false, isError: false }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/hooks/useQuizzes', () => ({
  quizzesKey: () => ['fs-quizzes'],
  useQuizzes: () => ({ data: state.quizzes, isLoading: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: state.classes }) }))
vi.mock('@/hooks/useSyllabi', () => ({ useSyllabi: () => ({ data: state.syllabi }) }))
vi.mock('@/hooks/useMySubscription', () => ({ useMySubscription: () => ({ locks: {} }) }))
vi.mock('@/hooks/useBankedQuestions', () => ({
  bankQuestions: vi.fn(), deleteBankedQuestion: vi.fn(), filterBankedQuestions: () => [],
  saveBankedQuestion: vi.fn(), useBankedQuestions: () => ({ data: [], isLoading: false }),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), getDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))
vi.mock('@/lib/ai', () => ({ draftToQuestions: vi.fn(), generateQuiz: vi.fn(), QUIZ_TYPES: [] }))

import QuizzesIndexPage from './quizzes.jsx'

const render = () => renderToStaticMarkup(<QuizzesIndexPage />)

const NOW = new Date(2026, 8, 13, 10, 0) // Sun 13 Sep 2026, 10:00 local
const q = (over) => ({ id: 'q1', title: 'Chapter 5 Quiz', status: 'published', class_ids: [], ...over })

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  Object.assign(state, { quizzes: [], classes: [], syllabi: [], search: '', classMeta: null, syllabus: null })
})

describe('Quizzes list card window chip', () => {
  // The page opens on the Ongoing tab, so a static render only shows quizzes
  // open right now; the Opens / Closed branches of the sentence are pinned in
  // lib/deliverables.test.js and read on the page in the browser walk.
  it('an open quiz reads Due …, the sentence the student sees', () => {
    state.quizzes = [q({ opens_at: '2026-09-10T08:00', closes_at: '2026-09-19T23:59' })]
    const html = render()
    expect(html).toContain('Due Sat 19 Sep, 11:59 PM')
    // Beside the teacher's status pill, not in place of it.
    expect(html).toContain('>Published<')
  })

  it('an undated quiz reads No deadline rather than nothing', () => {
    state.quizzes = [q({})]
    expect(render()).toContain('No deadline')
  })

  it('a quiz due today says so', () => {
    state.quizzes = [q({ closes_at: '2026-09-13T17:00' })]
    expect(render()).toContain('Due today, 5:00 PM')
  })
})

describe('/teacher/quizzes?topic= preselects the topic in the Generate dialog', () => {
  const syllabus = {
    id: 'syl-1',
    modules: [{ id: 'm1', title: 'Module 1', topics: [
      { id: 't-11', title: 'Sub-module 1.1', learning_objectives: ['Explain X'] },
      { id: 't-12', title: 'Sub-module 1.2', learning_objectives: [] },
    ] }],
  }

  it('opens the dialog on the class that holds the topic, with it picked', () => {
    state.classes = [
      { id: 'c-other', section: 'Newton', subject: 'Science 9', syllabus_id: null },
      { id: 'c-bsit', section: 'BSIT-C', subject: 'IT 101', syllabus_id: 'syl-1' },
    ]
    state.syllabi = [syllabus]
    state.classMeta = { syllabus_id: 'syl-1' }
    state.syllabus = syllabus
    state.search = 'topic=t-11'
    const html = render()
    expect(html).toContain('Generate Quiz with AI')
    // The class picker landed on BSIT-C, not the first class in the list.
    expect(html).toMatch(/<option value="c-bsit"[^>]*selected/)
    expect(html).toMatch(/<option value="t-11"[^>]*selected/)
    // A topic with objectives written raises no warning.
    expect(html).not.toContain('has no learning objectives')
    expect(html).not.toContain('not in this class')
  })

  it('says so when the picked class\'s syllabus does not list the topic, and lets the teacher describe one', () => {
    state.classes = [{ id: 'c-other', section: 'Newton', subject: 'Science 9', syllabus_id: null }]
    state.syllabi = []
    state.classMeta = { syllabus_id: null }
    state.syllabus = { modules: [{ id: 'm9', title: 'Forces', topics: [{ id: 't-99', title: 'Newton\'s laws' }] }] }
    state.search = 'topic=t-from-elsewhere'
    const html = render()
    expect(html).toContain('Generate Quiz with AI')
    expect(html).toContain('not in this class')
    expect(html).toContain('Topic Description')
  })

  it('does not open the dialog without the parameter', () => {
    state.classes = [{ id: 'c-bsit', section: 'BSIT-C', subject: 'IT 101', syllabus_id: 'syl-1' }]
    expect(render()).not.toContain('Generate Quiz with AI')
  })
})
