/**
 * Risk-input consistency fixes, 2026-11-23:
 *   - the student's record columns link to their quiz through the deterministic
 *     `quiz-{quizId}` id, so the date_given fallback works without
 *     source_quiz_id (which only teacher-private documents carry);
 *   - quiz_average counts identified quizzes only (owner decision);
 *   - attendance uses the owner-approved weighting.
 */
import { describe, expect, it } from 'vitest'
import {
  attendanceRateFromMarks,
  isQuizId,
  missedQuizCountsIfKnown,
  quizAverageFromAttempts,
  quizDueDates,
  quizIdOfColumn,
  quizTrendFromAttempts,
} from './riskSignals'

const quiz = (id, closes_at = null, extra = {}) => ({ id, status: 'closed', closes_at, ...extra })
const att = (quiz_id, total_score, total_possible = 100) => ({ quiz_id, total_score, total_possible })

describe('quizIdOfColumn: the quiz a record column belongs to', () => {
  it('reads source_quiz_id first, then the quiz-{id} column id', () => {
    expect(quizIdOfColumn({ id: 'quiz-abc', source_quiz_id: 'xyz' })).toBe('xyz')
    expect(quizIdOfColumn({ id: 'quiz-abc' })).toBe('abc')
    expect(quizIdOfColumn({ id: 'quiz-quiz-7' })).toBe('quiz-7') // only the first prefix is the scheme
  })

  it('malformed or non-quiz ids link to nothing', () => {
    for (const id of ['quiz-', 'quiz-   ', 'quiz', 'Quiz-abc', 'task-abc', 'Xy7random', 'xquiz-abc', '', null, undefined, 42]) {
      expect(quizIdOfColumn({ id })).toBeNull()
    }
    expect(quizIdOfColumn(null)).toBeNull()
    expect(quizIdOfColumn({ id: 'task-1', source_quiz_id: '' })).toBeNull()
  })
})

describe('quizDueDates: closes_at, then the matching column date_given, else undated', () => {
  const entryColumns = [
    { id: 'quiz-q2', date_given: '2026-03-04' }, // no source_quiz_id -- the student's entry shape
    { id: 'quiz-q3', date_given: '2026-03-09' },
    { id: 'task-q4', date_given: '2026-03-05' }, // a task column, not quiz q4
    { id: 'quiz-q5', date_given: 'next week' }, // not a date
  ]

  it('due date wins; the column date is the fallback; the rest stay undated', () => {
    const quizzes = [quiz('q1', '2026-03-01T17:00'), quiz('q2'), quiz('q3', '2026-03-02T08:00'), quiz('q4'), quiz('q5')]
    expect(quizDueDates(quizzes, entryColumns)).toEqual({ q1: '2026-03-01', q2: '2026-03-04', q3: '2026-03-02' })
  })

  it('chronology follows those dates, not submission order; undated quizzes stay out', () => {
    const quizzes = [quiz('q1', '2026-03-01T17:00'), quiz('q2'), quiz('q3', '2026-03-02T08:00'), quiz('q4')]
    const dates = quizDueDates(quizzes, entryColumns)
    // Dated order q1 (03-01), q3 (03-02), q2 (03-04, from its column): 90, 80, 30.
    const attempts = [att('q2', 30), att('q3', 80), att('q1', 90), att('q4', 0)]
    expect(quizTrendFromAttempts(attempts, dates)).toBe(-55) // mean(30) - mean(90, 80)
    // Without the column link q2 is undated and only two quizzes remain: no trend.
    expect(quizTrendFromAttempts(attempts, quizDueDates(quizzes, []))).toBeUndefined()
  })

  it('still needs three dated distinct scored quizzes; retakes count once at their best', () => {
    const dates = quizDueDates([quiz('a', '2026-03-01'), quiz('b', '2026-03-02'), quiz('c')], [{ id: 'quiz-c', date_given: '2026-03-03' }])
    expect(quizTrendFromAttempts([att('a', 50), att('a', 90), att('b', 80)], dates)).toBeUndefined()
    expect(quizTrendFromAttempts([att('a', 50), att('a', 90), att('b', 80), att('c', 60)], dates)).toBe(-25) // 60 - mean(90, 80)
  })
})

describe('quiz_average: identified quizzes only, unrounded (owner decision 2026-11-23)', () => {
  it('scored attempts without a quiz_id are left out', () => {
    expect(quizAverageFromAttempts([att('a', 81), att('b', 82), att(undefined, 10), att(null, 20), att('', 30), att('  ', 40)])).toBe(81.5)
  })

  it('retakes count once at their best; scored zeros count; ungraded is skipped', () => {
    expect(quizAverageFromAttempts([att('a', 40), att('a', 81), att('b', 82), att('c', null), att('d', 9, 0)])).toBe(81.5)
    expect(quizAverageFromAttempts([att('a', 0), att('b', 85)])).toBe(42.5)
    expect(quizAverageFromAttempts([att('a', 75), att('b', 80), att('c', 90)])).toBeCloseTo(245 / 3, 12)
  })

  it('nothing identified and scored is unknown, never zero', () => {
    expect(quizAverageFromAttempts([att(undefined, 90)])).toBeUndefined()
    expect(quizAverageFromAttempts([att('a', null)])).toBeUndefined()
    expect(quizAverageFromAttempts([])).toBeUndefined()
    expect(quizAverageFromAttempts(undefined)).toBeUndefined()
  })

  it('isQuizId', () => {
    expect([isQuizId('a'), isQuizId(''), isQuizId(' '), isQuizId(null), isQuizId(7)]).toEqual([true, false, false, false, false])
  })
})

describe('attendance weighting (owner decision 2026-11-23)', () => {
  it('100 x (present + 0.5 x late) / (present + late + absent); excused and unknown left out', () => {
    const marks = ['present', 'present', 'present', 'present', 'late', 'late', 'absent', 'excused', 'holiday', undefined]
    expect(attendanceRateFromMarks(marks)).toBeCloseTo(500 / 7, 10) // 71.428571…
  })

  it('nothing counted is missing, not zero', () => {
    expect(attendanceRateFromMarks(['excused', 'excused'])).toBeUndefined()
    expect(attendanceRateFromMarks([])).toBeUndefined()
  })
})

describe('missedQuizCountsIfKnown', () => {
  const closed = [quiz('q1'), quiz('q2')]
  it('unknown quizzes, attempts, or (with a closed quiz expected) excusals give no count', () => {
    expect(missedQuizCountsIfKnown(undefined, new Set(), 'S', new Set())).toBeUndefined()
    expect(missedQuizCountsIfKnown(closed, undefined, 'S', new Set())).toBeUndefined()
    expect(missedQuizCountsIfKnown(closed, new Set(['q1']), 'S', undefined)).toBeUndefined()
  })
  it('known evidence counts, excused quizzes leaving both sides', () => {
    expect(missedQuizCountsIfKnown(closed, new Set(['q1']), 'S', new Set())).toEqual({ notDone: 1, expected: 2 })
    expect(missedQuizCountsIfKnown(closed, new Set(['q1']), 'S', new Set(['q2']))).toEqual({ notDone: 0, expected: 1 })
    expect(missedQuizCountsIfKnown([], new Set(), 'S', undefined)).toEqual({ notDone: 0, expected: 0 })
  })
})
