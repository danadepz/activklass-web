/**
 * A published quiz can go back to draft while nobody has started it, and
 * have its wording corrected while it is live (T-74, maykel_64440-91 /
 * triplecookiemonster-92).
 */
import { describe, expect, it } from 'vitest'
import { applyWordingEdits, backToDraftRefusal, wordingEditError } from './quizWording.js'

const mcq = (overrides = {}) => ({
  id: 'q1',
  qtype: 'mcq',
  text: 'What is 2 + 2?',
  points: 2,
  options: [
    { id: 'o1', text: '4', is_correct: true },
    { id: 'o2', text: '3', is_correct: false },
  ],
  ...overrides,
})

describe('wordingEditError', () => {
  it('allows a prompt text fix', () => {
    const before = [mcq()]
    const after = [mcq({ text: 'What is 2 plus 2?' })]
    expect(wordingEditError(before, after)).toBeNull()
  })

  it('allows an option text fix, correctness and order unchanged', () => {
    const before = [mcq()]
    const after = [mcq({ options: [{ id: 'o1', text: 'Four', is_correct: true }, { id: 'o2', text: 'Three', is_correct: false }] })]
    expect(wordingEditError(before, after)).toBeNull()
  })

  it('refuses a changed question type', () => {
    const before = [mcq()]
    const after = [mcq({ qtype: 'true_false' })]
    expect(wordingEditError(before, after)).toMatch(/question type/)
  })

  it('refuses changed points', () => {
    const before = [mcq()]
    const after = [mcq({ points: 5 })]
    expect(wordingEditError(before, after)).toMatch(/points/)
  })

  it('refuses moving which option is marked correct', () => {
    const before = [mcq()]
    const after = [mcq({ options: [{ id: 'o1', text: '4', is_correct: false }, { id: 'o2', text: '3', is_correct: true }] })]
    expect(wordingEditError(before, after)).toMatch(/correct/)
  })

  it('refuses adding or removing an option', () => {
    const before = [mcq()]
    const after = [mcq({ options: [...mcq().options, { id: 'o3', text: '5', is_correct: false }] })]
    expect(wordingEditError(before, after)).toMatch(/option/)
  })

  it('refuses reordering options even with correctness preserved', () => {
    const before = [mcq()]
    const after = [mcq({ options: [{ id: 'o2', text: '3', is_correct: false }, { id: 'o1', text: '4', is_correct: true }] })]
    expect(wordingEditError(before, after)).toMatch(/reordered/)
  })

  it('refuses adding or removing a question', () => {
    expect(wordingEditError([mcq()], [])).toMatch(/added or removed/)
    expect(wordingEditError([], [mcq()])).toMatch(/added or removed/)
  })

  it('allows a prompt fix on a non-mcq question, answer_key untouched', () => {
    const before = [{ id: 'q2', qtype: 'true_false', text: 'The sky is blue.', points: 1, answer_key: { value: true } }]
    const after = [{ id: 'q2', qtype: 'true_false', text: 'The daytime sky looks blue.', points: 1, answer_key: { value: true } }]
    expect(wordingEditError(before, after)).toBeNull()
  })

  it('refuses a changed answer key on a non-mcq question', () => {
    const before = [{ id: 'q2', qtype: 'true_false', text: 'The sky is blue.', points: 1, answer_key: { value: true } }]
    const after = [{ id: 'q2', qtype: 'true_false', text: 'The sky is blue.', points: 1, answer_key: { value: false } }]
    expect(wordingEditError(before, after)).toMatch(/answer key/)
  })

  it('refuses a question whose id does not match the published quiz', () => {
    const before = [mcq()]
    const after = [mcq({ id: 'q999' })]
    expect(wordingEditError(before, after)).toMatch(/does not match/)
  })
})

describe('applyWordingEdits', () => {
  it('builds a payload with no undefined values for a quiz with a short_answer question (T-74)', () => {
    const questions = [
      mcq(),
      { id: 'q4', qtype: 'short_answer', text: 'Name the capital of the Philippines.', points: 3, answer_key: { answers: ['Manila'] } },
    ]
    const edits = [
      { text: mcq().text, options: mcq().options },
      { text: 'Name the current capital of the Philippines.', options: [] },
    ]
    const next = applyWordingEdits(questions, edits)
    expect(next[1].text).toBe('Name the current capital of the Philippines.')
    expect('options' in next[1]).toBe(false)
    for (const q of next) {
      for (const value of Object.values(q)) {
        expect(value).not.toBeUndefined()
      }
    }
  })

  it('leaves an mcq question\'s options rewritten with the edited text', () => {
    const questions = [mcq()]
    const edits = [{ text: mcq().text, options: [{ text: 'Four' }, { text: 'Three' }] }]
    const next = applyWordingEdits(questions, edits)
    expect(next[0].options.map((o) => o.text)).toEqual(['Four', 'Three'])
  })
})

describe('backToDraftRefusal', () => {
  it('is null when nobody has started', () => {
    expect(backToDraftRefusal(0)).toBeNull()
  })

  it('names the exact count, singular', () => {
    expect(backToDraftRefusal(1)).toBe(
      "1 student has already started this quiz, so it can't go back to a draft. Close it instead, or fix the wording below.",
    )
  })

  it('names the exact count, plural', () => {
    expect(backToDraftRefusal(3)).toBe(
      "3 students have already started this quiz, so it can't go back to a draft. Close it instead, or fix the wording below.",
    )
  })
})
