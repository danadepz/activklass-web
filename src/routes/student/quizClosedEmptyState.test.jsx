/**
 * T-235 (maykel_64440-309): The quiz-closed page says little and looks unfinished.
 *
 * Verifies that when a quiz is closed because the deadline has passed:
 * 1. The heading is in Title Case ("Quiz Closed").
 * 2. It explains why: "This quiz is no longer available because the deadline has passed."
 * 3. It includes the note guiding the student: "If you believe you should still have access, please contact your teacher."
 * 4. The "Back to Class" action is rendered as a prominent button with "← Back to Class".
 * 5. An icon is rendered in the empty-state badge container.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const view = vi.hoisted(() => ({ data: null, isLoading: false, isError: false, error: null }))

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 's1', role: 'student', first_name: 'Test', last_name: 'Student' } }),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: () => ({
    data: view.data,
    isLoading: view.isLoading,
    isError: view.isError,
    error: view.error,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ classId: 'c1', quizId: 'q1' }),
}))

const QuizPlayer = (await import('./quiz-player.jsx')).default

describe('T-235 — Quiz closed empty state layout and copy', () => {
  it('renders Title Case heading, clearer reason, teacher note, icon, and Back to Class button', () => {
    // Closed quiz (past deadline)
    view.data = {
      quiz: {
        id: 'q1',
        title: 'Midterm Quiz',
        status: 'published',
        closes_at: '2020-01-01T00:00', // Past deadline
      },
      attempts: [],
    }

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/student/classes/c1/quizzes/q1']}>
        <QuizPlayer />
      </MemoryRouter>,
    )

    // Heading in Title Case
    expect(html).toContain('Quiz Closed')
    expect(html).not.toContain('Quiz closed')

    // Clearer reason
    expect(html).toContain('This quiz is no longer available because the deadline has passed.')
    expect(html).not.toContain('The window for this quiz has passed.')

    // Note guiding the student
    expect(html).toContain('If you believe you should still have access, please contact your teacher.')

    // Obvious Back to Class button link
    expect(html).toContain('← Back to Class')
    expect(html).toContain('/student/classes/c1')

    // SVG icon container
    expect(html).toMatch(/<svg[^>]*>.*?<\/svg>/)
  })
})
