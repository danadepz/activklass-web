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
const updateDocMock = vi.fn()
const addDocMock = vi.fn(async () => ({ id: 'attempt-1' }))
const getDocMock = vi.fn(async () => ({ data: () => ({ started_at: { toMillis: () => 1_000 } }) }))
const deleteFieldSentinel = { sentinel: 'deleteField' }
vi.mock('firebase/firestore', () => ({
  addDoc: (...args) => addDocMock(...args),
  arrayUnion: vi.fn((v) => v),
  collection: vi.fn(),
  deleteField: vi.fn(() => deleteFieldSentinel),
  doc: vi.fn((_, col, id) => `${col}/${id}`),
  getDoc: (...args) => getDocMock(...args),
  increment: vi.fn((n) => n),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
  updateDoc: (...args) => updateDocMock(...args),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))

const {
  finishAttempt,
  mergeDraftAnswers,
  reportViolation,
  saveDraftAnswers,
  setStudentQuizAccess,
  startAttempt,
  unlockAttempt,
} = await import('./useAttemptSession')

describe('startAttempt metadata snapshot', () => {
  it('captures the presented questions and preserves missing Bloom as Unknown', async () => {
    addDocMock.mockClear()
    await startAttempt({
      quiz: { id: 'quiz-1', topic_id: 'topic-1', topic_label: 'Module · Topic' },
      classId: 'class-1', studentId: 'student-1', attemptNumber: 1,
      questions: [
        { id: 'q1', blooms_level: 'analyze', topic_id: 'topic-1', topic_label: 'Module · Topic', objective: 'Compare' },
        { id: 'q2' },
      ],
    })
    const [, payload] = addDocMock.mock.calls[0]
    expect(payload.question_ids).toEqual(['q1', 'q2'])
    expect(payload.question_metadata).toEqual([
      { question_id: 'q1', blooms_level: 'analyze', topic_id: 'topic-1', topic_label: 'Module · Topic', objective: 'Compare' },
      { question_id: 'q2', blooms_level: null, topic_id: 'topic-1', topic_label: 'Module · Topic', objective: null },
    ])
  })
})

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

describe('setStudentQuizAccess and unlockAttempt', () => {
  it('updates quiz student_access with explicit open and closed values', async () => {
    expect(typeof setStudentQuizAccess).toBe('function')
    updateDocMock.mockClear()
    await setStudentQuizAccess('quiz-1', 's1', 'closed')
    expect(updateDocMock).toHaveBeenCalledWith('quizzes/quiz-1', {
      'student_access.s1': 'closed',
      updated_at: 'server-timestamp',
    })

    updateDocMock.mockClear()
    await setStudentQuizAccess('quiz-1', 's1', 'open')
    expect(updateDocMock).toHaveBeenCalledWith('quizzes/quiz-1', {
      'student_access.s1': 'open',
      updated_at: 'server-timestamp',
    })
  })

  it('deletes student_access field when resetting to default', async () => {
    expect(typeof setStudentQuizAccess).toBe('function')
    updateDocMock.mockClear()
    await setStudentQuizAccess('quiz-1', 's1', 'default')
    expect(updateDocMock).toHaveBeenCalledWith('quizzes/quiz-1', {
      'student_access.s1': deleteFieldSentinel,
      updated_at: 'server-timestamp',
    })
  })

  // T-236 (D2/D3): unlock moved server-side. It used to be a direct Firestore
  // write from the teacher's browser (T-237); the server now authorises the
  // caller, restores the paused clock and bounds the resume, and the rules
  // refuse the direct write. Pinned here so a regression to the old write --
  // or to a client-chosen deadline -- fails.
  it('unlockAttempt goes through the server endpoint and writes nothing itself', async () => {
    updateDocMock.mockClear()
    apiMock.mockClear()
    await unlockAttempt('attempt-locked-1', { extensionMinutes: 30 })
    expect(apiMock).toHaveBeenCalledWith('/api/quiz_attempts/attempt-locked-1/unlock', {
      method: 'POST',
      body: { extension_minutes: 30 },
    })
    expect(updateDocMock).not.toHaveBeenCalled()
  })

  it('unlockAttempt defaults to the 15-minute extension', async () => {
    apiMock.mockClear()
    await unlockAttempt('attempt-locked-2')
    expect(apiMock.mock.calls[0][1].body).toEqual({ extension_minutes: 15 })
  })
})

describe('T-236 violation reporting', () => {
  it('reportViolation sends the event id, session and answers to the server', async () => {
    apiMock.mockClear()
    await reportViolation('a1', { eventId: 'evt-1234567', sessionId: 'sess-1234567', answers: { q1: 'b' }, awayMs: 900, questionIndex: 2 })
    expect(apiMock).toHaveBeenCalledWith('/api/quiz_attempts/a1/violation', {
      method: 'POST',
      body: { event_id: 'evt-1234567', session_id: 'sess-1234567', answers: { q1: 'b' }, away_ms: 900, question_index: 2 },
    })
  })

  it('saveDraftAnswers is save_only and carries no event id', async () => {
    apiMock.mockClear()
    await saveDraftAnswers('a1', { sessionId: 'sess-1234567', answers: { q2: true } })
    const { body } = apiMock.mock.calls[0][1]
    expect(body).toEqual({ save_only: true, session_id: 'sess-1234567', answers: { q2: true } })
  })
})

describe('mergeDraftAnswers', () => {
  const drafts = {
    'sess-old': { answers: { q1: 'old', q2: 'old' }, saved_at_ms: 1 },
    'sess-new': { answers: { q1: 'new' }, saved_at_ms: 2 },
    'sess-me': { answers: { q3: 'mine-server' }, saved_at_ms: 0 },
  }

  it("this tab's local draft always wins", () => {
    expect(mergeDraftAnswers({ q1: 'local' }, drafts, 'sess-me').q1).toBe('local')
  })

  it('fills gaps from other sessions, newest snapshot winning', () => {
    const merged = mergeDraftAnswers({}, drafts, 'sess-me')
    expect(merged).toEqual({ q1: 'new', q2: 'old', q3: 'mine-server' })
  })

  it('copes with no drafts at all', () => {
    expect(mergeDraftAnswers({ q1: 'a' }, undefined, 'sess-me')).toEqual({ q1: 'a' })
    expect(mergeDraftAnswers(null, null)).toEqual({})
  })
})
