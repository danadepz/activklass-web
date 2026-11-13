/**
 * T-236 revision 2 — the third tab switch locks the attempt.
 *
 * The lock itself is decided and enforced on the server
 * (activklass-backend tests/test_quiz_attempt_lock.py) and in firestore.rules
 * (src/lib/firestoreRules.test.js). This file pins the student screen's half:
 * a locked attempt renders the locked panel instead of the quiz -- on first
 * render and through the player's gate after a reload -- and the Runner's
 * wiring that cannot be exercised without a DOM (this repo has no jsdom) is
 * pinned by source, the same convention quizFullscreenTabWarnings.test.jsx uses.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

let playerData
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 's1', role: 'student' } }),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/api', () => ({ api: vi.fn(async () => ({})) }))
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(), arrayUnion: vi.fn(), collection: vi.fn(), deleteField: vi.fn(), doc: vi.fn(),
  getDoc: vi.fn(), getDocs: vi.fn(), increment: vi.fn(), onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn(), where: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: playerData, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useParams: () => ({ classId: 'c1', quizId: 'quiz-1' }),
}))

const { default: QuizPlayer, Runner, LOCKED_MESSAGE } = await import('./quiz-player.jsx')
const src = readFileSync(fileURLToPath(new URL('./quiz-player.jsx', import.meta.url)), 'utf8')

const quiz = {
  id: 'quiz-1',
  title: 'Midterm',
  status: 'published',
  attempts_allowed: 1,
  questions: [{ id: 'q1', qtype: 'true_false', text: 'The sky is blue?' }],
}
const attempt = (extra = {}) => ({
  id: 'att-1', quiz_id: 'quiz-1', class_id: 'c1', student_id: 's1',
  attempt_number: 1, question_ids: ['q1'], status: 'in_progress', ...extra,
})
const render = (el) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>)

describe('T-236 — locked attempt screens', () => {
  it('a locked attempt renders the locked panel, not the quiz', () => {
    const html = render(<Runner quiz={quiz} attempt={attempt({ status: 'locked' })} isResume />)
    expect(html).toContain('Quiz Attempt Locked')
    expect(html).toContain('Your answers are saved and the timer is paused')
    expect(html).not.toContain('The sky is blue?')
    expect(html).not.toContain('Submit')
  })

  it('an in-progress attempt still renders the quiz', () => {
    const html = render(<Runner quiz={quiz} attempt={attempt()} isResume />)
    expect(html).toContain('The sky is blue?')
    expect(html).not.toContain('Quiz Attempt Locked')
  })

  it('after a reload the gate says locked, not "No Attempts Left"', () => {
    playerData = { quiz, attempts: [attempt({ status: 'locked' })] }
    const html = render(<QuizPlayer />)
    expect(html).toContain('Quiz Attempt Locked')
    expect(html).toContain(LOCKED_MESSAGE)
    expect(html).not.toContain('No Attempts Left')
  })

  it('a recreated attempt beside a locked one is still gated as locked (D5)', () => {
    playerData = { quiz, attempts: [attempt({ status: 'locked' }), attempt({ id: 'att-2', attempt_number: 2 })] }
    expect(render(<QuizPlayer />)).toContain('Quiz Attempt Locked')
  })

  it('an unlocked attempt with a live resume grant resumes on a closed quiz (D3)', () => {
    playerData = {
      quiz: { ...quiz, status: 'closed' },
      attempts: [attempt({ resume_until_ms: Date.now() + 600_000 })],
    }
    const html = render(<QuizPlayer />)
    expect(html).toContain('The sky is blue?')
    expect(html).not.toContain('Quiz Closed')
  })

  it('once the resume grant lapses the closed quiz is closed again', () => {
    playerData = {
      quiz: { ...quiz, status: 'closed' },
      attempts: [attempt({ resume_until_ms: Date.now() - 1 })],
    }
    expect(render(<QuizPlayer />)).toContain('Quiz Closed')
  })
})

describe('T-236 — Runner wiring (pinned by source; no DOM in this repo)', () => {
  it('reports each away period to the server with one event id reused across retries', () => {
    expect(src).toMatch(/eventId: newToken\('evt'\)/)
    expect(src).toMatch(/for \(let tryNo = 0; tryNo < 3; tryNo \+= 1\)[\s\S]{0,80}reportViolation\(attempt\.id, report\)/)
  })

  it('stops counting, submitting and the clock while locked', () => {
    expect(src).toContain('if (!left || submittedRef.current || lockedRef.current) return')
    expect(src).toContain('if (submittedRef.current || lockedRef.current) return')
    expect(src).toContain('if (!hasTimer || locked) return')
    expect(src).toContain('if (!locked && hasExpired(live))')
  })

  it('saves this tab\'s answers once on entering the lock and merges drafts on unlock', () => {
    expect(src).toMatch(/if \(locked && !wasLocked\.current\)[\s\S]{0,120}saveDraftAnswers\(attempt\.id, \{ sessionId, answers: answersRef\.current \}\)/)
    expect(src).toMatch(/if \(!locked && wasLocked\.current\)[\s\S]{0,120}mergeDraftAnswers\(prev, live\.draft_answers, sessionId\)/)
  })

  it('follows the attempt live, so another tab\'s lock or the teacher\'s unlock arrives without a reload', () => {
    expect(src).toMatch(/onSnapshot\(\s*doc\(db, 'quiz_attempts', attempt\.id\)/)
  })
})
