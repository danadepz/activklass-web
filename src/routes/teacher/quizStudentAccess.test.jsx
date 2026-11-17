/**
 * T-237 (maykel_64440-312, maykel_64440-313):
 * Per-student quiz access control and attempt reopening.
 */
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const mockState = {
  resultsData: null,
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mockState.resultsData,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}))

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'teacher-1', role: 'teacher' } }),
}))

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
  updateDoc: vi.fn(),
  where: vi.fn(),
}))

vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [] }) }))
vi.mock('@/hooks/useSyllabi', () => ({ useSyllabi: () => ({ data: [] }) }))
vi.mock('@/hooks/useBankedQuestions', () => ({
  bankQuestions: vi.fn(),
  filterBankedQuestions: vi.fn(),
  useBankedQuestions: () => ({ questions: [] }),
}))
vi.mock('@/hooks/useAttemptSession', () => ({
  discardAttempt: vi.fn(),
  grantExtraAttempt: vi.fn(),
  setStudentQuizAccess: vi.fn(),
  unlockAttempt: vi.fn(),
}))
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

import { ResultsView, StudentDetailsModal } from './quizzes.$quizId.jsx'

describe('T-237: Per-student quiz access control', () => {
  const dummyQuiz = {
    id: 'quiz-1',
    status: 'published',
    attempts_allowed: 1,
    student_access: {
      s2: 'closed',
      s3: 'open',
    },
  }

  const students = [
    { student_id: 's1', first_name: 'Alice', last_name: 'Santos' },
    { student_id: 's2', first_name: 'Bob', last_name: 'Reyes' },
    { student_id: 's3', first_name: 'Charlie', last_name: 'Dizon' },
    { student_id: 's4', first_name: 'David', last_name: 'Luna' },
  ]

  const attempts = {
    s1: [],
    s2: [],
    s3: [],
    s4: [{ id: 'att-locked', status: 'locked', attempt_number: 1 }],
  }

  it('renders an Access column in the results table header', () => {
    mockState.resultsData = { students, attempts }
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ResultsView
          classId="class-1"
          quizId="quiz-1"
          quiz={dummyQuiz}
          totalPoints={10}
          assignedTo={null}
          refetch={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(html).toContain('>Access</th>')
  })

  it('displays accurate status for open, closed-override, and locked students', () => {
    mockState.resultsData = { students, attempts }
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ResultsView
          classId="class-1"
          quizId="quiz-1"
          quiz={dummyQuiz}
          totalPoints={10}
          assignedTo={null}
          refetch={vi.fn()}
        />
      </MemoryRouter>
    )

    // s1: Open (class default)
    expect(html).toContain('Open')
    // s2: Closed · override
    expect(html).toContain('Closed · override')
    // s4: Locked
    expect(html).toContain('Locked')
  })

  it('provides Close quiz button for open students and Open quiz button for closed students', () => {
    mockState.resultsData = { students, attempts }
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ResultsView
          classId="class-1"
          quizId="quiz-1"
          quiz={dummyQuiz}
          totalPoints={10}
          assignedTo={null}
          refetch={vi.fn()}
        />
      </MemoryRouter>
    )

    // Open student has Close quiz control
    expect(html).toContain('Close Quiz')
    // Closed student has Open quiz control
    expect(html).toContain('Open Quiz')
    // Students with overrides have a Reset option
    expect(html).toContain('Reset')
  })

  it('provides Reopen attempt button for students with a locked attempt', () => {
    mockState.resultsData = { students, attempts }
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ResultsView
          classId="class-1"
          quizId="quiz-1"
          quiz={dummyQuiz}
          totalPoints={10}
          assignedTo={null}
          refetch={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(html).toContain('Reopen attempt')
  })

  it('renders student access status inside StudentDetailsModal', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StudentDetailsModal
          detailsFor={{
            student: students[0],
            allowed: 1,
            best: null,
            attempts: [],
            access: 'open',
            hasOverride: false,
          }}
          classId="class-1"
          quiz={dummyQuiz}
          totalPoints={10}
          onClose={vi.fn()}
          refetchResults={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(html).toContain('Access:')
    expect(html).toContain('Open')
  })
})

describe('T-236 revision 2: reopening a tab-switch lock', () => {
  const quiz = { id: 'quiz-1', status: 'published', attempts_allowed: 1 }
  const students = [{ student_id: 's4', first_name: 'David', last_name: 'Luna' }]
  const renderWith = (attempt) => {
    mockState.resultsData = { students, attempts: { s4: [attempt] } }
    return renderToStaticMarkup(
      <MemoryRouter>
        <ResultsView classId="class-1" quizId="quiz-1" quiz={quiz} totalPoints={10} assignedTo={null} refetch={vi.fn()} />
      </MemoryRouter>,
    )
  }

  it('states why the attempt is locked in the activity column', () => {
    const html = renderWith({ id: 'a', status: 'locked', attempt_number: 1, locked_violation_count: 3 })
    expect(html).toContain('Locked after 3 tab switches')
    expect(html).toContain('Reopen attempt')
  })

  it('offers a bounded 15 / 30 / 60 minute choice for an untimed attempt, 15 first', () => {
    const html = renderWith({ id: 'a', status: 'locked', attempt_number: 1, locked_violation_count: 3 })
    expect(html).toMatch(/<option value="15" selected="">15 min<\/option>/)
    expect(html).toContain('30 min')
    expect(html).toContain('60 min')
    expect(html).not.toMatch(/<option[^>]*>\s*(Unlimited|No limit)/i)
  })

  it('offers no extension for a timed attempt -- its paused time is restored instead', () => {
    const html = renderWith({ id: 'a', status: 'locked', attempt_number: 1, remaining_ms_at_lock: 420_000 })
    expect(html).toContain('Reopen attempt')
    expect(html).not.toContain('15 min')
  })
})

describe('T-236 / D3: unlocking never opens the quiz indefinitely', () => {
  it('the Reopen button calls the server unlock and never writes student_access', () => {
    const src = readFileSync(fileURLToPath(new URL('./quizzes.$quizId.jsx', import.meta.url)), 'utf8')
    const start = src.indexOf('function UnlockAttemptButton(')
    const body = src.slice(start, src.indexOf('function describeLock(', start))
    expect(start).toBeGreaterThan(-1)
    expect(body).toContain('unlockAttempt(attempt.id, { extensionMinutes: extension })')
    expect(body).not.toContain('setStudentQuizAccess')
  })
})
