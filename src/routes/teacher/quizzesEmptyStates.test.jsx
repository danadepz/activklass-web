/**
 * The four Quizzes empty states, written out instead of generated
 * (T-143, triplecookiemonster-198..201, Kristine, 2026-10-05).
 *
 * Every tab used to fall through one template, `Nothing <label> — <hint>.`,
 * which is why every tab read like a generated sentence and she filed four
 * separate tickets rather than one. Each tab now carries its own written
 * sentence, exactly as she asked for it; the `all` tab was never reported
 * and stays as it was.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const state = { quizzes: [], classes: [] }

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', () => ({
  Link: ({ children }) => children,
  useNavigate: () => () => {},
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), getDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/hooks/useQuizzes', () => ({
  quizzesKey: () => ['fs-quizzes'],
  useQuizzes: () => ({ data: state.quizzes, isLoading: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: state.classes }) }))
vi.mock('@/hooks/useSyllabi', () => ({ useSyllabi: () => ({ data: [] }) }))
vi.mock('@/hooks/useMySubscription', () => ({ useMySubscription: () => ({ locks: {} }) }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))
vi.mock('@/lib/ai', () => ({ draftToQuestions: vi.fn(), generateQuiz: vi.fn(), QUIZ_TYPES: [] }))

import QuizzesIndexPage, { FILTER_EMPTY_STATES } from './quizzes.jsx'

describe('Quizzes empty states, written out (T-143)', () => {
  it('writes each tab its own sentence, exactly as the tester asked', () => {
    // Pinned byte-for-byte against triplecookiemonster-198..201. If any of
    // these reverts to the old `Nothing <label> — <hint>.` template, this
    // fails immediately -- it never re-derives the sentence from the tab's
    // own label/hint.
    expect(FILTER_EMPTY_STATES).toEqual({
      ongoing: 'No quizzes are open for students right now.',
      scheduled: 'No scheduled quizzes yet.',
      draft: 'No draft quizzes yet.',
      past: 'No closed or completed quizzes yet.',
    })
  })

  it('renders the Ongoing tab\'s own sentence when it is empty (the default tab)', () => {
    // Static render can't click a tab, but Ongoing is the one the page opens
    // on, so this proves the map actually reaches the screen, not just that
    // the constant is spelled right.
    state.quizzes = []
    const html = renderToStaticMarkup(<QuizzesIndexPage />)
    expect(html).toContain('No quizzes are open for students right now.')
    expect(html).not.toMatch(/Nothing ongoing/i)
  })

  it('leaves the "all" tab\'s empty state exactly as it was', () => {
    // Not reported, and the card said to leave it alone.
    expect(FILTER_EMPTY_STATES.all).toBeUndefined()
  })
})
