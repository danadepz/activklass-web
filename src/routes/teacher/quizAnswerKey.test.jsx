/**
 * A published quiz's read-only list shows each question's answer key
 * (T-60, andecobs-79).
 *
 * The tester's screenshot was Marites's own published ten-question quiz:
 * "Questions (read-only)", then "Q1. <text> · Multiple choice · 2 pts" per
 * row and nothing under it. Once a quiz is published the editor is gone and
 * this card is all there is, so a teacher checking the key before students
 * sat it -- or answering a dispute -- had nowhere to look, while the options
 * and answer_key sat unrendered on the very same document.
 *
 * Pinned, per question type, against the shapes the editor and lib/ai.js
 * save: mcq lists every option with the correct one marked; true_false says
 * Answer: True / False; short_answer lists the accepted answers; matching
 * lists left → right; essay says it is marked by hand. And the draft branch
 * is not this card at all -- a draft still gets the editor.
 *
 * Static markup, the house pattern. The page reads the quiz through
 * useQuery, so the stub answers by query key: the quiz for 'fs-quiz', nothing
 * for the rest (no classes assigned, so no results table and no gradebooks).
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
vi.mock('@/hooks/useQuizRecordSync', () => ({ syncQuizToAllRecords: vi.fn(), syncQuizToClassRecord: vi.fn() }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/useAsyncAction', () => ({ useAsyncAction: (fn) => [fn, false] }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))

import QuizBuilderPage from './quizzes.$quizId.jsx'

/* The five shapes as the editor saves them (toStorage in the same file) and
   as lib/ai.js writes an AI draft. */
const QUESTIONS = [
  {
    id: 'a', qtype: 'mcq', text: 'Which primary structures are obstructed?', points: 2,
    options: [
      { id: 'a1', text: 'Bronchi', is_correct: true },
      { id: 'a2', text: 'Bronchioles', is_correct: false },
      { id: 'a3', text: 'Alveoli', is_correct: false },
      { id: 'a4', text: 'Larynges', is_correct: false },
    ],
  },
  { id: 'b', qtype: 'true_false', text: 'A hypothesis must be testable.', points: 1, answer_key: { value: true } },
  { id: 'c', qtype: 'true_false', text: 'Mass and weight are the same thing.', points: 1, answer_key: { value: false } },
  { id: 'd', qtype: 'short_answer', text: 'What is the SI unit of force?', points: 1, answer_key: { answers: ['newton', 'newtons', 'N'] } },
  {
    id: 'e', qtype: 'matching', text: 'Match each quantity to its SI unit.', points: 3,
    answer_key: { pairs: [{ left: 'Mass', right: 'Kilogram' }, { left: 'Time', right: 'Second' }] },
  },
  { id: 'f', qtype: 'essay', text: 'Explain how the alveoli work.', points: 5 },
]

const render = (over = {}) => {
  state.quiz = { id: 'q1', title: 'Respiratory Quiz', status: 'published', class_ids: [], questions: QUESTIONS, ...over }
  return renderToStaticMarkup(<QuizBuilderPage />)
}

/** The read-only card's row for question n (1-based), up to the next row. */
function row(html, n) {
  const start = html.indexOf(`Q${n}.`)
  expect(start, `no Q${n} row`).toBeGreaterThan(-1)
  const next = html.indexOf(`Q${n + 1}.`, start)
  return html.slice(start, next === -1 ? undefined : next)
}

describe('a published quiz shows its answer key on the read-only list (T-60)', () => {
  it('says so in the heading', () => {
    expect(render()).toContain('Questions and answer key (read-only)')
  })

  it('lists every option of a multiple-choice question and marks the correct one', () => {
    const r = row(render(), 1)
    for (const t of ['Bronchi', 'Bronchioles', 'Alveoli', 'Larynges']) expect(r).toContain(t)
    // The one green dot sits beside the one correct option, and only that one is bold.
    expect(r.match(/bg-green-500/g)).toHaveLength(1)
    expect(r).toMatch(/bg-green-500[^>]*><\/span><span[^>]*font-semibold[^>]*>Bronchi</)
    expect(r).not.toMatch(/font-semibold[^>]*>Bronchioles</)
  })

  it('says True or False for a true/false question, from the saved key', () => {
    const html = render()
    expect(row(html, 2)).toMatch(/Answer: <span[^>]*>True</)
    expect(row(html, 3)).toMatch(/Answer: <span[^>]*>False</)
  })

  it('lists the accepted answers of a short-answer question', () => {
    expect(row(render(), 4)).toMatch(/Accepted answers: <span[^>]*>newton, newtons, N</)
  })

  it('lists the pairs of a matching question, left to right', () => {
    const r = row(render(), 5)
    expect(r).toMatch(/Mass → <span[^>]*>Kilogram</)
    expect(r).toMatch(/Time → <span[^>]*>Second</)
  })

  it('says an essay is marked by hand', () => {
    expect(row(render(), 6)).toContain('Marked by hand')
  })

  it('shows the key on a closed quiz too, which is read-only the same way', () => {
    const html = render({ status: 'closed' })
    expect(html).toContain('Questions and answer key (read-only)')
    expect(row(html, 2)).toMatch(/Answer: <span[^>]*>True</)
  })

  it('does not replace the editor on a draft — a draft is still edited, not read', () => {
    const html = render({ status: 'draft' })
    expect(html).not.toContain('read-only')
    expect(html).not.toContain('Accepted answers:')
  })
})
