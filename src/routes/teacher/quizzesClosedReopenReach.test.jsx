/**
 * T-98 (verification lock) — a closed quiz can be reopened from its own page,
 * not only from the toast that lives for a few seconds after you close it.
 *
 * maykel (maykel_64440-125) went Teacher -> Quizzes, opened a quiz that was
 * already closed, and found no way to open it to a class again. Reopening was
 * built; the only door was the close toast, long gone by the time he came
 * back. What has to stay true is *reach*: the control is on the closed quiz's
 * own header, where Close quiz sits on a published one -- and it is offered
 * for no other status, so a draft or a published quiz is untouched.
 *
 * This lock deliberately goes past "the string Reopen is somewhere on the
 * page": it pins that the control is a real button and that it sits in the
 * header actions row, above the body, which is the part maykel's report was
 * actually about. Static markup against the real page with hooks stubbed by
 * vi.mock -- the house pattern; there is no DOM library in this repo, so the
 * status is varied through the stubbed query result, not by clicking.
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

const questions = [
  { id: 'q-1', type: 'multiple_choice', prompt: 'What is matter?', points: 2, choices: ['Stuff', 'Nothing'], answer: 0 },
]

const render = (status, over = {}) => {
  state.quiz = {
    id: 'q1', title: 'Quiz 2 - Matter and Energy', status,
    class_ids: [], questions, closes_at: '2026-01-01T08:00', ...over,
  }
  return renderToStaticMarkup(<QuizBuilderPage />)
}

// The quiz's actions live in the header row that also carries the title and
// the status line -- that is the spot maykel was looking at, and the spot
// Close quiz occupies on a published quiz. Isolate exactly that element by
// walking div depth from its opening tag, so a Reopen button parked somewhere
// further down the page does not satisfy this lock. (If the header row is
// ever restyled, update this one anchor -- do not relax the assertion.)
const HEADER_ROW = '<div class="mt-2 flex items-start justify-between gap-4">'

const headerRow = (html) => {
  const start = html.indexOf(HEADER_ROW)
  if (start === -1) return ''
  const tags = /<div\b|<\/div>/g
  tags.lastIndex = start
  let depth = 0
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[0] === '</div>' ? -1 : 1
    if (depth === 0) return html.slice(start, m.index + m[0].length)
  }
  return html.slice(start)
}

describe('T-98 — reopening a closed quiz does not depend on the close toast', () => {
  it('offers Reopen as a button in the header of a closed quiz', () => {
    const html = render('closed')
    expect(html).toContain('>Reopen<')
    // A real control, not a label or a disabled hint.
    expect(html).toMatch(/<button[^>]*>\s*Reopen\s*<\/button>/)
  })

  it('puts Reopen in the header actions row, where Close quiz sits on a published quiz', () => {
    expect(headerRow(render('closed'))).toContain('>Reopen<')
    // Same row, same page region, for the status it replaces.
    expect(headerRow(render('published'))).toContain('>Close quiz<')
  })

  it('does not offer Reopen on a published quiz, which shows Close quiz instead', () => {
    const html = render('published')
    expect(html).not.toContain('>Reopen<')
    expect(html).toContain('>Close quiz<')
    expect(html).toContain('>Back to draft<')
  })

  it('does not offer Reopen on a draft quiz', () => {
    const html = render('draft')
    expect(html).not.toContain('>Reopen<')
  })

  it('offers no closing controls on a closed quiz, only the way back', () => {
    const html = render('closed')
    expect(html).not.toContain('>Close quiz<')
    expect(html).not.toContain('>Back to draft<')
  })

  it('still shows the closed quiz its questions beside the Reopen control', () => {
    const html = render('closed')
    expect(html).toContain('>Reopen<')
    expect(html).toContain('1 questions')
  })
})
