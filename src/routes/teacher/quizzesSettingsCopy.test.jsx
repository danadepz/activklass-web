/**
 * T-200 (maykel_64440-306 items 1-5) -- the published-quiz page's settings
 * panel and its "Post Scores Now" button, reworded.
 *
 * Items 1-4 are plain renames, checked by rendering the panel (the house
 * mocking pattern from quizzesReopen.test.jsx). Item 5 is the one that was
 * more than wording: the panel used to show the button with no explanation
 * at all until an async effect resolved, which a teacher reads as "pressing
 * this is required" even though scores already post on their own. That
 * logic is pure (`describePostScoresLine` in lib/quizToRecord.js, tested in
 * quizToRecord.test.js) -- what this file pins is the structural half a unit
 * test on the function can't: that the component actually calls it, and that
 * the sentence it returns sits *before* the button in the JSX, not after.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./quizzes.$quizId.jsx', import.meta.url)), 'utf8')

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

describe('the live settings panel is renamed (T-200 items 1-4)', () => {
  it('heads the panel "Quiz Settings", not "Change while it is live"', () => {
    const html = render({ status: 'published' })
    expect(html).toContain('Quiz Settings')
    expect(html).not.toContain('Change while it is live')
  })

  it('labels the fields Allowed Attempts and Closing Date and Time', () => {
    const html = render({ status: 'published' })
    expect(html).toContain('Allowed Attempts')
    expect(html).toContain('Closing Date and Time')
    // The bare old labels must not survive as their own label text -- the
    // results table still prints a plain "Attempts" column header, so the
    // check is the exact label markup, not a loose substring.
    expect(html).not.toContain('<label style="display:block;font-size:12.5px;font-weight:600;color:#0E2A5C;margin-bottom:6px">Attempts</label>')
    expect(html).not.toContain('>Closes<')
  })

  it('labels the button Save Settings, not Save', () => {
    const html = render({ status: 'published' })
    expect(html).toContain('Save Settings')
    expect(html).not.toMatch(/>Save<\/button>/)
  })

  it('never shows this panel on a draft quiz, so the rename cannot regress the draft row', () => {
    const html = render({ status: 'draft' })
    expect(html).not.toContain('Quiz Settings')
  })
})

describe('the Post Scores button no longer contradicts the sentence beside it (T-200 item 5)', () => {
  const liveSrc = src.slice(src.indexOf('function PostScoresButton('), src.indexOf('function DiscardAttemptButton('))

  it('calls describePostScoresLine rather than inlining the old conditional', () => {
    expect(liveSrc).toContain('describePostScoresLine(')
  })

  it('renders the sentence before the button, not after -- so it leads', () => {
    const pIdx = liveSrc.indexOf('<p role="status"')
    const buttonIdx = liveSrc.indexOf('<button')
    expect(pIdx).toBeGreaterThan(-1)
    expect(buttonIdx).toBeGreaterThan(-1)
    expect(pIdx).toBeLessThan(buttonIdx)
  })

  it('labels the button "Post Scores Now", not the old "Post scores now"', () => {
    expect(liveSrc).toContain("'Post Scores Now'")
    expect(liveSrc).not.toContain("'Post scores now'")
  })

  it('never promises "to Class Record" on the button -- a pending essay can make it skip a student (T-199)', () => {
    expect(liveSrc).not.toMatch(/Post Scores to Class Record/)
  })

  it('the sentence is unconditional -- no longer null while mapped and auto has not resolved yet', () => {
    // The exact contradiction the tester saw: before this fix, a mapped quiz
    // whose auto-sync had not reached `done` rendered no sentence at all,
    // just the button. `leadLine` must never be nullable now.
    expect(liveSrc).not.toMatch(/:\s*mapping\s*\?\s*null/)
  })
})
