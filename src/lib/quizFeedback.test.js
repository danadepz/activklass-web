/**
 * Unit tests for the feedback-release rules in ./quizFeedback.js.
 *
 * The case that matters most is `after_attempts`: it is the setting that stops
 * attempt 1 from being the answer key for attempt 2, and it is only correct if
 * "has the student used their last attempt" is counted right at both ends.
 */
import { describe, expect, it } from 'vitest'
import {
  DETAIL_ANSWERS,
  DETAIL_RATIONALE,
  DETAIL_SCORE,
  DETAIL_WRONG_ITEMS,
  RELEASE_AFTER_ATTEMPTS,
  RELEASE_AFTER_CLOSE,
  RELEASE_IMMEDIATE,
  RELEASE_NEVER,
  describeFeedback,
  feedbackProblem,
  feedbackVisibility,
} from './quizFeedback.js'

const NOW = new Date('2026-03-10T09:00:00Z').getTime()
const EARLIER = '2026-03-09T09:00:00Z'
const LATER = '2026-03-11T09:00:00Z'

describe('feedbackVisibility · release timing', () => {
  it('releases immediately by default', () => {
    const v = feedbackVisibility({ quiz: {}, now: NOW })
    expect(v.released).toBe(true)
    expect(v.showRationale).toBe(true)
  })

  it('treats a quiz saved before these settings existed as unchanged', () => {
    // The teacher set this quiz up while the page showed everything.
    const v = feedbackVisibility({ quiz: { title: 'Old quiz' }, now: NOW })
    expect(v.showCorrectAnswers).toBe(true)
  })

  it('holds results until the quiz closes', () => {
    const quiz = { feedback_release: RELEASE_AFTER_CLOSE, closes_at: LATER }
    expect(feedbackVisibility({ quiz, now: NOW }).released).toBe(false)
  })

  it('releases once the closing time has passed', () => {
    const quiz = { feedback_release: RELEASE_AFTER_CLOSE, closes_at: EARLIER }
    expect(feedbackVisibility({ quiz, now: NOW }).released).toBe(true)
  })

  it('does not release after_close when no closing date was ever set', () => {
    const v = feedbackVisibility({ quiz: { feedback_release: RELEASE_AFTER_CLOSE }, now: NOW })
    expect(v.released).toBe(false)
    expect(v.waitingOn).toMatch(/when your teacher closes/i)
  })

  it('holds results while attempts remain', () => {
    const quiz = { feedback_release: RELEASE_AFTER_ATTEMPTS, attempts_allowed: 3 }
    const v = feedbackVisibility({ quiz, attemptCount: 1, now: NOW })
    expect(v.released).toBe(false)
    expect(v.waitingOn).toMatch(/2 more/)
  })

  it('releases on the last allowed attempt', () => {
    const quiz = { feedback_release: RELEASE_AFTER_ATTEMPTS, attempts_allowed: 3 }
    expect(feedbackVisibility({ quiz, attemptCount: 3, now: NOW }).released).toBe(true)
  })

  it('releases a single-attempt quiz straight away under after_attempts', () => {
    const quiz = { feedback_release: RELEASE_AFTER_ATTEMPTS, attempts_allowed: 1 }
    expect(feedbackVisibility({ quiz, attemptCount: 1, now: NOW }).released).toBe(true)
  })

  it('never releases, and says why, when the teacher chose never', () => {
    const v = feedbackVisibility({ quiz: { feedback_release: RELEASE_NEVER }, now: NOW })
    expect(v.released).toBe(false)
    expect(v.showScore).toBe(false)
    expect(v.waitingOn).toMatch(/go through it with your class/i)
  })
})

describe('feedbackVisibility · detail levels', () => {
  const at = (detail) =>
    feedbackVisibility({ quiz: { feedback_release: RELEASE_IMMEDIATE, feedback_detail: detail }, now: NOW })

  it('shows the score and nothing else at the lowest level', () => {
    const v = at(DETAIL_SCORE)
    expect(v.showScore).toBe(true)
    expect(v.showItems).toBe(false)
    expect(v.showCorrectAnswers).toBe(false)
    expect(v.showRationale).toBe(false)
  })

  it('shows which items were wrong without giving the answers away', () => {
    const v = at(DETAIL_WRONG_ITEMS)
    expect(v.showItems).toBe(true)
    expect(v.showCorrectAnswers).toBe(false)
  })

  it('shows the correct answers but not the explanation', () => {
    const v = at(DETAIL_ANSWERS)
    expect(v.showCorrectAnswers).toBe(true)
    expect(v.showRationale).toBe(false)
  })

  it('shows everything at the top level', () => {
    expect(at(DETAIL_RATIONALE).showRationale).toBe(true)
  })

  it('gives away nothing at all while the result is unreleased, at any detail', () => {
    const quiz = { feedback_release: RELEASE_NEVER, feedback_detail: DETAIL_RATIONALE }
    const v = feedbackVisibility({ quiz, now: NOW })
    expect([v.showScore, v.showItems, v.showCorrectAnswers, v.showRationale]).toEqual([
      false, false, false, false,
    ])
  })
})

describe('feedbackProblem', () => {
  it('catches after_close with no closing date', () => {
    expect(feedbackProblem({ feedback_release: RELEASE_AFTER_CLOSE })).toMatch(/closing date/)
  })

  it('passes after_close once a closing date exists', () => {
    expect(feedbackProblem({ feedback_release: RELEASE_AFTER_CLOSE, closes_at: LATER })).toBeNull()
  })

  it('passes every other release', () => {
    expect(feedbackProblem({ feedback_release: RELEASE_NEVER })).toBeNull()
    expect(feedbackProblem({})).toBeNull()
  })
})

describe('describeFeedback', () => {
  it('states the combined effect rather than the two settings', () => {
    expect(describeFeedback({ feedback_release: RELEASE_AFTER_ATTEMPTS, feedback_detail: DETAIL_SCORE }))
      .toBe('Students see "score only" — after their last attempt.')
  })

  it('is explicit that a withheld result is still graded', () => {
    expect(describeFeedback({ feedback_release: RELEASE_NEVER })).toMatch(/still reaches the class record/)
  })
})
