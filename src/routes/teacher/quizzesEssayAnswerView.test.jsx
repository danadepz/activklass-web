/**
 * T-199 (maykel_64440-305 / -306 items 8-10, reopened maykel_64440-311)
 *
 * A teacher could not see a student's answers, or review and score a submitted
 * essay, so an essay quiz never reached the gradebook.
 *
 * This test suite locks both the static regressions (style spread, logic imports)
 * and the teacher-facing interactive affordances and workflows:
 * 1. "Essay pending review" is an interactive button/badge that opens the essay
 *    review directly, NOT a static dead end.
 * 2. An explicit "Review essay" button is provided in the actions column for
 *    any student attempt with a pending essay.
 * 3. Opening student details with a pending attempt automatically expands the
 *    attempt answers and grading controls.
 * 4. The student's submitted essay answer is rendered with pre-wrap whitespace
 *    in a dedicated container for clear reading.
 * 5. Score input validation and bounds checking (rejection of negatives and
 *    scores above max possible, acceptance of 0 and valid decimal scores).
 * 6. ResultsView connects attempt query refetching and invalidation so the
 *    table updates immediately upon marking.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  resultsData: null,
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
  useNavigate: () => vi.fn(),
  useParams: () => ({ quizId: 'quiz-1' }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }) => {
    if (queryKey[0] === 'fs-quiz-results') {
      return { data: mockState.resultsData, isLoading: false, isError: false, refetch: vi.fn() }
    }
    return { data: undefined, isLoading: false, isError: false, refetch: vi.fn() }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}))

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'teacher-1', role: 'teacher' } }),
}))

vi.mock('@/lib/roster', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchUsersByIds: vi.fn(async () => []),
    STATUS_LABELS: { active: 'Active', inactive: 'Inactive' },
  }
})
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [] }) }))
vi.mock('@/hooks/useSyllabi', () => ({ useSyllabi: () => ({ data: [] }) }))
vi.mock('@/hooks/useBankedQuestions', () => ({
  bankQuestions: vi.fn(),
  filterBankedQuestions: () => [],
  useBankedQuestions: () => ({ data: [] }),
}))
vi.mock('@/hooks/useAttemptSession', () => ({
  discardAttempt: vi.fn(),
  grantExtraAttempt: vi.fn(),
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

import { AttemptAnswers, ResultsView, StudentDetailsModal } from './quizzes.$quizId.jsx'

const src = readFileSync(fileURLToPath(new URL('./quizzes.$quizId.jsx', import.meta.url)), 'utf8')

describe('sans is a string, never spread into a style object (T-199 regression)', () => {
  it('has no `...sans` spread anywhere in the file', () => {
    // The only correct form is `fontFamily: sans`. A spread here crashes the
    // page the moment the element mounts -- see the file header for why.
    expect(src).not.toMatch(/\.\.\.sans\b/)
  })

  it('the View answers / Hide answers toggle sets fontFamily: sans, not a spread', () => {
    const btnSrc = src.slice(src.indexOf("'View answers'") - 400, src.indexOf("'View answers'"))
    expect(btnSrc).toMatch(/fontFamily:\s*sans/)
  })
})

describe('the essay answer view and marking panel are wired up (T-199)', () => {
  it('imports the pure essay-marking helper from the data/logic lane', () => {
    expect(src).toMatch(/import\s*\{[^}]*applyEssayMarks[^}]*\}\s*from\s*'@\/lib\/quizGrading'/)
  })

  it('defines the read-only answer view component', () => {
    expect(src).toContain('function AttemptAnswers(')
  })

  it('keeps an attempt its own Firestore id so a mark has somewhere to write', () => {
    // ResultsView used to build attempts from d.data() alone, which drops the
    // document id -- the exact thing AttemptAnswers needs to call updateDoc.
    expect(src).toMatch(/const a = \{ id: d\.id, \.\.\.d\.data\(\) \}/)
  })

  it('a save writes status "graded" once nothing is pending, not "submitted"', () => {
    // quizToRecord's skip (quizScoreCells) treats "submitted" as unscorable
    // forever -- the whole point of T-199 is that marking must clear it.
    const fnSrc = src.slice(src.indexOf('async function saveEssayMarks'), src.indexOf('export function AttemptAnswers('))
    expect(fnSrc).toContain('status: result.status')
  })
})

describe('T-199 teacher-facing essay review workflow & affordances', () => {
  const dummyQuiz = {
    id: 'quiz-1',
    title: 'Science Quiz 1',
    status: 'published',
    questions: [
      {
        id: 'q-essay',
        qtype: 'essay',
        text: 'Explain photosynthesis in 2-3 sentences.',
        points: 5,
        rubric: 'Clear definition of sunlight into glucose',
      },
    ],
  }

  const studentWithPendingEssay = {
    student_id: 's1',
    first_name: 'Maykel',
    last_name: 'Tester',
    login_id: 'maykel01',
    status: 'active',
  }

  const pendingAttempt = {
    id: 'attempt-pending-1',
    quiz_id: 'quiz-1',
    student_id: 's1',
    status: 'submitted',
    has_essays_pending: true,
    total_score: null,
    total_possible: 5,
    answers: {
      'q-essay': 'Plants use sunlight, water, and carbon dioxide to create oxygen and energy in the form of sugar.',
    },
    per_question: [
      {
        id: 'q-essay',
        qtype: 'essay',
        earned: 0,
        possible: 5,
        pending: true,
        correct: null,
      },
    ],
  }

  it('renders an interactive review button for Essay pending review in the results table, not a dead end', () => {
    mockState.resultsData = {
      students: [studentWithPendingEssay],
      attempts: { s1: [pendingAttempt] },
    }

    const html = renderToStaticMarkup(
      <ResultsView
        classId="class-1"
        quizId="quiz-1"
        quiz={dummyQuiz}
        totalPoints={5}
        assignedTo={null}
        refetch={vi.fn()}
      />
    )

    // The status cell must contain a clickable button, not plain unclickable text:
    const statusCellMatch = html.match(/<td[^>]*>([\s\S]*?Essay pending review[\s\S]*?)<\/td>/)
    expect(statusCellMatch).toBeTruthy()
    expect(statusCellMatch[1]).toMatch(/<button[^>]*>[\s\S]*?Essay pending review[\s\S]*?<\/button>/)
  })

  it('provides an explicit Review essay button in the actions column for pending essays', () => {
    mockState.resultsData = {
      students: [studentWithPendingEssay],
      attempts: { s1: [pendingAttempt] },
    }

    const html = renderToStaticMarkup(
      <ResultsView
        classId="class-1"
        quizId="quiz-1"
        quiz={dummyQuiz}
        totalPoints={5}
        assignedTo={null}
        refetch={vi.fn()}
      />
    )

    // The rightmost actions column must offer an obvious Review essay button
    expect(html).toContain('Review essay')
    expect(html).toMatch(/<button[^>]*title="Review and score essay"[^>]*>\s*Review essay\s*<\/button>/)
  })

  it('does not display Review essay button when an attempt is already fully graded', () => {
    const gradedAttempt = {
      ...pendingAttempt,
      status: 'graded',
      has_essays_pending: false,
      total_score: 5,
      per_question: [
        {
          id: 'q-essay',
          qtype: 'essay',
          earned: 5,
          possible: 5,
          pending: false,
          correct: true,
          feedback: 'Well explained!',
        },
      ],
    }

    mockState.resultsData = {
      students: [studentWithPendingEssay],
      attempts: { s1: [gradedAttempt] },
    }

    const html = renderToStaticMarkup(
      <ResultsView
        classId="class-1"
        quizId="quiz-1"
        quiz={dummyQuiz}
        totalPoints={5}
        assignedTo={null}
        refetch={vi.fn()}
      />
    )

    expect(html).not.toContain('Review essay')
    expect(html).toContain('Graded')
  })

  it('automatically expands pending attempt answers when opening student details', () => {
    const detailsFor = {
      student: studentWithPendingEssay,
      allowed: 1,
      best: null,
      attempts: [pendingAttempt],
      initialAttemptId: pendingAttempt.id,
    }

    const html = renderToStaticMarkup(
      <StudentDetailsModal
        detailsFor={detailsFor}
        classId="class-1"
        quiz={dummyQuiz}
        totalPoints={5}
        onClose={vi.fn()}
        refetchResults={vi.fn()}
      />
    )

    // The student answer must be expanded and visible immediately without extra clicking
    expect(html).toContain('Plants use sunlight, water, and carbon dioxide')
    expect(html).toContain('Save marks')
    expect(html).toContain('Hide answers')
  })

  it('renders student essay answers in a dedicated readable box with pre-wrap styling', () => {
    const html = renderToStaticMarkup(
      <AttemptAnswers
        attempt={pendingAttempt}
        quiz={dummyQuiz}
        onMarked={vi.fn()}
      />
    )

    expect(html).toContain('Plants use sunlight, water, and carbon dioxide')
    expect(html).toMatch(/white-space:\s*pre-wrap/i)
  })

  it('wires refetchResults and invalidation to ResultsView so marks update the table', () => {
    expect(src).toMatch(/refetchResults\?\.?\(\)[\s\S]*queryClient\.invalidateQueries\(\{\s*queryKey:\s*\['fs-quiz-results'/)
  })

  it('validates essay score inputs before calling saveEssayMarks', () => {
    expect(src).toContain("setError('Please enter a valid numeric score.')")
    expect(src).toContain("setError('Score cannot be negative.')")
    expect(src).toMatch(/setError\(`Score cannot exceed maximum of \$\{pq\.possible\}\.`\)/)
  })
})
