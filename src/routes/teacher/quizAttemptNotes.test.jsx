/**
 * Feature 3: the quiz results table's old "Activity" column, kept (it is the
 * only place a teacher sees locks, reopens, time-outs and time away from the
 * page) but presented better: headed "Attempt Notes", one note per line
 * instead of a " · "-joined string, and toned by meaning -- amber for what a
 * teacher may act on, muted for plain facts. The sentences themselves are
 * lib/quizAttempts.js's, unchanged.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const mockState = { resultsData: null }

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockState.resultsData, isLoading: false, refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'teacher-1', role: 'teacher' } }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(), query: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-timestamp'), updateDoc: vi.fn(), where: vi.fn(),
}))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [] }) }))
vi.mock('@/hooks/useSyllabi', () => ({ useSyllabi: () => ({ data: [] }) }))
vi.mock('@/hooks/useBankedQuestions', () => ({
  bankQuestions: vi.fn(), filterBankedQuestions: vi.fn(), useBankedQuestions: () => ({ questions: [] }),
}))
vi.mock('@/hooks/useAttemptSession', () => ({
  discardAttempt: vi.fn(), grantExtraAttempt: vi.fn(), setStudentQuizAccess: vi.fn(), unlockAttempt: vi.fn(),
}))
vi.mock('@/hooks/useQuizRecordSync', () => ({
  syncQuizToAllRecords: vi.fn(), syncQuizToClassRecord: vi.fn(),
  useAutoPostScores: () => ({ status: 'idle', written: 0, skipped: [] }),
}))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/useAsyncAction', () => ({ useAsyncAction: (fn) => [fn, false] }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))

import { ResultsView, attemptNotes } from './quizzes.$quizId.jsx'

const quiz = { id: 'quiz-1', status: 'published', attempts_allowed: 3 }
const students = [{ student_id: 's1', first_name: 'Ana', last_name: 'Reyes' }]
const render = (attempts) => {
  mockState.resultsData = { students, attempts: { s1: attempts } }
  return renderToStaticMarkup(
    <MemoryRouter>
      <ResultsView classId="class-1" quizId="quiz-1" quiz={quiz} totalPoints={10} assignedTo={null} refetch={vi.fn()} />
    </MemoryRouter>,
  )
}
const away = (n, qi = 2) => Array.from({ length: n }, () => ({ at: '2026-11-15T10:00:00Z', away_ms: 60_000, question_index: qi }))
const items = (html) => [...html.matchAll(/<li data-tone="(warn|info)"[^>]*>([^<]*)<\/li>/g)].map((m) => [m[1], m[2]])

describe('Attempt Notes column header', () => {
  it('is "Attempt Notes", not the vague "Activity"', () => {
    const html = render([])
    expect(html).toContain('>Attempt Notes</th>')
    expect(html).not.toContain('>Activity</th>')
  })
})

describe('attemptNotes -- order and tone', () => {
  it('nothing to report gives no notes', () => {
    expect(attemptNotes({ lockedAttempt: null, notable: null })).toEqual([])
    expect(attemptNotes({ lockedAttempt: null, notable: { status: 'graded', attempt_number: 1 } })).toEqual([])
  })

  it('lock, state, focus -- in that order, each its own note', () => {
    const locked = { status: 'locked', locked_violation_count: 3 }
    const notable = { status: 'graded', reopen_count: 2, focus_events: away(4) }
    expect(attemptNotes({ lockedAttempt: locked, notable }).map((n) => [n.key, n.tone])).toEqual([
      ['lock', 'warn'], ['state', 'info'], ['focus', 'warn'],
    ])
  })

  it('time running out is a warning; a discard the teacher made is not', () => {
    expect(attemptNotes({ lockedAttempt: null, notable: { status: 'graded', expired_at_submit: true } })[0])
      .toMatchObject({ text: 'Time ran out', tone: 'warn' })
    expect(attemptNotes({ lockedAttempt: null, notable: { status: 'discarded' } })[0])
      .toMatchObject({ text: 'Attempt discarded by you', tone: 'info' })
  })
})

describe('Attempt Notes cell rendering', () => {
  it('stacks each note on its own line instead of joining them with " · "', () => {
    const html = render([
      { id: 'a1', status: 'graded', attempt_number: 1, total_score: 7, reopen_count: 1, focus_events: away(2) },
    ])
    expect(items(html)).toEqual([
      ['info', 'Reopened 1 time'],
      ['warn', 'Left the page 2 times · 2m away · most on Q3'],
    ])
    expect(html).not.toContain('Reopened 1 time · Left the page')
  })

  it('still states why a locked attempt is locked', () => {
    const html = render([{ id: 'a', status: 'locked', attempt_number: 1, locked_violation_count: 3 }])
    expect(items(html)[0]).toEqual(['warn', 'Locked after 3 tab switches'])
  })

  it('shows a dash and no list when there is nothing to note', () => {
    const html = render([{ id: 'a1', status: 'graded', attempt_number: 1, total_score: 9 }])
    expect(items(html)).toEqual([])
  })
})
