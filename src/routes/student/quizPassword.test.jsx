/**
 * T-259: a quiz password is checked by the server before an attempt exists.
 * A wrong password must never start the attempt, and the student's screen asks
 * for the password only when the quiz requires one. The password itself never
 * reaches this screen: the quiz document carries only `password_required`.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({ docs: {} }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 's1', role: 'student' } }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/api', () => ({ api: vi.fn() }))
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


const { api } = await import('@/lib/api')
const { StartCard, unlockThenStart } = await import('./quiz-player.jsx')

const quiz = (extra = {}) => ({
  id: 'quiz-1', title: 'Midterm', status: 'published', class_ids: ['c1'], attempts_allowed: 1,
  questions: [{ id: 'q1', qtype: 'true_false', text: 'First?' }], ...extra,
})
const render = (q) => renderToStaticMarkup(<MemoryRouter><StartCard quiz={q} attempts={[]} classId="c1" onStarted={() => {}} /></MemoryRouter>)

describe('a wrong password does not start the attempt', () => {
  it('the server refuses, so start is never called', async () => {
    api.mockReset()
    api.mockRejectedValueOnce(Object.assign(new Error("That password isn't right."), { status: 403, code: 'wrong_password' }))
    const start = vi.fn()
    await expect(unlockThenStart({ quiz: quiz({ password_required: true }), classId: 'c1', password: 'nope', start })).rejects.toThrow("isn't right")
    expect(start).not.toHaveBeenCalled()
    expect(api).toHaveBeenCalledWith('/api/quizzes/quiz-1/unlock', { method: 'POST', body: { password: 'nope', class_id: 'c1' } })
  })
  it('the right one unlocks first, then starts', async () => {
    api.mockReset()
    const order = []
    api.mockImplementation(async () => { order.push('unlock'); return { ok: true } })
    await unlockThenStart({ quiz: quiz({ password_required: true }), classId: 'c1', password: 'x', start: async () => order.push('start') })
    expect(order).toEqual(['unlock', 'start'])
  })
  it('a quiz without a password never calls the server', async () => {
    api.mockReset()
    const start = vi.fn()
    await unlockThenStart({ quiz: quiz(), classId: 'c1', password: '', start })
    expect(api).not.toHaveBeenCalled()
    expect(start).toHaveBeenCalled()
  })
})

describe('the start card asks only when it must', () => {
  it('password quiz: a password box, and Start off until something is typed', () => {
    const html = render(quiz({ password_required: true }))
    expect(html).toContain('Quiz Password')
    expect(html).toMatch(/<button[^>]* disabled=""[^>]*>Start<\/button>/)
  })
  it('ordinary quiz: no password box, Start on', () => {
    const html = render(quiz())
    expect(html).not.toContain('Quiz Password')
    expect(html).not.toMatch(/<button[^>]* disabled=""[^>]*>Start<\/button>/)
  })
})
