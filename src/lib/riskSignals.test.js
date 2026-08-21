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
