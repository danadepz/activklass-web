/**
 * A closed quiz can be reopened from the editor itself, not only from the
 * toast that appears in the seconds after you close it (T-98, maykel_64440-125).
 *
 * Reopening was already built and safe -- closing only ever flips `status`
 * to 'closed', and the toast's "Reopen" action undoes exactly that. The gap
 * was reach: come back to a closed quiz later, as maykel did, and the only
 * door was gone. This pins that a **closed** quiz shows a Reopen control
 * where a **published** one shows Close quiz / Back to draft, and that a
 * **draft** gets neither -- static markup, the house pattern
 * (`quizAnswerKey.test.jsx`'s mocking shape).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ quiz: null }))

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
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
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), deleteDoc: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
  query: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn(), where: vi.fn(),
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
  useAutoPostScores: () => ({ status: 'idle', written: 0, skipped: [] }),
}))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/useAsyncAction', () => ({ useAsyncAction: (fn) => [fn, false] }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))

import QuizBuilderPage from './quizzes.$quizId.jsx'

const render = (over = {}) => {
  state.quiz = { id: 'q1', title: 'Respiratory Quiz', class_ids: [], questions: [], ...over }
  return renderToStaticMarkup(<QuizBuilderPage />)
}

describe('A closed quiz offers Reopen in the header (T-98)', () => {
  it('shows Reopen on a closed quiz', () => {
    expect(render({ status: 'closed' })).toContain('>Reopen<')
  })

  it('does not show Close quiz or Back to draft on a closed quiz', () => {
    const html = render({ status: 'closed' })
    expect(html).not.toContain('>Close quiz<')
    expect(html).not.toContain('>Back to draft<')
  })

  it('shows Close quiz and Back to draft on a published quiz, not Reopen', () => {
    const html = render({ status: 'published' })
    expect(html).toContain('>Close quiz<')
    expect(html).toContain('>Back to draft<')
    expect(html).not.toContain('>Reopen<')
  })

  it('offers neither control on a draft', () => {
    const html = render({ status: 'draft' })
    expect(html).not.toContain('>Reopen<')
    expect(html).not.toContain('>Close quiz<')
    expect(html).not.toContain('>Back to draft<')
  })
})
