/**
 * Add quiz questions to the Quiz Bank (T-239, maykel_64440-315).
 *
 * Suggested in Discord #315:
 * A teacher reviewing questions on a quiz (read-only view or draft) needs
 * an option to save individual questions or all/multiple questions directly
 * to their Quiz Bank for future use, preserving question shape verbatim.
 *
 * This guards:
 * 1. Published view: "Add to Quiz Bank" button in the Questions and answer key header
 * 2. Published view: "Select all" control when multiple questions exist
 * 3. Published view: Each question row has a checkbox and an "Add to Quiz Bank" button
 * 4. Closed view: "Add to Quiz Bank" is available in read-only mode too
 * 5. Draft view: "Add to Quiz Bank" is available in the builder actions
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
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/components/ui/useAsyncAction', () => ({ useAsyncAction: (fn) => [fn, false] }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))

import QuizBuilderPage from './quizzes.$quizId.jsx'

const QUESTIONS = [
  {
    id: 'q1', qtype: 'mcq', text: 'Which primary structures are obstructed?', points: 2,
    options: [
      { id: 'o1', text: 'Bronchi', is_correct: true },
      { id: 'o2', text: 'Bronchioles', is_correct: false },
    ],
  },
  { id: 'q2', qtype: 'true_false', text: 'A hypothesis must be testable.', points: 1, answer_key: { value: true } },
  { id: 'q3', qtype: 'short_answer', text: 'What is the SI unit of force?', points: 1, answer_key: { answers: ['newton', 'N'] } },
]

const render = (over = {}) => {
  state.quiz = {
    id: 'quiz-1',
    title: 'Quiz 1 Prelim 1',
    status: 'published',
    class_ids: [],
    questions: QUESTIONS,
    ...over,
  }
  return renderToStaticMarkup(<QuizBuilderPage />)
}

describe('Add quiz questions to the Quiz Bank (T-239)', () => {
  it('renders "Add to Quiz Bank" in Questions and answer key header on a published quiz', () => {
    const html = render({ status: 'published' })
    expect(html).toContain('Questions and answer key (read-only)')
    expect(html).toContain('Add to Quiz Bank')
  })

  it('renders a "Select all" toggle when multiple questions exist', () => {
    const html = render({ status: 'published' })
    expect(html).toContain('Select all')
  })

  it('renders a checkbox and an individual "Add to Quiz Bank" button for each question', () => {
    const html = render({ status: 'published' })
    expect(html).toContain('aria-label="Select question 1"')
    expect(html).toContain('aria-label="Select question 2"')
    expect(html).toContain('aria-label="Select question 3"')

    // Header has 1 "Add to Quiz Bank", plus 1 per question row = 4 total occurrences
    const occurrences = (html.match(/Add to Quiz Bank/g) || []).length
    expect(occurrences).toBe(4)
  })

  it('renders "Add to Quiz Bank" in Questions and answer key header on a closed quiz', () => {
    const html = render({ status: 'closed' })
    expect(html).toContain('Questions and answer key (read-only)')
    expect(html).toContain('Add to Quiz Bank')
  })

  it('renders "Add to Quiz Bank" in builder actions on a draft quiz', () => {
    const html = render({ status: 'draft' })
    expect(html).toContain('Import from Bank')
    expect(html).toContain('Add to Quiz Bank')
  })
})
