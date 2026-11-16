/**
 * T-259: the teacher's Quiz password card. It shows whether protection is on
 * from the quiz document, and it is the only place the password appears -- it
 * is fetched from the server when the teacher opens the card, never read from
 * the quiz document a student can also read.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ quiz: null }))

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
  useLocation: () => ({ state: null, pathname: '/teacher/quizzes/q1', search: '' }),
  useNavigate: () => vi.fn(),
  useParams: () => ({ quizId: state.quiz?.id ?? 'q1' }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }) =>
    queryKey[0] === 'fs-quiz'
      ? { data: state.quiz, isLoading: false, isError: false }
      : { data: undefined, isLoading: false, isError: false },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/api', () => ({ api: vi.fn(async () => ({})) }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), deleteDoc: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
  onSnapshot: vi.fn(), query: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn(), where: vi.fn(),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn(async () => []) }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [] }) }))
vi.mock('@/hooks/useSyllabi', () => ({ useSyllabi: () => ({ data: [] }) }))
vi.mock('@/hooks/useBankedQuestions', () => ({
  bankQuestions: vi.fn(), filterBankedQuestions: () => [], useBankedQuestions: () => ({ data: [] }),
}))
vi.mock('@/hooks/useAttemptSession', () => ({ discardAttempt: vi.fn(), grantExtraAttempt: vi.fn() }))
vi.mock('@/hooks/useQuizRecordSync', () => ({
  syncQuizToAllRecords: vi.fn(),
  syncQuizToClassRecord: vi.fn(),
  removeQuizFromAllRecords: vi.fn(),
  useAutoPostScores: () => ({ status: 'idle', written: 0, skipped: [] }),
}))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/useAsyncAction', () => ({ useAsyncAction: (fn) => [fn, false] }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))


import QuizBuilderPage, { QuizPasswordCard } from './quizzes.$quizId.jsx'

const QUIZ = { id: 'q1', title: 'Respiratory Quiz', status: 'published', class_ids: ['c1'], questions: [], _keyLoaded: true }

describe('Quiz password card (T-259)', () => {
  it('is on the quiz page, closed until the teacher opens it', () => {
    state.quiz = QUIZ
    const html = renderToStaticMarkup(<QuizBuilderPage />)
    expect(html).toContain('Quiz password')
    expect(html).toMatch(/<button[^>]*>Manage<\/button>/)
  })
  it('reads ON or OFF from the quiz document', () => {
    expect(renderToStaticMarkup(<QuizPasswordCard quiz={{ ...QUIZ, password_required: true }} refetch={() => {}} />)).toContain('>ON<')
    expect(renderToStaticMarkup(<QuizPasswordCard quiz={QUIZ} refetch={() => {}} />)).toContain('>OFF<')
  })
  it('a draft quiz has it too (set the password before publishing)', () => {
    state.quiz = { ...QUIZ, status: 'draft' }
    expect(renderToStaticMarkup(<QuizBuilderPage />)).toContain('Quiz password')
  })
})
