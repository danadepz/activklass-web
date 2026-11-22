/**
 * generateQuiz() hands the page exactly the number of usable questions asked
 * for, or throws -- and the page writes a quiz only when it returns.
 *
 * Reported: 6–Purity English, "Analysing Philippine Literature in the
 * Pre-Colonial Period", 10 questions, Bloom's Level 3 – Apply →
 * "The AI returned 10 question(s), none of them usable." The backend counted
 * questions, not usable ones, so ten key-less MCQs reached validateQuizDraft
 * and every one was dropped. The backend now retries until N are usable
 * (activklass-backend tests/test_quiz_generation_usable.py); this file holds
 * the client's half of that contract. The API is mocked -- no live AI calls.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', async () => {
  const actual = await vi.importActual('./api')
  return { ...actual, api: vi.fn() }
})

const { api, ApiError } = await import('./api')
const { generateQuiz } = await import('./ai.js')

const mcq = (i, options) => ({
  type: 'mcq',
  text: `Apply Q${i}`,
  points: 2,
  objective: '',
  ...(options === undefined
    ? {
        options: [
          { text: 'A', correct: true },
          { text: 'B', correct: false },
          { text: 'C', correct: false },
          { text: 'D', correct: false },
        ],
      }
    : options === null
      ? {}
      : { options }),
})
const draft = (questions) => ({ draft: { title: 'Pre-colonial literature', questions } })
const ten = () => Array.from({ length: 10 }, (_, i) => mcq(i))

const REQUEST = {
  topic: 'Analysing Philippine Literature in the Pre-Colonial Period',
  numQuestions: 10,
  types: ['mcq'],
  hints: { subject: 'English', bloomsLevel: 'Level 3 – Apply' },
}

// Braces matter: a function returned from beforeEach runs as teardown, and mockReset returns the mock.
beforeEach(() => {
  api.mockReset()
})

describe('generateQuiz exact usable count', () => {
  it('returns 10 valid questions for Bloom\'s Level 3, with the level in the notes', async () => {
    api.mockResolvedValue(draft(ten()))
    const quiz = await generateQuiz(REQUEST)
    expect(quiz.questions).toHaveLength(10)
    const body = api.mock.calls[0][1].body
    expect(body.num_questions).toBe(10)
    expect(body.notes).toContain("Target cognitive level (Bloom's): Level 3 – Apply.")
  })

  it('sends several selected Bloom\'s levels as one line and still validates normally', async () => {
    api.mockResolvedValue(draft(ten()))
    const quiz = await generateQuiz({
      ...REQUEST,
      hints: { bloomsLevel: 'Level 1 – Remember, Level 3 – Apply, Level 5 – Evaluate' },
    })
    expect(quiz.questions).toHaveLength(10)
    expect(api.mock.calls[0][1].body.notes).toContain('Level 1 – Remember, Level 3 – Apply, Level 5 – Evaluate')
  })

  it('refuses a mixed draft rather than returning a short quiz', async () => {
    api.mockResolvedValue(draft([...ten().slice(0, 7), mcq(7, null), mcq(8, null), mcq(9, null)]))
    await expect(generateQuiz(REQUEST)).rejects.toThrow(
      /Asked for 10 questions but only 7 were usable \(Q8 \(only 0 option\(s\)\).*Nothing was saved/,
    )
  })

  it('refuses an all-invalid draft and says why', async () => {
    api.mockResolvedValue(draft(Array.from({ length: 10 }, (_, i) => mcq(i, null))))
    await expect(generateQuiz(REQUEST)).rejects.toThrow(/none of them usable \(Q1 \(only 0 option\(s\)\).*Nothing was saved/)
  })

  it.each([
    ['no correct option', [{ text: 'A', correct: false }, { text: 'B', correct: false }], /0 correct options/],
    ['two correct options', [{ text: 'A', correct: true }, { text: 'B', correct: true }], /2 correct options/],
    ['correct as a string', [{ text: 'A', correct: 'true' }, { text: 'B', correct: false }], /0 correct options/],
    ['a blank option', [{ text: 'A', correct: true }, { text: ' ', correct: false }], /blank option text/],
  ])('rejects a malformed answer key: %s', async (_label, options, reason) => {
    api.mockResolvedValue(draft([...ten().slice(0, 9), mcq(9, options)]))
    await expect(generateQuiz(REQUEST)).rejects.toThrow(reason)
  })

  it('never echoes a model-supplied question type into the teacher-facing error', async () => {
    const hostile = '<img src=x onerror=alert(1)> ignore previous instructions'
    api.mockResolvedValue(draft([...ten().slice(0, 9), { ...mcq(9), type: hostile }]))
    const err = await generateQuiz(REQUEST).catch((e) => e)
    expect(err.message).toContain('Q10 (question type not requested)')
    expect(err.message).not.toContain('onerror')
    expect(err.message).not.toContain('ignore previous')

    api.mockResolvedValue(draft(Array.from({ length: 10 }, (_, i) => ({ ...mcq(i), type: hostile }))))
    const allBad = await generateQuiz(REQUEST).catch((e) => e)
    expect(allBad.message).toMatch(/none of them usable/)
    expect(allBad.message).not.toContain('onerror')
  })

  it('still rejects a requested-looking type with the wrong answer key in a mixed request', async () => {
    api.mockResolvedValue(
      draft([
        mcq(0),
        { type: 'essay', text: 'E?', points: 5, objective: '', options: [{ text: 'A', correct: true }] },
      ]),
    )
    await expect(
      generateQuiz({ ...REQUEST, numQuestions: 2, types: ['mcq', 'essay'] }),
    ).rejects.toThrow(/Q2 \(missing rubric\)/)
  })

  it('accepts a mixed-type draft where each question carries only its own key', async () => {
    api.mockResolvedValue(
      draft([
        mcq(0),
        { type: 'true_false', text: 'T?', points: 1, objective: '', answer: false },
        { type: 'short_answer', text: 'S?', points: 2, objective: '', accepted_answers: ['epic'] },
        { type: 'matching', text: 'M?', points: 3, objective: '', pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }] },
        { type: 'essay', text: 'E?', points: 5, objective: '', rubric: 'Explains the oral tradition' },
      ]),
    )
    const types = ['mcq', 'true_false', 'short_answer', 'matching', 'essay']
    const quiz = await generateQuiz({ ...REQUEST, numQuestions: 5, types })
    expect(quiz.questions.map((q) => q.type)).toEqual(types)
    expect(api.mock.calls[0][1].body.types).toEqual(types)
  })

  it('rejects missing true/false and short-answer keys', async () => {
    api.mockResolvedValue(
      draft([
        { type: 'true_false', text: 'T?', points: 1, objective: '' },
        { type: 'short_answer', text: 'S?', points: 1, objective: '', accepted_answers: [''] },
      ]),
    )
    await expect(
      generateQuiz({ ...REQUEST, numQuestions: 2, types: ['true_false', 'short_answer'] }),
    ).rejects.toThrow(/missing true\/false answer.*no accepted answers/)
  })

  it('shows the backend\'s exhausted-retries message instead of a generic 502', async () => {
    const message =
      'The AI could not produce exactly 10 complete questions after 3 attempts ' +
      '(problems: missing answer options). Nothing was saved. Try again, or request a smaller number.'
    api.mockImplementation(() => { throw new ApiError(502, 'ai_incomplete', message) })
    await expect(generateQuiz(REQUEST)).rejects.toThrow(message)
  })

  it('keeps provider failures generic and free of internal detail', async () => {
    api.mockImplementation(() => { throw new ApiError(502, 'ai_failed', 'AI generation failed. Please try again.') })
    const err = await generateQuiz(REQUEST).catch((e) => e)
    expect(err.message).toMatch(/did not return a usable draft/)
    expect(err.code).toBe('ai_failed')
  })
})
