/**
 * Unit tests for the objective auto-grader in ./quizGrading.js.
 *
 * This runs on the student's device at submit time and its output is what gets
 * written to Firestore, so a wrong number here becomes a wrong score on a
 * record nobody re-derives. Matching is the only question type with partial
 * credit, hence the dedicated block for it.
 */
import { describe, expect, it } from 'vitest'
import { gradeAnswer, gradeQuiz } from './quizGrading.js'

const mcq = (id, points = 5) => ({
  id,
  qtype: 'mcq',
  points,
  options: [
    { id: 'o1', text: 'Wrong', is_correct: false },
    { id: 'o2', text: 'Right', is_correct: true },
  ],
})

const trueFalse = (id, points = 3, value = true) => ({
  id,
  qtype: 'true_false',
  points,
  answer_key: { value },
})

const shortAnswer = (id, points = 2, answers = ['Photosynthesis']) => ({
  id,
  qtype: 'short_answer',
  points,
  answer_key: { answers },
})

const matching = (id, points, rights) => ({
  id,
  qtype: 'matching',
  points,
  answer_key: { pairs: rights.map((right, i) => ({ left: `L${i + 1}`, right })) },
})

const essay = (id, points = 10) => ({ id, qtype: 'essay', points, rubric: 'Cite two sources.' })

describe('gradeQuiz', () => {
  it('awards full marks on an all-correct objective quiz', () => {
    const quiz = { questions: [mcq('q1'), trueFalse('q2'), shortAnswer('q3')] }
    const result = gradeQuiz(quiz, { q1: 'o2', q2: true, q3: 'Photosynthesis' })
    expect(result.total_score).toBe(10)
    expect(result.total_possible).toBe(10)
    expect(result.score_ratio).toBe(1)
    expect(result.has_essays).toBe(false)
    expect(result.per_question).toEqual([
      { id: 'q1', qtype: 'mcq', earned: 5, possible: 5, correct: true, pending: false },
      { id: 'q2', qtype: 'true_false', earned: 3, possible: 3, correct: true, pending: false },
      { id: 'q3', qtype: 'short_answer', earned: 2, possible: 2, correct: true, pending: false },
    ])
  })

  it('scores a partially correct quiz and reports the ratio', () => {
    const quiz = { questions: [mcq('q1'), trueFalse('q2'), shortAnswer('q3')] }
    // mcq right (5) + true_false wrong (0) + short_answer right (2) = 7 / 10
    const result = gradeQuiz(quiz, { q1: 'o2', q2: false, q3: 'photosynthesis' })
    expect(result.total_score).toBe(7)
    expect(result.total_possible).toBe(10)
    expect(result.score_ratio).toBe(0.7)
    expect(result.per_question.map((p) => p.correct)).toEqual([true, false, true])
  })

  it('queues essays for the teacher without counting them as earned', () => {
    const quiz = { questions: [mcq('q1'), essay('q2')] }
    const result = gradeQuiz(quiz, { q1: 'o2', q2: 'A long answer.' })
    expect(result.has_essays).toBe(true)
    expect(result.total_score).toBe(5)
    // The essay's points still count towards possible, so the auto-score is a
    // floor the teacher can only raise.
    expect(result.total_possible).toBe(15)
    expect(result.score_ratio).toBe(0.33) // round2(5/15)
    expect(result.per_question[1]).toEqual({
      id: 'q2',
      qtype: 'essay',
      earned: 0,
      possible: 10,
      correct: null,
      pending: true,
    })
  })

  it('rolls matching partial credit into the totals', () => {
    // matching: 2 of 3 pairs at 10 points = 6.67; plus a correct mcq = 11.67 / 15
    const quiz = { questions: [mcq('q1'), matching('q2', 10, ['A', 'B', 'C'])] }
    const result = gradeQuiz(quiz, { q1: 'o2', q2: { 0: 'A', 1: 'B', 2: 'wrong' } })
    expect(result.per_question[1].earned).toBe(6.67)
    expect(result.per_question[1].correct).toBe(false)
    expect(result.total_score).toBe(11.67)
    expect(result.total_possible).toBe(15)
    expect(result.score_ratio).toBe(0.78) // round2(11.67/15)
  })

  it('scores an unanswered quiz as zero rather than throwing', () => {
    const quiz = { questions: [mcq('q1'), trueFalse('q2'), matching('q3', 6, ['A', 'B'])] }
    expect(gradeQuiz(quiz, {})).toMatchObject({
      total_score: 0,
      total_possible: 14,
      score_ratio: 0,
    })
    // The player can hand us a null answers map on an immediate submit.
    expect(gradeQuiz(quiz, null).total_score).toBe(0)
    expect(gradeQuiz(quiz, undefined).total_score).toBe(0)
  })

  it('guards the ratio against a zero-point quiz', () => {
    expect(gradeQuiz({ questions: [] }, {})).toMatchObject({
      total_score: 0,
      total_possible: 0,
      score_ratio: 0,
      has_essays: false,
      per_question: [],
    })
    expect(gradeQuiz({}, {}).score_ratio).toBe(0)
  })

  it('treats a question with no points as worth zero on both sides', () => {
    const quiz = { questions: [{ id: 'q1', qtype: 'mcq', options: mcq('x').options }] }
    const result = gradeQuiz(quiz, { q1: 'o2' })
    expect(result.total_possible).toBe(0)
    expect(result.total_score).toBe(0)
    expect(result.per_question[0].correct).toBe(true) // correct, just unweighted
  })

  it('ignores an answer submitted for a question that is not in the quiz', () => {
    const quiz = { questions: [mcq('q1')] }
    const result = gradeQuiz(quiz, { q1: 'o2', ghost: 'o2' })
    expect(result.total_score).toBe(5)
    expect(result.per_question).toHaveLength(1)
  })
})

describe('gradeAnswer — matching partial credit', () => {
  it('awards a proportional share of the points per correct pair', () => {
    const q = matching('m', 8, ['A', 'B', 'C', 'D'])
    // 3 of 4 pairs -> 8 * 3/4 = 6
    expect(gradeAnswer(q, { 0: 'A', 1: 'B', 2: 'C', 3: 'wrong' })).toEqual({
      earned: 6,
      correct: false,
    })
  })

  it('rounds partial credit to two decimals', () => {
    const q = matching('m', 10, ['A', 'B', 'C'])
    // 2 of 3 pairs -> 10 * 2/3 = 6.666.. -> 6.67
    expect(gradeAnswer(q, { 0: 'A', 1: 'B' })).toEqual({ earned: 6.67, correct: false })
    // 1 of 3 -> 3.333.. -> 3.33
    expect(gradeAnswer(q, { 0: 'A' })).toEqual({ earned: 3.33, correct: false })
  })

  it('marks the question correct only when every pair matches', () => {
    const q = matching('m', 8, ['A', 'B', 'C', 'D'])
    expect(gradeAnswer(q, { 0: 'A', 1: 'B', 2: 'C', 3: 'D' })).toEqual({
      earned: 8,
      correct: true,
    })
  })

  it('awards nothing when no pair matches', () => {
    const q = matching('m', 8, ['A', 'B', 'C', 'D'])
    expect(gradeAnswer(q, { 0: 'X', 1: 'Y', 2: 'Z', 3: 'W' })).toEqual({
      earned: 0,
      correct: false,
    })
  })

  it('awards nothing for a skipped matching question', () => {
    const q = matching('m', 8, ['A', 'B'])
    expect(gradeAnswer(q, undefined)).toEqual({ earned: 0, correct: false })
    expect(gradeAnswer(q, {})).toEqual({ earned: 0, correct: false })
  })

  it('never divides by zero on an empty or missing answer key', () => {
    expect(gradeAnswer({ qtype: 'matching', points: 8, answer_key: { pairs: [] } }, {})).toEqual({
      earned: 0,
      correct: false,
    })
    expect(gradeAnswer({ qtype: 'matching', points: 8 }, { 0: 'A' })).toEqual({
      earned: 0,
      correct: false,
    })
  })

  it('compares pairs as strings, so a numeric key still grades', () => {
    // Answer keys reach us from the builder, the AI draft path and the API; a
    // number in pairs[].right used to make the comparison miss.
    const q = matching('m', 4, [5, 10])
    expect(gradeAnswer(q, { 0: '5', 1: '10' })).toEqual({ earned: 4, correct: true })
  })

  it('does not credit a pair whose right side is blank against a blank answer', () => {
    const q = { qtype: 'matching', points: 4, answer_key: { pairs: [{ left: 'L1', right: 'A' }, { left: 'L2', right: 'B' }] } }
    // Only the answered pair scores: 4 * 1/2 = 2
    expect(gradeAnswer(q, { 0: 'A' })).toEqual({ earned: 2, correct: false })
  })
})

describe('gradeAnswer — other objective types', () => {
  it('grades mcq by option id', () => {
    expect(gradeAnswer(mcq('q'), 'o2')).toEqual({ earned: 5, correct: true })
    expect(gradeAnswer(mcq('q'), 'o1')).toEqual({ earned: 0, correct: false })
    expect(gradeAnswer(mcq('q'), null)).toEqual({ earned: 0, correct: false })
  })

  it('fails an mcq with no correct option flagged', () => {
    const broken = { qtype: 'mcq', points: 5, options: [{ id: 'o1', is_correct: false }] }
    expect(gradeAnswer(broken, 'o1')).toEqual({ earned: 0, correct: false })
    expect(gradeAnswer({ qtype: 'mcq', points: 5 }, 'o1')).toEqual({ earned: 0, correct: false })
  })

  it('requires a real boolean for true_false', () => {
    expect(gradeAnswer(trueFalse('q', 3, true), true)).toEqual({ earned: 3, correct: true })
    expect(gradeAnswer(trueFalse('q', 3, false), false)).toEqual({ earned: 3, correct: true })
    expect(gradeAnswer(trueFalse('q', 3, true), false)).toEqual({ earned: 0, correct: false })
    // The string "true" is not an answer -- it means the player sent raw input.
    expect(gradeAnswer(trueFalse('q', 3, true), 'true')).toEqual({ earned: 0, correct: false })
    expect(gradeAnswer(trueFalse('q', 3, true), undefined)).toEqual({ earned: 0, correct: false })
  })

  it('matches short_answer case-insensitively and ignores surrounding space', () => {
    const q = shortAnswer('q', 2, ['Photosynthesis', 'photo synthesis'])
    expect(gradeAnswer(q, '  PHOTOSYNTHESIS ')).toEqual({ earned: 2, correct: true })
    expect(gradeAnswer(q, 'photo synthesis')).toEqual({ earned: 2, correct: true })
    expect(gradeAnswer(q, 'respiration')).toEqual({ earned: 0, correct: false })
  })

  it('never credits a blank short_answer, even against a blank key entry', () => {
    const q = shortAnswer('q', 2, ['', '   ', 'Mitosis'])
    expect(gradeAnswer(q, '')).toEqual({ earned: 0, correct: false })
    expect(gradeAnswer(q, '   ')).toEqual({ earned: 0, correct: false })
    expect(gradeAnswer(q, undefined)).toEqual({ earned: 0, correct: false })
    expect(gradeAnswer(q, 'mitosis')).toEqual({ earned: 2, correct: true })
  })

  it('coerces a non-string short_answer key instead of throwing mid-grade', () => {
    // A number in answers[] used to throw "a.trim is not a function", which
    // loses the student's whole submission rather than just that question.
    const q = shortAnswer('q', 2, [42])
    expect(gradeAnswer(q, '42')).toEqual({ earned: 2, correct: true })
    expect(() => gradeAnswer(q, 42)).not.toThrow()
    expect(gradeAnswer(q, 42)).toEqual({ earned: 2, correct: true })
  })

  it('awards nothing for an unrecognised question type', () => {
    expect(gradeAnswer({ qtype: 'ordering', points: 5 }, ['a', 'b'])).toEqual({
      earned: 0,
      correct: false,
    })
    expect(gradeAnswer({ points: 5 }, 'x')).toEqual({ earned: 0, correct: false })
  })
})
