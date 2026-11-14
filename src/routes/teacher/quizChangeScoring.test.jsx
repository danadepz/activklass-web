/**
 * T-261 (maykel_64440-343, section F): changing points or answers on a
 * published quiz must never move a mark a student already earned without the
 * teacher being told first.
 *
 * Owner scope "allow + regrade": the edit is allowed, but Save and regrade
 * stays off until the teacher has checked the impact (the server's dry run),
 * and the warning names how many students finished and whose marks move.
 * Static markup, the house pattern (quizAnswerKey.test.jsx).
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

import QuizBuilderPage, { ChangeScoringModal } from './quizzes.$quizId.jsx'
import { applyScoringEdits, describeRegrade } from './quizWording'

const QUESTIONS = [
  {
    id: 'a', qtype: 'mcq', text: 'Which organ exchanges gases?', points: 2,
    options: [{ id: 'a1', text: 'Alveoli', is_correct: true }, { id: 'a2', text: 'Stomach', is_correct: false }],
  },
  { id: 'b', qtype: 'true_false', text: 'Lungs are organs.', points: 1, answer_key: { value: true } },
  { id: 'c', qtype: 'short_answer', text: 'SI unit of force?', points: 1, answer_key: { answers: ['newton'] } },
]
const QUIZ = { id: 'q1', title: 'Respiratory Quiz', status: 'published', class_ids: ['c1'], questions: QUESTIONS, _keyLoaded: true }

/** A button's opening tag by its label. */
function button(html, label) {
  const m = html.match(new RegExp(`<button[^>]*>${label}</button>`))
  expect(m, `no ${label} button`).toBeTruthy()
  return m[0]
}

describe('a published quiz offers Change scoring (T-261)', () => {
  it('beside Edit wording', () => {
    state.quiz = QUIZ
    const html = renderToStaticMarkup(<QuizBuilderPage />)
    expect(html).toContain('Edit wording')
    expect(html).toMatch(/<button[^>]*>\s*Change scoring\s*<\/button>/)
  })
})

describe('the teacher sees who is affected before any mark moves (T-261)', () => {
  it('Save and regrade is off until the impact has been checked', () => {
    const html = renderToStaticMarkup(<ChangeScoringModal quiz={QUIZ} onClose={() => {}} refetch={() => {}} />)
    expect(button(html, 'Check impact')).not.toContain(' disabled=""')
    expect(button(html, 'Save and regrade')).toContain(' disabled=""')
  })

  it('the warning names how many finished and each mark that moves', () => {
    const lines = describeRegrade(
      {
        students: 2, finished_attempts: 3, in_progress: 1,
        attempts: [
          { student_id: 's-ana', attempt_number: 1, before: 5, before_possible: 6, after: 6, after_possible: 8, changed: true },
          { student_id: 's-ana', attempt_number: 2, before: 6, before_possible: 6, after: 8, after_possible: 8, changed: true },
          { student_id: 's-ben', attempt_number: 1, before: 2, before_possible: 6, after: 2, after_possible: 6, changed: false },
        ],
      },
      (id) => ({ 's-ana': 'Ana Cruz', 's-ben': 'Ben Lim' })[id],
    )
    expect(lines[0]).toBe('2 students have finished this quiz (3 attempts). Saving will change 2 of those marks:')
    expect(lines).toContain('Ana Cruz, attempt 1: 5/6 → 6/8')
    expect(lines).toContain('Ana Cruz, attempt 2: 6/6 → 8/8')
    expect(lines.join('\n')).not.toContain('Ben Lim')
    expect(lines).toContain('1 student is taking it now and will be marked with the new answers when they submit.')
  })

  it('says plainly when nobody has finished', () => {
    expect(describeRegrade({ students: 0, finished_attempts: 0, in_progress: 0, attempts: [] }))
      .toEqual(['No student has finished this quiz yet, so no mark changes.'])
  })
})

describe('applyScoringEdits changes only points and answers', () => {
  const next = applyScoringEdits(QUESTIONS, [
    { points: '3', correct: 'a2' },
    { points: '1', tf: false },
    { points: '2', answersText: 'newton\nN\n' },
  ])
  it('points', () => expect(next.map((q) => q.points)).toEqual([3, 1, 2]))
  it('mcq correct option', () => expect(next[0].options.map((o) => o.is_correct)).toEqual([false, true]))
  it('true/false and short answers', () => {
    expect(next[1].answer_key).toEqual({ value: false })
    expect(next[2].answer_key).toEqual({ answers: ['newton', 'N'] })
  })
  it('never the paper itself', () => {
    expect(next.map((q) => [q.id, q.qtype, q.text])).toEqual(QUESTIONS.map((q) => [q.id, q.qtype, q.text]))
    expect(next[0].options.map((o) => [o.id, o.text])).toEqual(QUESTIONS[0].options.map((o) => [o.id, o.text]))
  })
})
