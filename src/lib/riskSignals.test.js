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

// One graded quiz per call: quiz `q{day}`, due on day `day` (see DUE below).
const attempt = (pct, day) => ({
  quiz_id: `q${day}`,
  total_score: pct,
  total_possible: 100,
  submitted_at: `2026-09-${String(day).padStart(2, '0')}`,
})
/** Authoritative due dates for the `attempt` helper's quizzes (policy A3). */
const DUE = Object.fromEntries(Array.from({ length: 28 }, (_, i) => [`q${i + 1}`, `2026-09-${String(i + 1).padStart(2, '0')}`]))

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
  it("orders by the quizzes' due dates, not by array order or submission time", () => {
    const shuffled = [attempt(40, 9), attempt(90, 1), attempt(85, 3)]
    // By due date 90, 85, 40 -> the last third (40) against the first two.
    expect(quizTrendFromAttempts(shuffled, DUE)).toBeCloseTo(40 - 87.5)
    expect(quizTrendFromAttempts([attempt(90, 1), attempt(85, 3), attempt(40, 9)], DUE))
      .toBe(quizTrendFromAttempts(shuffled, DUE))
    // Submitting the oldest quiz last does not move it: chronology is the due date.
    const lateSubmit = [{ ...attempt(90, 1), submitted_at: '2026-09-20' }, attempt(85, 3), attempt(40, 9)]
    expect(quizTrendFromAttempts(lateSubmit, DUE)).toBeCloseTo(40 - 87.5)
  })

  it('catches a decline the best-score average hides', () => {
    const attempts = [attempt(95, 1), attempt(80, 5), attempt(45, 9)]
    // Math.max would report 95 and call this student excellent.
    expect(Math.max(...attempts.map((a) => a.total_score))).toBe(95)
    expect(quizTrendFromAttempts(attempts, DUE)).toBeLessThan(0)
  })

  it('skips attempts still awaiting manual grading', () => {
    const pending = { quiz_id: 'q10', total_score: null, total_possible: 100, submitted_at: '2026-09-10' }
    const graded = [attempt(90, 1), attempt(80, 3), attempt(70, 5)]
    expect(quizTrendFromAttempts([...graded, pending], DUE)).toBe(quizTrendFromAttempts(graded, DUE))
  })

  it('reports nothing from one or two attempts', () => {
    expect(quizTrendFromAttempts([attempt(90, 1), attempt(20, 5)], DUE)).toBeUndefined()
    expect(quizTrendFromAttempts([], DUE)).toBeUndefined()
  })

  it('reports nothing when the quizzes have no authoritative date -- none is invented', () => {
    const graded = [attempt(90, 1), attempt(80, 3), attempt(70, 5)]
    expect(quizTrendFromAttempts(graded)).toBeUndefined()
    // Two dated and one undated: still below the three-quiz minimum.
    expect(quizTrendFromAttempts(graded, { q1: DUE.q1, q3: DUE.q3 })).toBeUndefined()
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
  hasGradedWork,
  quizAverageFromAttempts,
  riskGradeInput,
  quizDueDates,
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

  it('excludes server-tagged progressive remediation stages from average and trend', () => {
    const withStages = [
      att('q1', 9, 10, '02'), att('q2', 8, 10, '05'), att('q3', 4, 10, '09'),
      att('guided', 0, 10, '10', { remediation_stage: 'guided_practice' }),
      att('independent', 0, 10, '11', { remediation_stage: 'independent_practice' }),
      att('reassessment', 0, 10, '12', { remediation_stage: 'reassessment' }),
    ]
    const dates = {
      q1: '2026-11-02', q2: '2026-11-05', q3: '2026-11-09',
      guided: '2026-11-10', independent: '2026-11-11', reassessment: '2026-11-12',
    }
    expect(quizAverageFromAttempts(withStages)).toBe(70)
    expect(quizTrendDistinct(withStages, dates)).toBe(-45)
    expect(distinctQuizScores(withStages, dates).map((q) => q.quizId)).toEqual(['q1', 'q2', 'q3'])
  })

  it('no longer reports the single best attempt across all quizzes', () => {
    // The old teacher figure here would have been 90.
    expect(quizAverageFromAttempts(attempts)).not.toBe(90)
  })

  it('does not let retakes of one quiz manufacture a trend', () => {
    const retakes = [att('q1', 9, 10, '02'), att('q1', 5, 10, '03'), att('q1', 2, 10, '04')]
    expect(quizTrendDistinct(retakes)).toBeUndefined()
  })

  it("trends distinct quizzes by their due dates; a late retake keeps its quiz's date", () => {
    const list = [
      att('q3', 4, 10, '01'),
      att('q1', 9, 10, '20'),
      att('q2', 8, 10, '05'),
      att('q1', 10, 10, '28'), // late retake of q1: best 100, still dated at q1's due date
    ]
    const due = { q1: '2026-11-02', q2: '2026-11-05', q3: '2026-11-09' }
    // order q1(100) q2(80) q3(40): recent third (40) minus earlier (90)
    expect(quizTrendDistinct(list, due)).toBe(-50)
  })

  it('dates a quiz by its due date, else its record column, else not at all', () => {
    const due = quizDueDates(
      [{ id: 'a', closes_at: '2026-11-03T17:00' }, { id: 'b' }, { id: 'c', closes_at: '' }],
      [{ source_quiz_id: 'b', date_given: '2026-11-04' }, { source_quiz_id: 'a', date_given: '2026-01-01' }],
    )
    expect(due).toEqual({ a: '2026-11-03', b: '2026-11-04' })
  })

  it('keeps legacy attempts without quiz_id as separate quizzes', () => {
    expect(distinctQuizScores([att(undefined, 5, 10, '02'), att(undefined, 7, 10, '03')])).toHaveLength(2)
  })

  it('counts graded, awaiting and folded retakes', () => {
    expect(quizEvidence(attempts)).toEqual({ gradedQuizzes: 2, awaitingGrading: 2, retakesFolded: 1, undatedQuizzes: 2 })
    expect(quizEvidence(attempts, { q1: '2026-11-02' }).undatedQuizzes).toBe(1)
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
      missing: 2, submitted: 1, attempted: 1, ungraded: 1, excused: 1, unknown: 1, notDue: 2,
    })
  })

  it('leaves the existing pooled rate unchanged', () => {
    const rate = missingRate(missingWorkCounts(assessments, 's1'), missedQuizCounts(quizzes, new Set(['qa']), 's1', NOW))
    // missing / (missing + submitted + ungraded): 2 / 5, what the panel shows as "due"
    expect(rate).toBeCloseTo(2 / 5)
  })

  it('A4: an officially excused quiz leaves the numerator AND the denominator', () => {
    const excused = new Set(['qb']) // qb closed with no attempt -- missing until excused
    expect(missedQuizCounts(quizzes, new Set(['qa']), 's1', NOW)).toEqual({ notDone: 1, expected: 2 })
    expect(missedQuizCounts(quizzes, new Set(['qa']), 's1', NOW, excused)).toEqual({ notDone: 0, expected: 1 })
    const ev = workEvidence(assessments, quizzes, new Set(['qa']), 's1', NOW, excused)
    expect(ev).toMatchObject({ missing: 1, excused: 2, attempted: 1 })
    // Excusing a quiz the student did attempt still removes it from the count;
    // the attempt itself is not touched (this helper never sees it as submitted).
    expect(missedQuizCounts(quizzes, new Set(['qa']), 's1', NOW, new Set(['qa', 'qb']))).toEqual({ notDone: 0, expected: 0 })
  })

  it('A5: a started attempt counts as attempted, never as submitted or graded', () => {
    const ev = workEvidence([], [{ id: 'qa', status: 'closed' }], new Set(['qa']), 's1', NOW)
    expect(ev).toMatchObject({ attempted: 1, submitted: 0, missing: 0 })
  })
})

describe('A2 · a period grade needs valid graded work behind it', () => {
  it('counts a graded raw score or a teacher-marked missing; not excused, ungraded or absent', () => {
    expect(hasGradedWork([{ scores: { s1: { status: 'graded', raw_score: 0 } } }], 's1')).toBe(true)
    expect(hasGradedWork([{ scores: { s1: { status: 'missing' } } }], 's1')).toBe(true)
    expect(hasGradedWork([{ scores: { s1: { status: 'excused' } } }], 's1')).toBe(false)
    expect(hasGradedWork([{ scores: { s1: { status: 'graded', raw_score: null } } }], 's1')).toBe(false)
    expect(hasGradedWork([{ scores: { s2: { status: 'graded', raw_score: 9 } } }], 's1')).toBe(false)
    expect(hasGradedWork([], 's1')).toBe(false)
  })

  it('sends the converted period grade only when graded work or an override backs it', () => {
    const graded = [{ scores: { s1: { status: 'graded', raw_score: 8 } } }]
    const excusedOnly = [{ scores: { s1: { status: 'excused' } } }]
    const toPercent = (g) => g * 10
    expect(riskGradeInput({ grade: 8.5, periodAssessments: graded, studentId: 's1', toPercent })).toBe(85)
    expect(riskGradeInput({ grade: 8.5, periodAssessments: excusedOnly, studentId: 's1', toPercent })).toBeNull()
    expect(riskGradeInput({ grade: 8.5, periodAssessments: excusedOnly, studentId: 's1', override: 85, toPercent })).toBe(85)
    expect(riskGradeInput({ grade: null, periodAssessments: graded, studentId: 's1' })).toBeNull()
  })
})
