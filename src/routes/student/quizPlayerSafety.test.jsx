/**
 * T-261 (maykel_64440-343, section F) asked for three things a student-facing
 * quiz must hold to, each pinned here against the player itself:
 *
 * - Prevent backtracking actually prevents it: no Previous button.
 * - Shuffling options changes the order only, never which answer scores.
 * - A quiz is open only from a class it is assigned to. Before this the player
 *   checked enrollment in the URL's class and nothing else, so a student in
 *   class A could open class B's quiz under A's URL and start an attempt
 *   filed under A.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({ docs: {} }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 's1', role: 'student' } }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/api', () => ({ api: vi.fn(async () => ({})) }))
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(), arrayUnion: vi.fn(), collection: vi.fn(), deleteField: vi.fn(),
  doc: vi.fn((_db, col, id) => `${col}/${id}`),
  getDoc: vi.fn(async (path) => ({
    id: path.split('/')[1], exists: () => !!fs.docs[path], data: () => fs.docs[path],
  })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  increment: vi.fn(), onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn(), where: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: true, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

const { Runner, loadPlayerData } = await import('./quiz-player.jsx')
const { questionsForAttempt } = await import('@/lib/quizPool')
const { gradeAnswer } = await import('@/lib/quizGrading')

const twoQuestions = (extra = {}) => ({
  id: 'quiz-1', title: 'Midterm', status: 'published', attempts_allowed: 1, ...extra,
  questions: [
    { id: 'q1', qtype: 'true_false', text: 'First?' },
    { id: 'q2', qtype: 'true_false', text: 'Second?' },
  ],
})
const attempt = {
  id: 'att-1', quiz_id: 'quiz-1', class_id: 'c1', student_id: 's1',
  attempt_number: 1, question_ids: ['q1', 'q2'], status: 'in_progress',
}
const render = (el) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>)

describe('prevent backtracking', () => {
  it('a normal quiz offers Previous', () => {
    expect(render(<Runner quiz={twoQuestions()} attempt={attempt} isResume />)).toContain('← Previous')
  })
  it('a no-backtracking quiz does not', () => {
    expect(render(<Runner quiz={twoQuestions({ prevent_backtracking: true })} attempt={attempt} isResume />)).not.toContain('← Previous')
  })
})

describe('shuffled options still score the right answer', () => {
  const quiz = {
    id: 'quiz-s', shuffle_options: true,
    questions: [{
      id: 'm1', qtype: 'mcq', points: 2,
      options: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, text: id.toUpperCase(), is_correct: id === 'd' })),
    }],
  }
  it('for every student the order may move but D always earns the points', () => {
    let reordered = false
    for (const studentId of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const [q] = questionsForAttempt(quiz, { attempt_number: 1, question_ids: ['m1'] }, { studentId })
      if (q.options.map((o) => o.id).join('') !== 'abcdef') reordered = true
      expect(gradeAnswer(q, 'd').earned).toBe(2)
      expect(gradeAnswer(q, 'a').earned).toBe(0)
    }
    expect(reordered).toBe(true)
  })
})

describe('a quiz opens only from a class it is assigned to', () => {
  const seed = (quiz) => {
    fs.docs = {
      'quizzes/quiz-1': quiz,
      'classes/c1': { student_ids: ['s1'] },
    }
  }
  it('assigned to this class: loads', async () => {
    seed({ class_ids: ['c1', 'c2'] })
    await expect(loadPlayerData('c1', 'quiz-1', 's1')).resolves.toMatchObject({ quiz: { id: 'quiz-1' } })
  })
  it("another class's quiz is refused even though the student is enrolled here", async () => {
    seed({ class_ids: ['c2'] })
    await expect(loadPlayerData('c1', 'quiz-1', 's1')).rejects.toThrow('wrong_class')
  })
  it('a legacy single-class quiz still loads in its own class', async () => {
    seed({ class_id: 'c1' })
    await expect(loadPlayerData('c1', 'quiz-1', 's1')).resolves.toBeTruthy()
  })
})
