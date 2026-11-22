import { describe, expect, it } from 'vitest'
import { evidenceText, sessionCoverageText } from '@/lib/riskSignals'

describe('PredictedRisk evidence wording', () => {
  it('names counts, and keeps "no work due" distinct from 0% missing', () => {
    expect(evidenceText({
      attendance: { marks: 5, held_sessions: 7, not_recorded: 2 },
      quizzes: { gradedQuizzes: 1, awaitingGrading: 1 },
      work: { missing: 0, submitted: 0, ungraded: 0 },
    })).toBe('5 attendance marks of 7 held sessions (2 not recorded) · 1 graded quiz (1 awaiting grading) · no work due yet')
    expect(evidenceText({ attendance: {}, quizzes: { gradedQuizzes: 3 }, work: { missing: 1, submitted: 3, ungraded: 0 } }))
      .toContain('1 of 4 due items missing')
  })

  it('reports planned vs recorded meetings without guessing attendance', () => {
    expect(sessionCoverageText({ recorded: 8, unconfirmed: 2, cancelled: 1, rescheduled: 0 }))
      .toBe('8 of 10 planned meetings have at least one attendance mark · 2 not yet confirmed · 1 cancelled')
    expect(sessionCoverageText(null)).toBeNull()
  })

  it('says which start the meeting count runs from (A1), never implying a full term for a legacy class', () => {
    expect(sessionCoverageText({ recorded: 3, unconfirmed: 1, start: '2026-08-10', start_source: 'class' }))
      .toBe('3 of 4 planned meetings since the class start date (2026-08-10) have at least one attendance mark · 1 not yet confirmed')
    expect(sessionCoverageText({ recorded: 3, unconfirmed: 0, start: '2026-09-01', start_source: 'first_record' }))
      .toContain('since the first recorded day (2026-09-01; no class start date set)')
  })

  it('discloses quizzes left out of the trend for want of a due date', () => {
    expect(evidenceText({ attendance: {}, quizzes: { gradedQuizzes: 3, undatedQuizzes: 1 }, work: {} }))
      .toContain('3 graded quizzes (1 without a due date, left out of the trend)')
  })

  it('does not describe an in-progress quiz attempt as submitted work', () => {
    expect(evidenceText({
      attendance: {},
      quizzes: {},
      work: { missing: 0, submitted: 0, attempted: 1, ungraded: 0 },
    })).toBe('0 attendance marks of 0 held sessions · 0 graded quizzes · 0 of 1 due items missing (1 quiz attempted; may be ungraded)')
  })
})

describe('coverage line after the class end date', () => {
  it('says the class ended and nothing is planned after it', () => {
    expect(sessionCoverageText({ recorded: 2, unconfirmed: 1, start: '2026-11-02', start_source: 'class', ended: '2026-11-06' }))
      .toBe('2 of 3 planned meetings since the class start date (2026-11-02) have at least one attendance mark · 1 not yet confirmed · class ended 2026-11-06; no meetings planned after it')
  })
})
