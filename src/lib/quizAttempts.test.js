/**
 * Unit tests for the attempt lifecycle in ./quizAttempts.js.
 *
 * Two properties carry the most weight. First, an open attempt must never be
 * counted against the allowance -- get that wrong and a student is locked out
 * of the sitting they are currently in, with no way to submit it. Second, the
 * deadline must come from the stored start, not from now: the whole reason
 * this module exists is that reloading used to hand back the full time.
 */
import { describe, expect, it } from 'vitest'
import {
  DISCARDED,
  GRADED,
  IN_PROGRESS,
  attemptsAllowedFor,
  attemptsLabel,
  canStart,
  deadlineOf,
  describeAttemptActivity,
  describeFocus,
  expiryFrom,
  discardedAttempts,
  finishedAttempts,
  focusEvent,
  formatAway,
  hasExpired,
  lifecycleOf,
  nextAttemptNumber,
  openAttempt,
  openForMs,
  secondsRemaining,
  startBriefing,
  summariseFocus,
  unlimitedAttempts,
} from './quizAttempts.js'

const NOW = new Date('2026-04-10T09:00:00Z').getTime()
const done = (n = 1) => ({ status: GRADED, attempt_number: n, total_score: 5 })
const open = (n = 1, extra = {}) => ({ status: IN_PROGRESS, attempt_number: n, ...extra })

describe('finishedAttempts / openAttempt', () => {
  it('counts only attempts that ended', () => {
    expect(finishedAttempts([done(1), open(2), done(3)])).toHaveLength(2)
  })

  it('finds the open attempt', () => {
    expect(openAttempt([done(1), open(2)]).attempt_number).toBe(2)
  })

  it('returns the earliest when duplicates exist, rather than the newest', () => {
    // Duplicates are a bug; picking the newest would hand out fresh time.
    expect(openAttempt([open(3), open(2)]).attempt_number).toBe(2)
  })

  it('has no open attempt when everything is finished', () => {
    expect(openAttempt([done(1), done(2)])).toBeNull()
  })
})

describe('attemptsAllowedFor', () => {
  it('defaults to one', () => {
    expect(attemptsAllowedFor({}, 's1')).toBe(1)
  })

  it('adds a teacher grant on top of the class-wide allowance', () => {
    expect(attemptsAllowedFor({ attempts_allowed: 2, extra_attempts: { s1: 1 } }, 's1')).toBe(3)
  })

  it('grants reach only the student they were given to', () => {
    const quiz = { attempts_allowed: 2, extra_attempts: { s1: 1 } }
    expect(attemptsAllowedFor(quiz, 's2')).toBe(2)
  })

  it('survives the class-wide allowance being raised later', () => {
    // Additive, so raising 2→3 does not revoke s1's individual grant.
    expect(attemptsAllowedFor({ attempts_allowed: 3, extra_attempts: { s1: 1 } }, 's1')).toBe(4)
  })
})

describe('unlimited attempts', () => {
  it('reads null and 0 as no ceiling', () => {
    expect(unlimitedAttempts({ attempts_allowed: null })).toBe(true)
    expect(unlimitedAttempts({ attempts_allowed: 0 })).toBe(true)
    expect(attemptsAllowedFor({ attempts_allowed: null }, 's1')).toBe(Infinity)
    expect(attemptsAllowedFor({ attempts_allowed: 0 }, 's1')).toBe(Infinity)
  })

  it('does NOT read a quiz that never stored the field as unlimited', () => {
    // Absent has meant one attempt since the field existed. Reading it as no
    // limit would quietly widen every document written before this feature.
    expect(unlimitedAttempts({})).toBe(false)
    expect(unlimitedAttempts(undefined)).toBe(false)
    expect(attemptsAllowedFor({}, 's1')).toBe(1)
  })

  it('leaves a numeric limit exactly as it was, grant included', () => {
    expect(unlimitedAttempts({ attempts_allowed: 5 })).toBe(false)
    expect(attemptsAllowedFor({ attempts_allowed: 5, extra_attempts: { s1: 1 } }, 's1')).toBe(6)
  })

  it('never runs out of attempts, but still closes on the closing date', () => {
    const quiz = { status: 'published', attempts_allowed: null }
    const used = [done(1), done(2), done(3), done(4), done(5), done(6)]
    expect(canStart({ quiz, attempts: used, studentId: 's1', now: NOW })).toEqual({ ok: true, resuming: false })

    const closed = { ...quiz, closes_at: '2026-04-09T09:00:00Z' }
    expect(canStart({ quiz: closed, attempts: used, studentId: 's1', now: NOW }))
      .toEqual({ ok: false, reason: 'closed' })
  })

  it('never puts the word Infinity in front of anyone', () => {
    expect(attemptsLabel(3)).toBe('3')
    expect(attemptsLabel(Infinity)).toBe('∞')

    const rule = startBriefing({ quiz: { attempts_allowed: null }, attempts: [done(1)], studentId: 's1' })
      .find((r) => r.key === 'attempts')
    expect(rule.label).toBe('Attempt 2')
    expect(`${rule.label} ${rule.detail}`).not.toMatch(/Infinity/)
  })
})

describe('nextAttemptNumber', () => {
  it('follows the highest number used, open attempts included', () => {
    expect(nextAttemptNumber([done(1), open(2)])).toBe(3)
  })

  it('starts at one', () => {
    expect(nextAttemptNumber([])).toBe(1)
  })
})

describe('deadlines', () => {
  it('derives the deadline from the stored start, not from now', () => {
    expect(expiryFrom(NOW, 30)).toBe(NOW + 30 * 60 * 1000)
  })

  it('has no deadline when the quiz is untimed', () => {
    expect(expiryFrom(NOW, null)).toBeNull()
    expect(expiryFrom(NOW, 0)).toBeNull()
  })

  it('reports remaining seconds against the stored deadline', () => {
    const attempt = open(1, { expires_at_ms: NOW + 90_000 })
    expect(secondsRemaining(attempt, NOW)).toBe(90)
  })

  it('does not go negative once the deadline has passed', () => {
    const attempt = open(1, { expires_at_ms: NOW - 10_000_000 })
    expect(secondsRemaining(attempt, NOW)).toBe(0)
    expect(hasExpired(attempt, NOW)).toBe(true)
  })

  it('distinguishes untimed (null) from out of time (0)', () => {
    expect(secondsRemaining(open(1), NOW)).toBeNull()
    expect(hasExpired(open(1), NOW)).toBe(false)
    expect(deadlineOf(open(1))).toBeNull()
  })

  it('gives the same answer however many times the page is reloaded', () => {
    const attempt = open(1, { expires_at_ms: NOW + 600_000 })
    expect(secondsRemaining(attempt, NOW + 60_000)).toBe(540)
    expect(secondsRemaining(attempt, NOW + 120_000)).toBe(480)
  })
})

describe('canStart', () => {
  const quiz = { status: 'published', attempts_allowed: 2 }

  it('allows a first attempt', () => {
    expect(canStart({ quiz, attempts: [], studentId: 's1', now: NOW }))
      .toEqual({ ok: true, resuming: false })
  })

  it('resumes instead of starting when an attempt is open', () => {
    const result = canStart({ quiz, attempts: [open(1)], studentId: 's1', now: NOW })
    expect(result).toEqual({ ok: true, resuming: true })
  })

  it('lets a student resume even once the allowance is spent', () => {
    // Otherwise the open attempt could never be submitted.
    const spent = { ...quiz, attempts_allowed: 1 }
    const result = canStart({ quiz: spent, attempts: [done(1), open(2)], studentId: 's1', now: NOW })
    expect(result.ok).toBe(true)
    expect(result.resuming).toBe(true)
  })

  it('refuses once the allowance is spent', () => {
    const result = canStart({ quiz, attempts: [done(1), done(2)], studentId: 's1', now: NOW })
    expect(result).toEqual({ ok: false, reason: 'no_attempts_left' })
  })

  it('honours a per-student grant', () => {
    const granted = { ...quiz, extra_attempts: { s1: 1 } }
    const result = canStart({ quiz: granted, attempts: [done(1), done(2)], studentId: 's1', now: NOW })
    expect(result.ok).toBe(true)
  })

  it('refuses before the opening time and after the closing time', () => {
    expect(canStart({ quiz: { ...quiz, opens_at: '2026-04-11T09:00:00Z' }, studentId: 's1', now: NOW }).reason)
      .toBe('not_open')
    expect(canStart({ quiz: { ...quiz, closes_at: '2026-04-09T09:00:00Z' }, studentId: 's1', now: NOW }).reason)
      .toBe('closed')
  })

  it('refuses an unpublished quiz and an unassigned student', () => {
    expect(canStart({ quiz: { ...quiz, status: 'draft' }, studentId: 's1', now: NOW }).reason)
      .toBe('not_published')
    expect(canStart({ quiz: { ...quiz, assigned_to: ['s2'] }, studentId: 's1', now: NOW }).reason)
      .toBe('not_assigned')
  })

  it('treats "all" and a missing assignment as everyone', () => {
    expect(canStart({ quiz: { ...quiz, assigned_to: 'all' }, studentId: 's1', now: NOW }).ok).toBe(true)
    expect(canStart({ quiz, studentId: 's1', now: NOW }).ok).toBe(true)
  })
})

describe('startBriefing', () => {
  it('warns that the clock keeps running after Start', () => {
    const rules = startBriefing({ quiz: { time_limit_minutes: 30, attempts_allowed: 2 }, studentId: 's1' })
    const time = rules.find((r) => r.key === 'time')
    expect(time.label).toBe('30 minutes')
    expect(time.detail).toMatch(/keeps running/i)
  })

  it('says so plainly when there is no limit', () => {
    const rules = startBriefing({ quiz: {}, studentId: 's1' })
    expect(rules.find((r) => r.key === 'time').label).toBe('No time limit')
  })

  it('mentions backtracking only when it is prevented', () => {
    expect(startBriefing({ quiz: {}, studentId: 's1' }).some((r) => r.key === 'backtracking')).toBe(false)
    expect(
      startBriefing({ quiz: { prevent_backtracking: true }, studentId: 's1' })
        .some((r) => r.key === 'backtracking'),
    ).toBe(true)
  })

  it('counts the attempt they are about to take', () => {
    const rules = startBriefing({
      quiz: { attempts_allowed: 3 },
      attempts: [done(1)],
      studentId: 's1',
    })
    expect(rules.find((r) => r.key === 'attempts').label).toBe('Attempt 2 of 3')
  })

  it('tells a student on their last attempt to ask the teacher', () => {
    const rules = startBriefing({ quiz: { attempts_allowed: 1 }, studentId: 's1' })
    expect(rules.find((r) => r.key === 'attempts').detail).toMatch(/ask your teacher/i)
  })

  it('always warns that leaving is recorded', () => {
    expect(startBriefing({ quiz: {}, studentId: 's1' }).some((r) => r.key === 'reopen')).toBe(true)
  })
})

describe('lifecycleOf', () => {
  const published = { status: 'published' }

  it('reads a draft as a draft', () => {
    expect(lifecycleOf({ status: 'draft' }, NOW)).toBe('draft')
  })

  it('reads a published quiz with no dates as ongoing', () => {
    expect(lifecycleOf(published, NOW)).toBe('ongoing')
  })

  it('reads one waiting for its opening time as scheduled', () => {
    expect(lifecycleOf({ ...published, opens_at: '2026-04-11T09:00:00Z' }, NOW)).toBe('scheduled')
  })

  it('reads one past its closing time as past', () => {
    expect(lifecycleOf({ ...published, closes_at: '2026-04-09T09:00:00Z' }, NOW)).toBe('past')
  })

  it('reads an explicitly closed quiz as past whatever its dates say', () => {
    expect(lifecycleOf({ status: 'closed', closes_at: '2026-12-01T09:00:00Z' }, NOW)).toBe('past')
  })

  it('reads one inside its window as ongoing', () => {
    const inWindow = { ...published, opens_at: '2026-04-09T09:00:00Z', closes_at: '2026-04-11T09:00:00Z' }
    expect(lifecycleOf(inWindow, NOW)).toBe('ongoing')
  })
})

describe('describeAttemptActivity', () => {
  it('says nothing about a clean finished attempt', () => {
    expect(describeAttemptActivity(done(1))).toBe('')
  })

  it('reports an open attempt and its reopens', () => {
    expect(describeAttemptActivity(open(1))).toBe('In progress')
    expect(describeAttemptActivity(open(1, { reopen_count: 2 }))).toBe('In progress · reopened 2 times')
  })

  it('reports a finished attempt that was reopened', () => {
    expect(describeAttemptActivity({ ...done(1), reopen_count: 1 })).toBe('Reopened 1 time')
  })

  it('reports one that ran out of time', () => {
    expect(describeAttemptActivity({ ...done(1), expired_at_submit: true })).toBe('Time ran out')
  })
})

describe('focus tracking', () => {
  const away = (index, ms, at = '2026-04-10T09:05:00Z') =>
    focusEvent({ at, questionIndex: index, questionId: `q${index + 1}`, awayMs: ms })

  it('normalises an event and never stores a negative duration', () => {
    const event = focusEvent({ at: 'x', questionIndex: 2, questionId: 'q3', awayMs: -5 })
    expect(event).toEqual({ at: 'x', question_index: 2, question_id: 'q3', away_ms: 0 })
  })

  it('handles an event recorded outside any question', () => {
    expect(focusEvent({ at: 'x', questionIndex: undefined, questionId: null, awayMs: 1000 }))
      .toEqual({ at: 'x', question_index: null, question_id: null, away_ms: 1000 })
  })

  it('totals the time away', () => {
    const summary = summariseFocus({ focus_events: [away(0, 4000), away(1, 6000)] })
    expect(summary.count).toBe(2)
    expect(summary.totalAwayMs).toBe(10000)
  })

  it('finds the question they kept leaving on', () => {
    const summary = summariseFocus({
      focus_events: [away(6, 3000), away(6, 9000), away(1, 1000)],
    })
    expect(summary.worst.questionIndex).toBe(6)
    expect(summary.worst.count).toBe(2)
  })

  it('counts events that overflowed the stored cap', () => {
    const summary = summariseFocus({ focus_events: [away(0, 1000)], focus_events_dropped: 40 })
    expect(summary.count).toBe(41)
  })

  it('reports nothing for an attempt nobody left', () => {
    expect(summariseFocus({}).count).toBe(0)
    expect(describeFocus({})).toBe('')
  })

  it('describes the pattern without calling it cheating', () => {
    const line = describeFocus({ focus_events: [away(6, 30000), away(6, 30000)] })
    expect(line).toBe('Left the page 2 times · 1m away · most on Q7')
    expect(line).not.toMatch(/cheat/i)
  })

  it('formats durations at second resolution', () => {
    expect(formatAway(4000)).toBe('4s')
    expect(formatAway(60000)).toBe('1m')
    expect(formatAway(95000)).toBe('1m 35s')
  })
})

describe('discarding an abandoned attempt', () => {
  const discarded = (n = 1) => ({ status: DISCARDED, attempt_number: n })

  it('is neither open nor used', () => {
    // The whole point: the student's slot is freed.
    expect(openAttempt([discarded(1)])).toBeNull()
    expect(finishedAttempts([discarded(1)])).toHaveLength(0)
  })

  it('frees a student to start again', () => {
    const quiz = { status: 'published', attempts_allowed: 1 }
    // Before: the open attempt would resume forever.
    expect(canStart({ quiz, attempts: [open(1)], studentId: 's1', now: NOW }).resuming).toBe(true)
    // After: nothing open, nothing used.
    expect(canStart({ quiz, attempts: [discarded(1)], studentId: 's1', now: NOW }))
      .toEqual({ ok: true, resuming: false })
  })

  it('does not give back an attempt the student actually finished', () => {
    const quiz = { status: 'published', attempts_allowed: 1 }
    const result = canStart({ quiz, attempts: [done(1), discarded(2)], studentId: 's1', now: NOW })
    expect(result).toEqual({ ok: false, reason: 'no_attempts_left' })
  })

  it('never reuses the discarded attempt number', () => {
    // Two sittings under one label would be indistinguishable in the history.
    expect(nextAttemptNumber([done(1), discarded(2)])).toBe(3)
  })

  it('is listed for the teacher', () => {
    expect(discardedAttempts([done(1), discarded(2), open(3)])).toHaveLength(1)
  })

  it('says who ended it', () => {
    expect(describeAttemptActivity(discarded(1))).toBe('Attempt discarded by you')
  })
})

describe('openForMs', () => {
  it('measures from a Firestore timestamp', () => {
    const attempt = open(1, { started_at: { toMillis: () => NOW - 90_000 } })
    expect(openForMs(attempt, NOW)).toBe(90_000)
  })

  it('measures from a plain millisecond field too', () => {
    expect(openForMs(open(1, { started_at_ms: NOW - 5_000 }), NOW)).toBe(5_000)
  })

  it('is null when the start was never recorded', () => {
    expect(openForMs(open(1), NOW)).toBeNull()
  })

  it('never reports a negative age from a skewed clock', () => {
    expect(openForMs(open(1, { started_at_ms: NOW + 10_000 }), NOW)).toBe(0)
  })
})
