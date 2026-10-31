/**
 * T-208 (audit F-06): finishAttempt() used to grade the attempt client-side
 * and write the score straight to Firestore -- nothing stopped a student
 * writing any total_score they liked. It now POSTs the raw answers to the
 * server and lets the server's response be the only grade that exists.
 * This pins that it calls the right endpoint with the right body and
 * nothing else -- the no-trust end of the fix is firestore.rules (see
 * firestoreRules.test.js's "the guard that stops a student finishing their
 * own attempt directly"); this is the client half.
 */
import { describe, expect, it, vi } from 'vitest'

const apiMock = vi.fn(async () => ({ total_score: 7, status: 'graded' }))
vi.mock('@/lib/api', () => ({ api: (...args) => apiMock(...args) }))
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  arrayUnion: vi.fn((v) => v),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  increment: vi.fn((n) => n),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
  updateDoc: vi.fn(),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))

const { finishAttempt } = await import('./useAttemptSession')

describe('finishAttempt', () => {
  it('posts the raw answers to the server-grading endpoint, never a client-computed score', async () => {
    const result = await finishAttempt('attempt-1', { answers: { q1: 'b' }, expired: false })
    expect(apiMock).toHaveBeenCalledWith('/api/quiz_attempts/attempt-1/submit', {
      method: 'POST',
      body: { answers: { q1: 'b' }, expired: false },
    })
    // Nothing resembling a score is ever sent up -- the call above is the
    // whole body, and it has no total_score/status/per_question in it.
    const [, { body }] = apiMock.mock.calls[0]
    expect(body).not.toHaveProperty('total_score')
    expect(body).not.toHaveProperty('status')
    expect(result).toEqual({ total_score: 7, status: 'graded' })
  })

  it('defaults expired to false when the caller omits it', async () => {
    await finishAttempt('attempt-2', { answers: {} })
    expect(apiMock).toHaveBeenCalledWith('/api/quiz_attempts/attempt-2/submit', {
      method: 'POST',
      body: { answers: {}, expired: false },
    })
  })
})
