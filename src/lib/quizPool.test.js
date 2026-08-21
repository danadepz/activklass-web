/**
 * Unit tests for the per-student paper in ./quizPool.js.
 *
 * Determinism is the property under test, not a detail of it: if the draw is
 * not stable, a student who refreshes a pooled quiz loses the answers they
 * have already given, because those answers belong to questions that are no
 * longer on their paper.
 */
import { describe, expect, it } from 'vitest'
import {
  drawTotalPoints,
  hashSeed,
  poolProblem,
  questionIdsOf,
  questionsForStudent,
  questionsOfAttempt,
  seededRandom,
  shuffleSeeded,
} from './quizPool.js'

const pool = (n, points = 2) =>
  Array.from({ length: n }, (_, i) => ({
    id: `q${i + 1}`,
    qtype: 'mcq',
    text: `Question ${i + 1}`,
    points,
    options: [
      { id: `q${i + 1}o1`, text: 'A', is_correct: true },
      { id: `q${i + 1}o2`, text: 'B', is_correct: false },
      { id: `q${i + 1}o3`, text: 'C', is_correct: false },
    ],
  }))

const quiz = (overrides = {}) => ({ id: 'quiz1', questions: pool(30), ...overrides })

describe('seededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const a = seededRandom(12345)
    const b = seededRandom(12345)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('produces a different sequence for a different seed', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)())
  })

  it('stays inside [0, 1)', () => {
    const next = seededRandom(99)
    for (let i = 0; i < 200; i++) {
      const v = next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('shuffleSeeded', () => {
  it('keeps every item', () => {
    const out = shuffleSeeded([1, 2, 3, 4, 5], 7)
    expect(out.sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('does not mutate its input', () => {
    const input = [1, 2, 3]
    shuffleSeeded(input, 7)
    expect(input).toEqual([1, 2, 3])
  })
})

describe('questionsForStudent · the draw', () => {
  const q = quiz({ pool_enabled: true, pool_draw_count: 10 })

  it('draws exactly the requested number', () => {
    expect(questionsForStudent(q, { studentId: 's1' })).toHaveLength(10)
  })

  it('gives the same student the same paper every time', () => {
    const first = questionsForStudent(q, { studentId: 's1' })
    const again = questionsForStudent(q, { studentId: 's1' })
    expect(questionIdsOf(again)).toEqual(questionIdsOf(first))
  })

  it('gives different students different papers', () => {
    const a = questionIdsOf(questionsForStudent(q, { studentId: 's1' }))
    const b = questionIdsOf(questionsForStudent(q, { studentId: 's2' }))
    expect(a).not.toEqual(b)
  })

  it('gives the same student a different paper on a retake', () => {
    const first = questionIdsOf(questionsForStudent(q, { studentId: 's1', attemptNumber: 1 }))
    const second = questionIdsOf(questionsForStudent(q, { studentId: 's1', attemptNumber: 2 }))
    expect(second).not.toEqual(first)
  })

  it('never repeats a question within one paper', () => {
    const ids = questionIdsOf(questionsForStudent(q, { studentId: 's3' }))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('hands over the whole pool when the draw exceeds it', () => {
    const small = quiz({ questions: pool(4), pool_enabled: true, pool_draw_count: 10 })
    expect(questionsForStudent(small, { studentId: 's1' })).toHaveLength(4)
  })

  it('leaves an unpooled quiz whole and in its stored order', () => {
    const plain = quiz()
    expect(questionIdsOf(questionsForStudent(plain, { studentId: 's1' })))
      .toEqual(questionIdsOf(plain.questions))
  })

  it('draws the same set whether or not shuffling is on', () => {
    const shuffled = { ...q, shuffle_questions: true }
    const a = questionIdsOf(questionsForStudent(q, { studentId: 's1' })).sort()
    const b = questionIdsOf(questionsForStudent(shuffled, { studentId: 's1' })).sort()
    expect(b).toEqual(a)
  })
})

describe('questionsForStudent · shuffling', () => {
  it('reorders questions only when asked', () => {
    const plain = quiz({ questions: pool(12) })
    const shuffled = quiz({ questions: pool(12), shuffle_questions: true })
    const order = questionIdsOf(questionsForStudent(plain, { studentId: 's1' }))
    const mixed = questionIdsOf(questionsForStudent(shuffled, { studentId: 's1' }))
    expect(order).toEqual(questionIdsOf(plain.questions))
    expect(mixed).not.toEqual(order)
    expect([...mixed].sort()).toEqual([...order].sort())
  })

  it('reorders options only when asked', () => {
    const plain = questionsForStudent(quiz({ questions: pool(6) }), { studentId: 's1' })
    const mixed = questionsForStudent(
      quiz({ questions: pool(6), shuffle_options: true }),
      { studentId: 's1' },
    )
    expect(plain[0].options.map((o) => o.id)).toEqual(['q1o1', 'q1o2', 'q1o3'])
    const anyReordered = mixed.some(
      (q, i) => q.options.map((o) => o.id).join() !== plain[i].options.map((o) => o.id).join(),
    )
    expect(anyReordered).toBe(true)
  })

  it('keeps every option and its correctness when reordering', () => {
    const [first] = questionsForStudent(
      quiz({ questions: pool(3), shuffle_options: true }),
      { studentId: 's1' },
    )
    expect(first.options.map((o) => o.id).sort()).toEqual(['q1o1', 'q1o2', 'q1o3'])
    expect(first.options.filter((o) => o.is_correct)).toHaveLength(1)
  })

  it('does not reorder the options of a non-mcq question', () => {
    const tf = [{ id: 'q1', qtype: 'true_false', text: 'T?', points: 1, answer_key: { value: true } }]
    const [only] = questionsForStudent({ id: 'z', questions: tf, shuffle_options: true }, { studentId: 's1' })
    expect(only.answer_key).toEqual({ value: true })
  })

  it('does not mutate the stored quiz', () => {
    const q = quiz({ questions: pool(5), shuffle_options: true, shuffle_questions: true })
    const before = JSON.stringify(q)
    questionsForStudent(q, { studentId: 's1' })
    expect(JSON.stringify(q)).toBe(before)
  })
})

describe('poolProblem', () => {
  it('passes an unpooled quiz without inspecting it', () => {
    expect(poolProblem(quiz({ questions: pool(3, 5).concat(pool(2, 1)) }))).toBeNull()
  })

  it('passes a well-formed pool', () => {
    expect(poolProblem(quiz({ pool_enabled: true, pool_draw_count: 10 }))).toBeNull()
  })

  it('rejects a draw larger than the pool', () => {
    const problem = poolProblem(quiz({ questions: pool(5), pool_enabled: true, pool_draw_count: 10 }))
    expect(problem).toMatch(/5 question\(s\) but draws 10/)
  })

  it('rejects unequal points, because the papers would not be comparable', () => {
    const mixed = [...pool(3, 2), ...pool(2, 5)]
    const problem = poolProblem(quiz({ questions: mixed, pool_enabled: true, pool_draw_count: 3 }))
    expect(problem).toMatch(/same points/)
  })

  it('rejects a missing draw count', () => {
    expect(poolProblem(quiz({ pool_enabled: true }))).toMatch(/how many questions/)
  })
})

describe('drawTotalPoints', () => {
  it('is the draw size times the per-question points when pooled', () => {
    expect(drawTotalPoints(quiz({ questions: pool(30, 2), pool_enabled: true, pool_draw_count: 10 }))).toBe(20)
  })

  it('is the whole paper when not pooled', () => {
    expect(drawTotalPoints(quiz({ questions: pool(5, 3) }))).toBe(15)
  })
})

describe('questionsOfAttempt', () => {
  const q = quiz({ questions: pool(10) })

  it('rebuilds the paper the student actually sat', () => {
    const sat = questionsOfAttempt(q, { question_ids: ['q3', 'q1'] })
    expect(questionIdsOf(sat)).toEqual(['q3', 'q1'])
  })

  it('reads a pre-pooling attempt as having sat the whole quiz', () => {
    expect(questionsOfAttempt(q, {})).toHaveLength(10)
  })

  it('drops an id whose question has since been deleted', () => {
    expect(questionIdsOf(questionsOfAttempt(q, { question_ids: ['q1', 'gone'] }))).toEqual(['q1'])
  })
})

describe('hashSeed', () => {
  it('is stable and unsigned', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'))
    expect(hashSeed('abc')).toBeGreaterThanOrEqual(0)
  })

  it('separates near-identical keys', () => {
    expect(hashSeed('quiz1::s1::1')).not.toBe(hashSeed('quiz1::s1::2'))
  })
})
