/**
 * T-260 (maykel_64440-343, section D): a quiz could be published with no
 * title or with a question worth zero points, and students found out in the
 * middle of the exam. There was also no way to see the quiz as a student
 * would before publishing.
 *
 * Static markup, the house pattern (see quizAnswerKey.test.jsx): the draft
 * editor is rendered and the Publish button read off it. A blocked quiz shows
 * Publish disabled with the reason beside it; a complete one does not.
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
  useAutoPostScores: () => ({ status: 'idle', written: 0, skipped: [] }),
}))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/useAsyncAction', () => ({ useAsyncAction: (fn) => [fn, false] }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))

import QuizBuilderPage, { PreviewModal } from './quizzes.$quizId.jsx'
import { statusPillKey } from './quizzes.jsx'
import { quizPublishError } from '@/lib/validation'

const GOOD = [
  {
    id: 'a', qtype: 'mcq', text: 'Which organ exchanges gases?', points: 2,
    options: [{ id: 'a1', text: 'Alveoli', is_correct: true }, { id: 'a2', text: 'Stomach', is_correct: false }],
  },
  { id: 'b', qtype: 'true_false', text: 'Lungs are organs.', points: 1, answer_key: { value: true } },
]

const editor = (over = {}) => {
  state.quiz = { id: 'q1', title: 'Respiratory Quiz', status: 'draft', class_ids: ['c1'], questions: GOOD, ...over }
  return renderToStaticMarkup(<QuizBuilderPage />)
}

/** The Publish button's opening tag, so `disabled` can be read off it. */
function publishButton(html) {
  const m = html.match(/<button[^>]*>Publish<span/)
  expect(m, 'no Publish button').toBeTruthy()
  return m[0]
}

describe('publishing an incomplete quiz is refused, and says why (T-260)', () => {
  it('a complete quiz can be published', () => {
    const html = editor()
    expect(publishButton(html)).not.toContain(' disabled=""')
  })

  it('a quiz with no questions cannot be published', () => {
    const html = editor({ questions: [] })
    expect(publishButton(html)).toContain(' disabled=""')
    expect(html).toContain('Add at least one question before publishing.')
  })

  it('a question worth zero points blocks publishing and is named', () => {
    const html = editor({ questions: [GOOD[0], { ...GOOD[1], points: 0 }] })
    expect(publishButton(html)).toContain(' disabled=""')
    expect(html).toContain('Question 2 needs a point value above 0 before publishing.')
  })

  it('a quiz without a title cannot be published', () => {
    const html = editor({ title: '   ' })
    expect(publishButton(html)).toContain(' disabled=""')
    expect(html).toContain('Give this quiz a title before publishing.')
  })

  it('a quiz assigned to no class cannot be published', () => {
    const html = editor({ class_ids: [] })
    expect(publishButton(html)).toContain(' disabled=""')
    expect(html).toContain('Assign this quiz to at least one class before publishing')
  })
})

describe('quizPublishError', () => {
  const ok = { title: 'Quiz', questions: [{ points: 1 }], classIds: ['c1'] }
  it('passes a complete quiz', () => expect(quizPublishError(ok)).toBe(''))
  it.each([[0], [-1], [''], ['abc'], [null]])('refuses points %j', (points) => {
    expect(quizPublishError({ ...ok, questions: [{ points: 2 }, { points }] })).toMatch(/^Question 2 /)
  })
  it('checks the title first', () => {
    expect(quizPublishError({ title: '', questions: [], classIds: [] })).toMatch(/title/)
  })
})

describe('Preview shows the quiz as a student sees it (T-260)', () => {
  it('the draft editor offers Preview', () => {
    expect(editor()).toMatch(/<button[^>]*>Preview<\/button>/)
  })

  it('renders every question with its points and options, and no answer key', () => {
    const editable = GOOD.map((q) => ({
      ...q, points: String(q.points), tfValue: true, answersText: '', pairs: [], rubric: '',
    }))
    const html = renderToStaticMarkup(
      <PreviewModal title="Respiratory Quiz" instructions="Answer all." questions={editable} onClose={() => {}} />,
    )
    expect(html).toContain('Respiratory Quiz')
    expect(html).toContain('Question 1 of 2 · 2 points')
    expect(html).toContain('Which organ exchanges gases?')
    expect(html).toContain('Alveoli')
    expect(html).toContain('Stomach')
    expect(html).toContain('Question 2 of 2 · 1 point')
    expect(html).toContain('True')
    expect(html).not.toMatch(/correct/i)
  })
})

describe('the quiz list says where each quiz is in its life (T-260)', () => {
  const now = new Date('2026-11-14T10:00').getTime()
  it.each([
    [{ status: 'draft' }, 'draft'],
    [{ status: 'published', opens_at: '2026-11-20T08:00' }, 'scheduled'],
    [{ status: 'published' }, 'ongoing'],
    [{ status: 'closed' }, 'closed'],
    [{ status: 'published', closes_at: '2026-11-01T08:00' }, 'completed'],
  ])('%j reads %s', (quiz, key) => expect(statusPillKey(quiz, now)).toBe(key))
})
