/**
 * Tests for ./riskSignals.js — the three leading indicators that make
 * /api/predict an early warning rather than a second reading of the gradebook.
 *
 * Two failure modes are worth more than the rest, and neither throws:
 *
 *  1. A reversed log. The student page sorts attendance newest-first for
 *     display and the class query builds it oldest-first. Difference the wrong
 *     end and every sliding student is cleared while every improving one is
 *     flagged — a working panel, confidently inverted.
 *  2. A trend reported from too little history. Returning 0 for "we have three
 *     days of attendance" tells the model "measured, and flat", and it scores
 *     that student as steady. undefined tells the truth and shows up in the
 *     coverage figure a teacher reads.
 */
import { describe, expect, it } from 'vitest'
import {
  attendanceTrendFromLog,
  missedQuizCounts,
  missingRate,
  missingWorkCounts,
  missingWorkCountsFromEntry,
  quizTrendFromAttempts,
  splitTrend,
} from './riskSignals'

/** Attendance log in chronological order; `s` is one status per day. */
const log = (...statuses) =>
  statuses.map((status, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, status }))

const attempt = (pct, day) => ({
  total_score: pct,
  total_possible: 100,
  submitted_at: `2026-09-${String(day).padStart(2, '0')}`,
})

describe('splitTrend', () => {
  it('is negative when the trailing third is worse', () => {
    // 6 values -> the last 2 against the first 4: mean 7 minus mean 10.
    expect(splitTrend([10, 10, 10, 10, 10, 4], 6)).toBeCloseTo(-3)
  })

  it('is positive when the trailing third is better', () => {
    expect(splitTrend([2, 2, 2, 2, 2, 8], 6)).toBeCloseTo(3)
  })

  it('is zero for a genuinely flat series', () => {
    expect(splitTrend([5, 5, 5, 5, 5, 5], 6)).toBe(0)
  })

  it('returns undefined below the minimum rather than a comforting zero', () => {
    expect(splitTrend([1, 0, 1], 6)).toBeUndefined()
    expect(splitTrend([], 6)).toBeUndefined()
    expect(splitTrend(undefined, 6)).toBeUndefined()
  })

  it('scales its window with the length of the series', () => {
    // 9 values -> last 3 against the first 6, not a fixed tail.
    expect(splitTrend([9, 9, 9, 9, 9, 9, 0, 0, 0], 6)).toBeCloseTo(0 - 9)
  })
})

describe('attendanceTrendFromLog', () => {
  it('reads a decline as negative', () => {
    // Four present days, then two absent.
    expect(attendanceTrendFromLog(log('present', 'present', 'present', 'present', 'absent', 'absent')))
      .toBeLessThan(0)
  })

  it('gives the same answer whichever way the caller sorted the log', () => {
    const chronological = log('present', 'present', 'present', 'present', 'absent', 'absent')
    const newestFirst = [...chronological].reverse()
    // The bug this guards is silent and total: a reversed log flips the sign,
    // so every sliding student reads as improving.
    expect(attendanceTrendFromLog(newestFirst)).toBe(attendanceTrendFromLog(chronological))
    expect(attendanceTrendFromLog(newestFirst)).toBeLessThan(0)
  })

  it('counts late as half a day and ignores excused entirely', () => {
    // Excused days are dropped, so this is six counted days ending in lates.
    const withExcused = log(
      'present', 'present', 'excused', 'present', 'present',
      'present', 'present', 'late', 'late',
    )
    expect(attendanceTrendFromLog(withExcused)).toBeLessThan(0)
  })

  it('reports nothing in the first week of term', () => {
    expect(attendanceTrendFromLog(log('present', 'absent', 'absent'))).toBeUndefined()
    expect(attendanceTrendFromLog([])).toBeUndefined()
    expect(attendanceTrendFromLog(undefined)).toBeUndefined()
  })
})

describe('quizTrendFromAttempts', () => {
  it('orders by submission, not by array order', () => {
    const shuffled = [attempt(40, 9), attempt(90, 1), attempt(85, 3)]
    // Chronologically 90, 85, 40 -> the last third (40) against the first two.
    expect(quizTrendFromAttempts(shuffled)).toBeCloseTo(40 - 87.5)
    // Array order must not change the answer.
    expect(quizTrendFromAttempts([attempt(90, 1), attempt(85, 3), attempt(40, 9)]))
      .toBe(quizTrendFromAttempts(shuffled))
  })

  it('catches a decline the best-score average hides', () => {
    const attempts = [attempt(95, 1), attempt(80, 5), attempt(45, 9)]
    // Math.max would report 95 and call this student excellent.
    expect(Math.max(...attempts.map((a) => a.total_score))).toBe(95)
    expect(quizTrendFromAttempts(attempts)).toBeLessThan(0)
  })

  it('skips attempts still awaiting manual grading', () => {
    const pending = { total_score: null, total_possible: 100, submitted_at: '2026-09-10' }
    const graded = [attempt(90, 1), attempt(80, 3), attempt(70, 5)]
    expect(quizTrendFromAttempts([...graded, pending])).toBe(quizTrendFromAttempts(graded))
  })

  it('reports nothing from one or two attempts', () => {
    expect(quizTrendFromAttempts([attempt(90, 1), attempt(20, 5)])).toBeUndefined()
    expect(quizTrendFromAttempts([])).toBeUndefined()
  })
})

describe('missing work — assessments', () => {
  const assessments = [
    { scores: { s1: { status: 'graded', raw_score: 8 }, s2: { status: 'missing' } } },
    { scores: { s1: { status: 'missing' }, s2: { status: 'missing' } } },
    { scores: { s1: { status: 'excused' }, s2: { status: 'graded', raw_score: 9 } } },
  ]

  it('counts what was expected and what was not done, excluding excused', () => {
    expect(missingWorkCounts(assessments, 's1')).toEqual({ notDone: 1, expected: 2 })
    expect(missingWorkCounts(assessments, 's2')).toEqual({ notDone: 2, expected: 3 })
  })

  it('does not count an assessment a student has no record on', () => {
    expect(missingWorkCounts(assessments, 'nobody')).toEqual({ notDone: 0, expected: 0 })
  })

  it('agrees with itself across the two Firestore shapes', () => {
    // gradebooks/{class}/assessments keys scores by student; the student's own
    // entry doc has them flattened. Same student, same number, or a student and
    // their teacher would be looking at different figures.
    const entryShape = [{ status: 'graded' }, { status: 'missing' }, { status: 'excused' }]
    expect(missingWorkCountsFromEntry(entryShape)).toEqual(missingWorkCounts(assessments, 's1'))
  })
})

describe('missing work — quizzes never attempted', () => {
  const NOW = Date.parse('2026-10-01T00:00:00Z')
  const past = '2026-09-01T00:00:00Z'
  const future = '2026-11-01T00:00:00Z'
  const none = new Set()

  it('counts a closed quiz the student never sat', () => {
    const quizzes = [{ id: 'q1', status: 'closed' }]
    expect(missedQuizCounts(quizzes, none, 's1', NOW)).toEqual({ notDone: 1, expected: 1 })
  })

  it('does not count one they did sit', () => {
    const quizzes = [{ id: 'q1', status: 'closed' }]
    expect(missedQuizCounts(quizzes, new Set(['q1']), 's1', NOW))
      .toEqual({ notDone: 0, expected: 1 })
  })

  it('counts a published quiz whose deadline has passed', () => {
    const quizzes = [{ id: 'q1', status: 'published', closes_at: past }]
    expect(missedQuizCounts(quizzes, none, 's1', NOW)).toEqual({ notDone: 1, expected: 1 })
  })

  it('leaves a quiz they can still take out of it entirely', () => {
    // Not expected work yet. Counting it would flag every student in the class
    // the morning a quiz is published, which would make the panel useless.
    const quizzes = [
      { id: 'q1', status: 'published', closes_at: future },
      { id: 'q2', status: 'published' }, // open-ended, never overdue
    ]
    expect(missedQuizCounts(quizzes, none, 's1', NOW)).toEqual({ notDone: 0, expected: 0 })
  })

  it('ignores drafts', () => {
    expect(missedQuizCounts([{ id: 'q1', status: 'draft' }], none, 's1', NOW))
      .toEqual({ notDone: 0, expected: 0 })
  })

  it('respects per-student assignment', () => {
    const quizzes = [
      { id: 'q1', status: 'closed', assigned_to: ['s2'] },
      { id: 'q2', status: 'closed', assigned_to: 'all' },
      { id: 'q3', status: 'closed', assigned_to: ['s1', 's2'] },
    ]
    // s1 was never given q1, so not sitting it is not a miss.
    expect(missedQuizCounts(quizzes, none, 's1', NOW)).toEqual({ notDone: 2, expected: 2 })
    expect(missedQuizCounts(quizzes, none, 's2', NOW)).toEqual({ notDone: 3, expected: 3 })
  })

  it('handles an unparseable closes_at without counting it', () => {
    const quizzes = [{ id: 'q1', status: 'published', closes_at: 'not a date' }]
    expect(missedQuizCounts(quizzes, none, 's1', NOW)).toEqual({ notDone: 0, expected: 0 })
  })

  it('reports nothing when there are no quizzes', () => {
    expect(missedQuizCounts([], none, 's1', NOW)).toEqual({ notDone: 0, expected: 0 })
    expect(missedQuizCounts(undefined, undefined, 's1', NOW)).toEqual({ notDone: 0, expected: 0 })
  })
})

describe('missingRate pools both sources', () => {
  it('divides once over the pooled counts, not by averaging rates', () => {
    // 1 of 1 assessments missing and 0 of 8 quizzes missed is not 50% adrift.
    const rate = missingRate({ notDone: 1, expected: 1 }, { notDone: 0, expected: 8 })
    expect(rate).toBeCloseTo(1 / 9)
  })

  it('surfaces a student whose assessments look fine but who sits no quizzes', () => {
    // The blind spot in one line: nothing marked missing in the gradebook, and
    // four closed quizzes never opened.
    const rate = missingRate({ notDone: 0, expected: 2 }, { notDone: 4, expected: 4 })
    expect(rate).toBeCloseTo(4 / 6)
    expect(rate).toBeGreaterThan(0.2) // over the band that names the signal
  })

  it('is undefined when nothing has been expected of the student yet', () => {
    expect(missingRate({ notDone: 0, expected: 0 }, { notDone: 0, expected: 0 })).toBeUndefined()
    expect(missingRate()).toBeUndefined()
    expect(missingRate(undefined, null)).toBeUndefined()
  })

  it('is a measured zero once anything has been expected', () => {
    // Distinct from undefined: this student HAS been given work and has done
    // all of it, which is evidence and should count toward coverage.
    expect(missingRate({ notDone: 0, expected: 3 })).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 2026-11-22 risk-evidence work: distinct quizzes, one attendance rate, and a
// disclosure breakdown for missing work. Synthetic fixtures only.
// ---------------------------------------------------------------------------
import {
  attendanceRateFromLog,
  attendanceRateFromMarks,
  distinctQuizScores,
  quizAverageFromAttempts,
  quizEvidence,
  quizTrendFromAttempts as quizTrendDistinct,
  workEvidence,
} from './riskSignals'

const att = (quiz_id, score, possible, day, extra = {}) =>
  ({ quiz_id, total_score: score, total_possible: possible, submitted_at: `2026-11-${day}T08:00:00Z`, ...extra })

describe('quiz indicators · one value per distinct quiz', () => {
  const attempts = [
    att('q1', 4, 10, '02'),
    att('q1', 9, 10, '03'),            // retake: best of q1 is 90
    att('q2', 0, 10, '05'),            // a real zero
    att('q3', null, 10, '06'),         // awaiting grading
    att('q4', 5, 0, '07'),             // unusable: no possible points
  ]

  it('averages the best attempt of each graded quiz, zeros included', () => {
    expect(quizAverageFromAttempts(attempts)).toBe(45)
    expect(distinctQuizScores(attempts).map((q) => q.quizId)).toEqual(['q1', 'q2'])
  })

  it('no longer reports the single best attempt across all quizzes', () => {
    // The old teacher figure here would have been 90.
    expect(quizAverageFromAttempts(attempts)).not.toBe(90)
  })

  it('does not let retakes of one quiz manufacture a trend', () => {
    const retakes = [att('q1', 9, 10, '02'), att('q1', 5, 10, '03'), att('q1', 2, 10, '04')]
    expect(quizTrendDistinct(retakes)).toBeUndefined()
  })

  it('trends distinct quizzes in the order they were first taken', () => {
    const list = [
      att('q3', 4, 10, '09'),
      att('q1', 9, 10, '02'),
      att('q2', 8, 10, '05'),
      att('q1', 10, 10, '10'), // late retake of q1 stays dated at q1's first try
    ]
    // order q1(100) q2(80) q3(40): recent third (40) minus earlier (90)
    expect(quizTrendDistinct(list)).toBe(-50)
  })

  it('keeps legacy attempts without quiz_id as separate quizzes', () => {
    expect(distinctQuizScores([att(undefined, 5, 10, '02'), att(undefined, 7, 10, '03')])).toHaveLength(2)
  })

  it('counts graded, awaiting and folded retakes', () => {
    expect(quizEvidence(attempts)).toEqual({ gradedQuizzes: 2, awaitingGrading: 2, retakesFolded: 1 })
  })

  it('returns undefined, not 0, with no graded quiz', () => {
    expect(quizAverageFromAttempts([att('q3', null, 10, '06')])).toBeUndefined()
  })
})

describe('attendance rate · one formula for teacher and student views', () => {
  it('weights late at half and leaves excused out', () => {
    expect(attendanceRateFromMarks(['present', 'late', 'absent', 'excused'])).toBe(50)
    expect(attendanceRateFromLog([{ status: 'present' }, { status: 'excused' }])).toBe(100)
  })

  it('is undefined with nothing recorded', () => {
    expect(attendanceRateFromMarks([])).toBeUndefined()
    expect(attendanceRateFromLog([{ status: 'excused' }])).toBeUndefined()
  })
})

describe('workEvidence · missing, submitted, ungraded, excused, unknown, not due', () => {
  const NOW = Date.parse('2026-11-20T00:00:00Z')
  const assessments = [
    { scores: { s1: { status: 'missing' } } },
    { scores: { s1: { status: 'graded', raw_score: 0 } } },  // zero is submitted, not missing
    { scores: { s1: { status: 'graded', raw_score: null } } },
    { scores: { s1: { status: 'excused' } } },
    { scores: {}, date_given: '2026-11-01' },
    { scores: {}, date_given: '2026-12-01' },
  ]
  const quizzes = [
    { id: 'qa', status: 'closed' },
    { id: 'qb', status: 'closed' },
    { id: 'qc', status: 'published', closes_at: '2026-12-01T00:00' },
    { id: 'qd', status: 'draft' },
    { id: 'qe', status: 'closed', assigned_to: ['someone-else'] },
  ]

  it('sorts every item into one bucket', () => {
    expect(workEvidence(assessments, quizzes, new Set(['qa']), 's1', NOW)).toEqual({
      missing: 2, submitted: 2, ungraded: 1, excused: 1, unknown: 1, notDue: 2,
    })
  })

  it('leaves the existing pooled rate unchanged', () => {
    const rate = missingRate(missingWorkCounts(assessments, 's1'), missedQuizCounts(quizzes, new Set(['qa']), 's1', NOW))
    // missing / (missing + submitted + ungraded): 2 / 5, what the panel shows as "due"
    expect(rate).toBeCloseTo(2 / 5)
  })
})
