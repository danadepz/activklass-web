/**
 * Cross-repo parity: the mobile ports must behave exactly like these originals.
 *
 * `quizPool` and `quizFeedback` exist twice on purpose -- once here, once as a
 * TypeScript port in activklass-mobile -- because the two apps have separate
 * build pipelines and no shared package. Comments at the top of each file ask
 * whoever edits one to edit the other, and comments are not a mechanism.
 *
 * These are. They import the mobile copies across the repo boundary (vitest
 * transforms the TypeScript) and assert the same inputs give the same answers.
 * The failures they exist to catch are the quiet ones:
 *
 *  - a seeded draw that diverges, so a student who starts a pooled quiz in a
 *    browser and finishes it on their phone is handed a different paper and
 *    loses the answers they already gave;
 *  - a feedback rule that releases on one client and withholds on the other,
 *    which is not a rule at all -- the student just opens the other app;
 *  - a deadline or an attempt allowance that differs between them, which is
 *    the same hole: run out of time in the browser, open the phone, carry on.
 *
 * If a port is deleted or moved, this file fails to import and says so, which
 * is the correct outcome: the sync guarantee would be gone.
 */
import { describe, expect, it } from 'vitest'
import * as webPool from './quizPool.js'
import * as webFeedback from './quizFeedback.js'
import * as mobilePool from '../../../activklass-mobile/src/lib/quizPool.ts'
import * as mobileFeedback from '../../../activklass-mobile/src/lib/quizFeedback.ts'
import * as webAttempts from './quizAttempts.js'
import * as mobileAttempts from '../../../activklass-mobile/src/lib/quizAttempts.ts'

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

const STUDENTS = ['s1', 's2', 'uid-abc-123', 'Z']

describe('quizPool parity', () => {
  it('hashes identically', () => {
    for (const key of ['', 'a', 'quiz1::s1::1', 'quiz1::s1::2', 'ÅÄÖ']) {
      expect(mobilePool.hashSeed(key)).toBe(webPool.hashSeed(key))
    }
  })

  it('generates the same random sequence', () => {
    for (const seed of [0, 1, 12345, 4294967295]) {
      const w = webPool.seededRandom(seed)
      const m = mobilePool.seededRandom(seed)
      for (let i = 0; i < 50; i++) expect(m()).toBe(w())
    }
  })

  it('draws the same paper for every student and attempt', () => {
    const quiz = { id: 'quiz1', questions: pool(30), pool_enabled: true, pool_draw_count: 10 }
    for (const studentId of STUDENTS) {
      for (const attemptNumber of [1, 2, 3]) {
        const w = webPool.questionsForStudent(quiz, { studentId, attemptNumber })
        const m = mobilePool.questionsForStudent(quiz, { studentId, attemptNumber })
        expect(mobilePool.questionIdsOf(m)).toEqual(webPool.questionIdsOf(w))
      }
    }
  })

  it('orders questions and options the same way', () => {
    const quiz = {
      id: 'quiz1',
      questions: pool(12),
      shuffle_questions: true,
      shuffle_options: true,
    }
    for (const studentId of STUDENTS) {
      const w = webPool.questionsForStudent(quiz, { studentId })
      const m = mobilePool.questionsForStudent(quiz, { studentId })
      expect(m.map((q) => [q.id, q.options.map((o) => o.id)]))
        .toEqual(w.map((q) => [q.id, q.options.map((o) => o.id)]))
    }
  })

  it('agrees on the total a paper is marked out of', () => {
    const quizzes = [
      { questions: pool(30, 2), pool_enabled: true, pool_draw_count: 10 },
      { questions: pool(5, 3) },
      { questions: [], pool_enabled: true, pool_draw_count: 4 },
    ]
    for (const quiz of quizzes) {
      expect(mobilePool.drawTotalPoints(quiz)).toBe(webPool.drawTotalPoints(quiz))
    }
  })

  it('agrees on which pools are invalid, and says the same thing', () => {
    const quizzes = [
      { questions: pool(30), pool_enabled: true, pool_draw_count: 10 },
      { questions: pool(5), pool_enabled: true, pool_draw_count: 10 },
      { questions: [...pool(3, 2), ...pool(2, 5)], pool_enabled: true, pool_draw_count: 3 },
      { questions: pool(30), pool_enabled: true },
      { questions: pool(30) },
    ]
    for (const quiz of quizzes) {
      expect(mobilePool.poolProblem(quiz)).toBe(webPool.poolProblem(quiz))
    }
  })

  it('rebuilds an open attempt the same way, option order included', () => {
    const quiz = { id: 'q', questions: pool(10), shuffle_options: true }
    const attempt = { question_ids: ['q5', 'q2', 'q9'], attempt_number: 2 }
    for (const studentId of STUDENTS) {
      const w = webPool.questionsForAttempt(quiz, attempt, { studentId })
      const m = mobilePool.questionsForAttempt(quiz, attempt, { studentId })
      expect(m.map((q) => [q.id, q.options.map((o) => o.id)]))
        .toEqual(w.map((q) => [q.id, q.options.map((o) => o.id)]))
    }
  })

  it('rebuilds the same paper from a stored attempt', () => {
    const quiz = { id: 'q', questions: pool(10) }
    for (const attempt of [{ question_ids: ['q3', 'q1'] }, {}, { question_ids: ['q1', 'gone'] }]) {
      expect(mobilePool.questionIdsOf(mobilePool.questionsOfAttempt(quiz, attempt)))
        .toEqual(webPool.questionIdsOf(webPool.questionsOfAttempt(quiz, attempt)))
    }
  })
})

describe('quizFeedback parity', () => {
  const NOW = new Date('2026-03-10T09:00:00Z').getTime()

  it('uses the same constant values, not just the same names', () => {
    expect([
      mobileFeedback.RELEASE_IMMEDIATE,
      mobileFeedback.RELEASE_AFTER_CLOSE,
      mobileFeedback.RELEASE_AFTER_ATTEMPTS,
      mobileFeedback.RELEASE_NEVER,
      mobileFeedback.DETAIL_SCORE,
      mobileFeedback.DETAIL_WRONG_ITEMS,
      mobileFeedback.DETAIL_ANSWERS,
      mobileFeedback.DETAIL_RATIONALE,
    ]).toEqual([
      webFeedback.RELEASE_IMMEDIATE,
      webFeedback.RELEASE_AFTER_CLOSE,
      webFeedback.RELEASE_AFTER_ATTEMPTS,
      webFeedback.RELEASE_NEVER,
      webFeedback.DETAIL_SCORE,
      webFeedback.DETAIL_WRONG_ITEMS,
      webFeedback.DETAIL_ANSWERS,
      webFeedback.DETAIL_RATIONALE,
    ])
  })

  it('releases and withholds identically across every combination', () => {
    const releases = [
      webFeedback.RELEASE_IMMEDIATE,
      webFeedback.RELEASE_AFTER_CLOSE,
      webFeedback.RELEASE_AFTER_ATTEMPTS,
      webFeedback.RELEASE_NEVER,
      undefined,
    ]
    const details = [
      webFeedback.DETAIL_SCORE,
      webFeedback.DETAIL_WRONG_ITEMS,
      webFeedback.DETAIL_ANSWERS,
      webFeedback.DETAIL_RATIONALE,
      undefined,
    ]
    const closes = ['2026-03-09T09:00:00Z', '2026-03-11T09:00:00Z', null]

    for (const feedback_release of releases) {
      for (const feedback_detail of details) {
        for (const closes_at of closes) {
          for (const attempts_allowed of [1, 3]) {
            for (const attemptCount of [1, 3]) {
              const quiz = { feedback_release, feedback_detail, closes_at, attempts_allowed }
              const w = webFeedback.feedbackVisibility({ quiz, attemptCount, now: NOW })
              const m = mobileFeedback.feedbackVisibility({ quiz, attemptCount, now: NOW })
              // waitingOn included: the student-facing sentence must match too.
              expect(m).toEqual(w)
            }
          }
        }
      }
    }
  })
})

describe('quizAttempts parity', () => {
  const NOW = new Date('2026-04-10T09:00:00Z').getTime()
  const done = (n) => ({ status: 'graded', attempt_number: n, total_score: 5 })
  const open = (n, extra = {}) => ({ status: 'in_progress', attempt_number: n, ...extra })

  it('agrees on who may start, and why not', () => {
    const quizzes = [
      { status: 'published', attempts_allowed: 2 },
      { status: 'draft', attempts_allowed: 2 },
      { status: 'published', attempts_allowed: 2, assigned_to: ['s2'] },
      { status: 'published', attempts_allowed: 2, assigned_to: 'all' },
      { status: 'published', attempts_allowed: 2, opens_at: '2026-04-11T09:00:00Z' },
      { status: 'published', attempts_allowed: 2, closes_at: '2026-04-09T09:00:00Z' },
      { status: 'published', attempts_allowed: 1, extra_attempts: { s1: 2 } },
    ]
    const attemptSets = [[], [done(1)], [done(1), done(2)], [done(1), open(2)], [open(1)]]

    for (const quiz of quizzes) {
      for (const attempts of attemptSets) {
        const w = webAttempts.canStart({ quiz, attempts, studentId: 's1', now: NOW })
        const m = mobileAttempts.canStart({ quiz, attempts, studentId: 's1', now: NOW })
        expect(m).toEqual(w)
      }
    }
  })

  it('agrees on the allowance, grants included', () => {
    const quizzes = [
      {},
      { attempts_allowed: 3 },
      { attempts_allowed: 2, extra_attempts: { s1: 1 } },
      { attempts_allowed: 2, extra_attempts: { s2: 5 } },
    ]
    for (const quiz of quizzes) {
      expect(mobileAttempts.attemptsAllowedFor(quiz, 's1')).toBe(webAttempts.attemptsAllowedFor(quiz, 's1'))
    }
  })

  it('agrees on the deadline and what is left of it', () => {
    for (const minutes of [null, 0, 1, 30, 90]) {
      expect(mobileAttempts.expiryFrom(NOW, minutes)).toBe(webAttempts.expiryFrom(NOW, minutes))
    }
    for (const offset of [-100000, -1, 0, 1000, 600000]) {
      const attempt = open(1, { expires_at_ms: NOW + offset })
      expect(mobileAttempts.secondsRemaining(attempt, NOW)).toBe(webAttempts.secondsRemaining(attempt, NOW))
      expect(mobileAttempts.hasExpired(attempt, NOW)).toBe(webAttempts.hasExpired(attempt, NOW))
    }
    expect(mobileAttempts.secondsRemaining(open(1), NOW)).toBe(webAttempts.secondsRemaining(open(1), NOW))
  })

  it('shows the student the same rules, word for word', () => {
    const quizzes = [
      { attempts_allowed: 1 },
      { attempts_allowed: 3, time_limit_minutes: 30 },
      { attempts_allowed: 3, time_limit_minutes: 1, prevent_backtracking: true },
    ]
    for (const quiz of quizzes) {
      for (const attempts of [[], [done(1)], [done(1), done(2)]]) {
        for (const drawCount of [null, 10]) {
          const w = webAttempts.startBriefing({ quiz, attempts, studentId: 's1', drawCount })
          const m = mobileAttempts.startBriefing({ quiz, attempts, studentId: 's1', drawCount })
          expect(m).toEqual(w)
        }
      }
    }
  })

  it('agrees on the next attempt number and the open attempt', () => {
    const sets = [[], [done(1)], [done(1), open(2)], [open(2), open(3)]]
    for (const attempts of sets) {
      expect(mobileAttempts.nextAttemptNumber(attempts)).toBe(webAttempts.nextAttemptNumber(attempts))
      expect(mobileAttempts.openAttempt(attempts)).toEqual(webAttempts.openAttempt(attempts))
    }
  })

  it('places a quiz in the same phase of its life', () => {
    const quizzes = [
      { status: 'draft' },
      { status: 'published' },
      { status: 'closed', closes_at: '2026-12-01T09:00:00Z' },
      { status: 'published', opens_at: '2026-04-11T09:00:00Z' },
      { status: 'published', closes_at: '2026-04-09T09:00:00Z' },
    ]
    for (const quiz of quizzes) {
      expect(mobileAttempts.lifecycleOf(quiz, NOW)).toBe(webAttempts.lifecycleOf(quiz, NOW))
    }
    expect(mobileAttempts.LIFECYCLE_TABS).toEqual(webAttempts.LIFECYCLE_TABS)
  })

  it('describes reopens and away-events in the same words', () => {
    const event = (i, ms) => ({ at: 'x', question_index: i, question_id: `q${i}`, away_ms: ms })
    const attempts = [
      done(1),
      { ...done(1), reopen_count: 2 },
      { ...done(1), expired_at_submit: true },
      open(1, { reopen_count: 1 }),
      { ...done(1), focus_events: [event(6, 30000), event(6, 30000)] },
      { ...done(1), focus_events: [event(0, 1000)], focus_events_dropped: 40 },
    ]
    for (const attempt of attempts) {
      expect(mobileAttempts.describeAttemptActivity(attempt)).toBe(webAttempts.describeAttemptActivity(attempt))
      expect(mobileAttempts.describeFocus(attempt)).toBe(webAttempts.describeFocus(attempt))
      expect(mobileAttempts.summariseFocus(attempt)).toEqual(webAttempts.summariseFocus(attempt))
    }
  })

  it('treats a discarded attempt as inert on both clients', () => {
    const quiz = { status: 'published', attempts_allowed: 1 }
    const sets = [
      [{ status: 'discarded', attempt_number: 1 }],
      [done(1), { status: 'discarded', attempt_number: 2 }],
      [{ status: 'discarded', attempt_number: 1 }, open(2)],
    ]
    for (const attempts of sets) {
      expect(mobileAttempts.openAttempt(attempts)).toEqual(webAttempts.openAttempt(attempts))
      expect(mobileAttempts.finishedAttempts(attempts)).toEqual(webAttempts.finishedAttempts(attempts))
      expect(mobileAttempts.nextAttemptNumber(attempts)).toBe(webAttempts.nextAttemptNumber(attempts))
      expect(mobileAttempts.canStart({ quiz, attempts, studentId: 's1', now: NOW }))
        .toEqual(webAttempts.canStart({ quiz, attempts, studentId: 's1', now: NOW }))
      expect(mobileAttempts.DISCARDED).toBe(webAttempts.DISCARDED)
    }
  })

  it('measures how long an attempt has been open identically', () => {
    const attempts = [
      open(1, { started_at_ms: NOW - 90_000 }),
      open(1, { started_at: { toMillis: () => NOW - 5_000 } }),
      open(1),
    ]
    for (const attempt of attempts) {
      expect(mobileAttempts.openForMs(attempt, NOW)).toBe(webAttempts.openForMs(attempt, NOW))
    }
  })

  it('normalises an away-event identically', () => {
    const inputs = [
      { at: 'x', questionIndex: 2, questionId: 'q3', awayMs: 1500 },
      { at: 'x', questionIndex: undefined, questionId: null, awayMs: -5 },
    ]
    for (const input of inputs) {
      expect(mobileAttempts.focusEvent(input)).toEqual(webAttempts.focusEvent(input))
    }
    expect(mobileAttempts.FOCUS_EVENT_CAP).toBe(webAttempts.FOCUS_EVENT_CAP)
  })
})
