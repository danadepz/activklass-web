/**
 * Unit tests for the quiz → class record rules in ./quizToRecord.js.
 *
 * Every assertion here is a number that would appear on a report card. The
 * three "skip" cases matter most: each one is a wrong grade that would be
 * written confidently and never re-derived by anyone.
 */
import { describe, expect, it } from 'vitest'
import {
  SCORING_AVERAGE,
  SCORING_FIRST,
  SCORING_LAST,
  assessmentFromQuiz,
  assessmentIdForQuiz,
  attemptForScoring,
  bestAttempt,
  describeSyncResult,
  quizScoreCells,
  quizTotalPoints,
  quizzesToAutoPost,
} from './quizToRecord.js'

const attempt = (overrides = {}) => ({
  status: 'graded',
  total_score: 8,
  total_possible: 10,
  attempt_number: 1,
  ...overrides,
})

const students = [{ student_id: 's1' }, { student_id: 's2' }]

describe('bestAttempt', () => {
  it('picks the highest score, not the most recent', () => {
    const best = bestAttempt([
      attempt({ total_score: 9, attempt_number: 1 }),
      attempt({ total_score: 4, attempt_number: 2 }),
    ])
    expect(best.total_score).toBe(9)
  })

  it('breaks a tie toward the later attempt', () => {
    const best = bestAttempt([
      attempt({ total_score: 7, attempt_number: 1 }),
      attempt({ total_score: 7, attempt_number: 3 }),
    ])
    expect(best.attempt_number).toBe(3)
  })

  it('ignores attempts still in progress', () => {
    expect(bestAttempt([{ status: 'in_progress', total_score: 10 }])).toBeNull()
  })

  it('ignores an attempt whose score never landed', () => {
    expect(bestAttempt([attempt({ total_score: null })])).toBeNull()
  })

  it('returns null for a student with no attempts', () => {
    expect(bestAttempt([])).toBeNull()
  })
})

describe('quizScoreCells', () => {
  it('writes the best graded score in the record cell shape', () => {
    const result = quizScoreCells({
      attemptsByStudent: { s1: [attempt({ total_score: 6 }), attempt({ total_score: 9, attempt_number: 2 })] },
      students: [{ student_id: 's1' }],
      totalPoints: 10,
    })
    expect(result.scores).toEqual({ s1: { status: 'graded', raw_score: 9 } })
  })

  it('leaves a student who never took it blank rather than zero', () => {
    const result = quizScoreCells({ attemptsByStudent: {}, students, totalPoints: 10 })
    expect(result.scores).toEqual({})
    expect(result.notTaken).toEqual(['s1', 's2'])
  })

  it('skips an attempt with essays still unmarked', () => {
    const result = quizScoreCells({
      attemptsByStudent: { s1: [attempt({ status: 'submitted', has_essays_pending: true })] },
      students: [{ student_id: 's1' }],
      totalPoints: 10,
    })
    expect(result.scores).toEqual({})
    expect(result.pendingEssays).toEqual(['s1'])
  })

  it('skips an attempt marked out of a different total', () => {
    // The quiz was edited after this student took it.
    const result = quizScoreCells({
      attemptsByStudent: { s1: [attempt({ total_possible: 8 })] },
      students: [{ student_id: 's1' }],
      totalPoints: 10,
    })
    expect(result.scores).toEqual({})
    expect(result.versionMismatch).toEqual(['s1'])
  })

  it('accepts an attempt when the total is not known', () => {
    const result = quizScoreCells({
      attemptsByStudent: { s1: [attempt({ total_possible: 8 })] },
      students: [{ student_id: 's1' }],
      totalPoints: null,
    })
    expect(result.scores.s1.raw_score).toBe(8)
  })

  it('reads students keyed by id as well as student_id', () => {
    const result = quizScoreCells({
      attemptsByStudent: { s1: [attempt()] },
      students: [{ id: 's1' }],
      totalPoints: 10,
    })
    expect(result.scores.s1).toBeDefined()
  })

  it('never recomputes a score a teacher typed by hand, even with a newer attempt', () => {
    const result = quizScoreCells({
      attemptsByStudent: { s1: [attempt({ total_score: 5 })] },
      students: [{ student_id: 's1' }],
      totalPoints: 10,
      existingScores: { s1: { status: 'graded', raw_score: 8, manual: true } },
    })
    // Carried forward unchanged, not just left out -- a merge write with an
    // *empty* scores object would wipe the whole map (Firestore replaces a
    // nested map field wholesale when it has no leaf paths to merge on), so
    // the kept value has to still be there for the write to stay safe.
    expect(result.scores).toEqual({ s1: { status: 'graded', raw_score: 8, manual: true } })
    expect(result.kept).toEqual(['s1'])
  })

  it('never recomputes a score a recovery already applied', () => {
    const result = quizScoreCells({
      attemptsByStudent: { s1: [attempt({ total_score: 5 })] },
      students: [{ student_id: 's1' }],
      totalPoints: 10,
      existingScores: { s1: { status: 'graded', raw_score: 8 } },
      existingRecovery: { s1: { applied_score: 8 } },
    })
    expect(result.scores).toEqual({ s1: { status: 'graded', raw_score: 8 } })
    expect(result.kept).toEqual(['s1'])
  })

  it('still posts an untouched student alongside a kept one', () => {
    const result = quizScoreCells({
      attemptsByStudent: { s1: [attempt({ total_score: 5 })], s2: [attempt({ total_score: 6 })] },
      students,
      totalPoints: 10,
      existingScores: { s1: { status: 'graded', raw_score: 9, manual: true } },
    })
    expect(result.scores).toEqual({
      s1: { status: 'graded', raw_score: 9, manual: true },
      s2: { status: 'graded', raw_score: 6 },
    })
    expect(result.kept).toEqual(['s1'])
  })

  it('produces a non-empty scores object when every student is kept, so the write cannot wipe the map', () => {
    const result = quizScoreCells({
      attemptsByStudent: { s1: [attempt({ total_score: 5 })] },
      students: [{ student_id: 's1' }],
      totalPoints: 10,
      existingScores: { s1: { status: 'graded', raw_score: 8, manual: true } },
    })
    expect(Object.keys(result.scores)).toHaveLength(1)
  })
})

describe('assessmentFromQuiz', () => {
  it('maps the quiz onto the record row and stays traceable', () => {
    const row = assessmentFromQuiz({
      quiz: { id: 'q1', title: 'Chapter 3' },
      mapping: { component_id: 'ww', grading_period_id: 'p1' },
      totalPoints: 20,
    })
    expect(row).toMatchObject({
      title: 'Chapter 3',
      component_id: 'ww',
      period_id: 'p1',
      kind: 'quiz',
      total_points: 20,
      source_quiz_id: 'q1',
    })
  })

  it('never carries a scores map, so a merge cannot wipe hand-typed marks', () => {
    const row = assessmentFromQuiz({
      quiz: { id: 'q1', title: 'Chapter 3' },
      mapping: { component_id: 'ww', grading_period_id: 'p1' },
      totalPoints: 20,
    })
    expect('scores' in row).toBe(false)
  })

  it('derives one stable id per quiz so publishing twice cannot duplicate the row', () => {
    expect(assessmentIdForQuiz('q1')).toBe(assessmentIdForQuiz('q1'))
    expect(assessmentIdForQuiz('q1')).not.toBe(assessmentIdForQuiz('q2'))
  })
})

describe('quizTotalPoints', () => {
  it('sums question points and tolerates a missing one', () => {
    expect(quizTotalPoints({ questions: [{ points: 5 }, { points: '3' }, {}] })).toBe(8)
  })

  it('is zero for a quiz with no questions', () => {
    expect(quizTotalPoints({})).toBe(0)
  })
})

describe('describeSyncResult', () => {
  it('accounts for every student who did not get a score', () => {
    expect(describeSyncResult({ written: 31, pendingEssays: 3, notTaken: 5, versionMismatch: 1 }))
      .toBe('31 scores posted to the class record · 3 waiting on essay marking · 5 have not taken it · 1 took an earlier version of this quiz.')
  })

  it('reads plainly when everything landed', () => {
    expect(describeSyncResult({ written: 1 })).toBe('1 score posted to the class record.')
  })

  it('names how many were left as typed', () => {
    expect(describeSyncResult({ written: 5, kept: 2 })).toBe('5 scores posted to the class record · 2 kept as typed.')
  })
})

describe('attemptForScoring', () => {
  const three = [
    attempt({ total_score: 4, attempt_number: 1 }),
    attempt({ total_score: 9, attempt_number: 2 }),
    attempt({ total_score: 7, attempt_number: 3 }),
  ]

  it('takes the highest under best', () => {
    expect(attemptForScoring(three).total_score).toBe(9)
  })

  it('takes the most recent under last, even when it is worse', () => {
    expect(attemptForScoring(three, SCORING_LAST).total_score).toBe(7)
  })

  it('takes the first sitting under first', () => {
    expect(attemptForScoring(three, SCORING_FIRST).total_score).toBe(4)
  })

  it('reads attempt order from attempt_number, not array order', () => {
    const jumbled = [three[2], three[0], three[1]]
    expect(attemptForScoring(jumbled, SCORING_FIRST).attempt_number).toBe(1)
    expect(attemptForScoring(jumbled, SCORING_LAST).attempt_number).toBe(3)
  })

  it('averages by ratio and reports how many it averaged', () => {
    const avg = attemptForScoring(three, SCORING_AVERAGE)
    expect(avg.total_score).toBeCloseTo(6.67, 2) // (4 + 9 + 7) / 3, all out of 10
    expect(avg.attempts_averaged).toBe(3)
    expect(avg.derived).toBe(SCORING_AVERAGE)
  })

  it('averages performance, not raw marks, when the quiz was edited between sittings', () => {
    // 8/10 then 8/20 is 80% then 40% — a raw mean of 8 would call that 8/20.
    const avg = attemptForScoring(
      [
        attempt({ total_score: 8, total_possible: 10, attempt_number: 1 }),
        attempt({ total_score: 8, total_possible: 20, attempt_number: 2 }),
      ],
      SCORING_AVERAGE,
    )
    expect(avg.total_score).toBe(12) // 60% of the latest paper's 20
    expect(avg.total_possible).toBe(20)
  })

  it('returns null when nothing is scorable, whatever the policy', () => {
    for (const policy of [SCORING_LAST, SCORING_FIRST, SCORING_AVERAGE]) {
      expect(attemptForScoring([{ status: 'in_progress' }], policy)).toBeNull()
    }
  })
})

describe('quizScoreCells · scoring policy', () => {
  const attempts = {
    s1: [attempt({ total_score: 4, attempt_number: 1 }), attempt({ total_score: 9, attempt_number: 2 })],
  }
  const student = [{ student_id: 's1' }]

  it('records the best attempt by default', () => {
    const r = quizScoreCells({ attemptsByStudent: attempts, students: student, totalPoints: 10 })
    expect(r.scores.s1.raw_score).toBe(9)
  })

  it('records the last attempt when the quiz says so', () => {
    const r = quizScoreCells({
      attemptsByStudent: attempts,
      students: student,
      totalPoints: 10,
      scoringPolicy: SCORING_LAST,
    })
    expect(r.scores.s1.raw_score).toBe(9)
  })

  it('records a worse last attempt rather than the best one', () => {
    const r = quizScoreCells({
      attemptsByStudent: { s1: [attempt({ total_score: 9, attempt_number: 1 }), attempt({ total_score: 3, attempt_number: 2 })] },
      students: student,
      totalPoints: 10,
      scoringPolicy: SCORING_LAST,
    })
    expect(r.scores.s1.raw_score).toBe(3)
  })
})

describe('quizTotalPoints · pooled quizzes', () => {
  it('marks a pooled quiz out of the draw, not the pool', () => {
    const quiz = {
      pool_enabled: true,
      pool_draw_count: 10,
      questions: Array.from({ length: 30 }, () => ({ points: 2 })),
    }
    expect(quizTotalPoints(quiz)).toBe(20)
  })
})

describe('quizzesToAutoPost', () => {
  const mapped = { status: 'published', class_ids: ['c1', 'c2'], class_mappings: { c1: { component_id: 'ww', grading_period_id: 'q1' } } }
  const draft = { ...mapped, status: 'draft' }
  const elsewhere = { ...mapped, class_ids: ['c9'] }
  const unmapped = { ...mapped, class_mappings: {} }

  it('keeps only published quizzes assigned to the class with a mapping there', () => {
    expect(quizzesToAutoPost([mapped, draft, elsewhere, unmapped], 'c1')).toEqual([mapped])
  })

  it('is empty for a class the quiz is assigned to but not mapped in, and with no class', () => {
    expect(quizzesToAutoPost([mapped], 'c2')).toEqual([])
    expect(quizzesToAutoPost([mapped], '')).toEqual([])
  })
})
