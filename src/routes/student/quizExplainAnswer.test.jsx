/**
 * T-263 (maykel_64440-345): quiz feedback named the right answer and nothing else.
 *
 * The student now taps "Explain my answer" on a wrong objective item, and the
 * explanation must start from THEIR answer ("Why “2/6” is wrong"), not just
 * restate the key. Static markup only -- this suite has no DOM -- so the tap
 * itself is covered server-side (activklass-backend tests/test_quiz_explain.py).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const view = vi.hoisted(() => ({ data: null }))

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 's1', role: 'student' } }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: () => ({ data: view.data, isLoading: false, isError: false }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ attemptId: 'att-1' }),
}))

const { default: QuizFeedback, ExplanationView } = await import('./quiz-feedback.jsx')

const quiz = {
  id: 'quiz-1',
  title: 'Fractions',
  questions: [
    { id: 'q1', qtype: 'mcq', points: 1, text: 'Which equals 0.75?', options: [{ id: 'a', text: '2/6' }, { id: 'b', text: '3/4' }] },
    { id: 'q2', qtype: 'mcq', points: 1, text: 'Which equals 0.5?', options: [{ id: 'c', text: '1/2' }, { id: 'd', text: '1/3' }] },
    { id: 'q3', qtype: 'mcq', points: 1, text: 'Which equals 0.25?', explanation: 'One quarter is 1/4.', options: [{ id: 'e', text: '1/4' }, { id: 'f', text: '1/5' }] },
  ],
}
const attempt = {
  id: 'att-1', student_id: 's1', class_id: 'c1', quiz_id: 'quiz-1', status: 'graded',
  total_score: 1, total_possible: 3, score_ratio: 1 / 3,
  answers: { q1: 'a', q2: 'c', q3: 'f' },
  per_question: [
    { id: 'q1', correct: false, earned: 0, possible: 1 },
    { id: 'q2', correct: true, earned: 1, possible: 1 },
    { id: 'q3', correct: false, earned: 0, possible: 1 },
  ],
}

function render() {
  view.data = { attempt, quiz, attemptCount: 1, correctAnswers: { q1: '3/4', q2: '1/2', q3: '1/4' } }
  return renderToStaticMarkup(<MemoryRouter><QuizFeedback /></MemoryRouter>)
}

describe('T-263 — explain a wrong quiz answer', () => {
  it('offers Explain my answer only on a wrong item with no teacher explanation', () => {
    const html = render()
    expect(html.match(/Explain my answer/g)).toHaveLength(1)
    const q1 = html.slice(html.indexOf('Which equals 0.75?'), html.indexOf('Which equals 0.5?'))
    expect(q1).toContain('Explain my answer')
    // The plain line stays: it is what the student sees if the model is silent.
    expect(q1).toContain('The correct answer is “3/4”')
    expect(html).toContain('One quarter is 1/4.')
  })

  it("the explanation starts from the student's own answer, not only the correct one", () => {
    const ex = {
      why_yours_is_wrong: '2/6 is about 0.33.',
      why_correct_is_right: '3 ÷ 4 = 0.75.',
      concept: 'A fraction is a division.',
      takeaway: 'Divide to check.',
    }
    const html = renderToStaticMarkup(<ExplanationView ex={ex} studentText="2/6" />)
    expect(html).toContain('Why “2/6” is wrong:')
    expect(html).toContain('2/6 is about 0.33.')
    expect(html).toContain('3 ÷ 4 = 0.75.')
    expect(html).toContain('Remember:')
    expect(html).toContain('Divide to check.')
  })
})
