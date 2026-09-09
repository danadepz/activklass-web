/**
 * The life of one quiz attempt: may it start, how long is left, and what
 * counts as reopening it.
 *
 * Pure -- no Firestore, no React -- because these rules decide whether a
 * student is allowed to sit an exam and how much time they get, and both are
 * arguable enough to need to be readable on their own.
 *
 * Why this exists: the countdown used to be client state seeded from
 * `time_limit_minutes` at mount. Nothing recorded when the student began, so a
 * refresh handed back the full time with the answers still in sessionStorage --
 * a timed quiz was untimed for anyone who pressed reload. Fixing that means
 * the attempt has to exist *before* the answers do: pressing Start writes an
 * `in_progress` document stamped with the server clock, and the deadline is
 * derived from that stamp rather than from whenever this tab happened to open.
 *
 * Ported to activklass-mobile/src/lib/quizAttempts.ts. A deadline enforced on
 * one client and not the other is not a deadline. Keep the two in step; this
 * copy is the original.
 */

export const IN_PROGRESS = 'in_progress'
export const SUBMITTED = 'submitted'
export const GRADED = 'graded'

/**
 * An attempt the teacher ended without a submission.
 *
 * A status rather than a deletion. Deleting would be simpler and would also
 * destroy the reopen history and the away-events attached to it -- the very
 * record that would explain why the attempt was abandoned in the first place.
 * A discarded attempt is inert: it counts as neither open nor used, so the
 * student's slot is freed, and it stays readable.
 */
export const DISCARDED = 'discarded'

/** Attempts that are over, however they ended. */
const FINISHED = new Set([SUBMITTED, GRADED])

/**
 * Attempts that count against the student's allowance.
 *
 * An `in_progress` attempt is deliberately excluded. It is counted separately
 * by `openAttempt` below, because a student who is *in* their second sitting
 * has not yet used a third, and counting the open one would lock them out of
 * the attempt they are currently taking.
 */
export function finishedAttempts(attempts = []) {
  return attempts
    .filter((a) => FINISHED.has(a?.status))
    .sort((a, b) => (a.attempt_number ?? 0) - (b.attempt_number ?? 0))
}

/**
 * The attempt this student has open, if any.
 *
 * More than one is a data error rather than a state to support -- Start
 * refuses while one is open -- so the earliest is returned and the rest are
 * left for the teacher's view to show. Picking the newest would let a bug that
 * created duplicates quietly hand out fresh time.
 */
export function openAttempt(attempts = []) {
  const open = attempts
    .filter((a) => a?.status === IN_PROGRESS)
    .sort((a, b) => (a.attempt_number ?? 0) - (b.attempt_number ?? 0))
  return open[0] ?? null
}

/**
 * How many attempts this student may take.
 *
 * `extra_attempts` is the per-student grant a teacher makes when someone's
 * connection drops or they ask to retake. It is additive rather than a
 * replacement so that raising the class-wide allowance later does not silently
 * revoke an individual grant.
 */
export function attemptsAllowedFor(quiz, studentId) {
  // Unlimited swallows the grant rather than adding to it: there is no
  // ceiling left to raise.
  if (unlimitedAttempts(quiz)) return Infinity
  const base = Number(quiz?.attempts_allowed) || 1
  const extra = Number(quiz?.extra_attempts?.[studentId]) || 0
  return Math.max(base + extra, 0)
}

/**
 * Whether this quiz has no ceiling on attempts -- the closing date is the
 * only limit.
 *
 * `attempts_allowed: null` or `0` is the sentinel the teacher picks with
 * "Unlimited attempts until it closes". A quiz that never stored the field is
 * deliberately NOT unlimited: absent has meant one attempt since the field
 * existed, and reading it as no limit would quietly widen every old document.
 */
export function unlimitedAttempts(quiz) {
  const raw = quiz?.attempts_allowed
  if (raw === undefined || raw === '') return false
  if (raw === null) return true
  const n = Number(raw)
  return Number.isFinite(n) && n === 0
}

/**
 * The allowance as a person should read it.
 *
 * Exists because `Infinity` reaches a template literal as the word "Infinity",
 * which is what a counter would print the moment unlimited was introduced.
 */
export function attemptsLabel(allowed) {
  return Number.isFinite(allowed) ? String(allowed) : '∞'
}

/**
 * Attempt number a new sitting would be given.
 *
 * Every attempt ever numbered counts here, discarded ones included. The number
 * is a label, not an allowance: reusing 2 because attempt 2 was discarded
 * would put two different sittings under one label in the teacher's history.
 */
export function nextAttemptNumber(attempts = []) {
  return (attempts ?? []).reduce((max, a) => Math.max(max, Number(a?.attempt_number) || 0), 0) + 1
}

/** Attempts a teacher ended without a submission. */
export function discardedAttempts(attempts = []) {
  return attempts.filter((a) => a?.status === DISCARDED)
}

/**
 * How long an attempt has been open, in milliseconds, or null.
 *
 * The figure a teacher needs before discarding one: a sitting opened four
 * minutes ago is someone still working, and one opened yesterday is not.
 */
export function openForMs(attempt, now = Date.now()) {
  const started = attempt?.started_at?.toMillis?.() ?? attempt?.started_at_ms
  if (!Number.isFinite(started)) return null
  return Math.max(0, now - started)
}

/** Millisecond deadline for an attempt, or null when the quiz is untimed. */
export function deadlineOf(attempt) {
  const ms = Number(attempt?.expires_at_ms)
  return Number.isFinite(ms) && ms > 0 ? ms : null
}

/**
 * Seconds left on an open attempt.
 *
 * Returns null for an untimed quiz -- distinct from 0, which means the time is
 * gone. Never returns a negative: a deadline three hours in the past and one
 * three seconds in the past both mean the same thing to the player.
 */
export function secondsRemaining(attempt, now = Date.now()) {
  const deadline = deadlineOf(attempt)
  if (deadline == null) return null
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}

/** Whether an attempt's time has run out. Untimed attempts never expire. */
export function hasExpired(attempt, now = Date.now()) {
  const deadline = deadlineOf(attempt)
  return deadline != null && now >= deadline
}

/**
 * The deadline to stamp on a new attempt, from the server's start time.
 *
 * Taking the start from the server rather than the device is the whole point:
 * a phone with its clock wound back would otherwise buy itself extra time on
 * every attempt. The remaining countdown still ticks on the device, so a
 * skewed clock can still drift *within* one sitting -- what it can no longer
 * do is reset the deadline by reloading.
 */
export function expiryFrom(startedAtMs, timeLimitMinutes) {
  const minutes = Number(timeLimitMinutes)
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  if (!Number.isFinite(startedAtMs)) return null
  return startedAtMs + minutes * 60 * 1000
}

/**
 * Whether this student may begin a new attempt, and why not.
 *
 * The reasons are returned as codes rather than sentences so the two clients
 * can word them in their own voice while agreeing on the decision.
 */
export function canStart({ quiz, attempts = [], studentId, now = Date.now() } = {}) {
  if (quiz?.status && quiz.status !== 'published') {
    return { ok: false, reason: 'not_published' }
  }
  const assignedTo = quiz?.assigned_to
  if (
    assignedTo &&
    assignedTo !== 'all' &&
    !(Array.isArray(assignedTo) && studentId && assignedTo.includes(studentId))
  ) {
    return { ok: false, reason: 'not_assigned' }
  }
  if (quiz?.opens_at && now < new Date(quiz.opens_at).getTime()) {
    return { ok: false, reason: 'not_open' }
  }
  if (quiz?.closes_at && now > new Date(quiz.closes_at).getTime()) {
    return { ok: false, reason: 'closed' }
  }
  // Checked before the allowance: someone mid-attempt is resuming, not
  // starting, and telling them they are out of attempts would be both wrong
  // and unrecoverable -- their open attempt would never be submitted.
  if (openAttempt(attempts)) {
    return { ok: true, resuming: true }
  }
  if (finishedAttempts(attempts).length >= attemptsAllowedFor(quiz, studentId)) {
    return { ok: false, reason: 'no_attempts_left' }
  }
  return { ok: true, resuming: false }
}

/**
 * The rules to put in front of a student before they commit to starting.
 *
 * Returned as data so both clients show the same list. This is the screen that
 * makes the timer fair: once Start is pressed the clock runs whether or not
 * the tab stays open, so the student has to be told that first.
 */
export function startBriefing({ quiz, attempts = [], studentId, drawCount = null } = {}) {
  const allowed = attemptsAllowedFor(quiz, studentId)
  const used = finishedAttempts(attempts).length
  const rules = []

  const minutes = Number(quiz?.time_limit_minutes)
  if (Number.isFinite(minutes) && minutes > 0) {
    rules.push({
      key: 'time',
      label: `${minutes} minute${minutes === 1 ? '' : 's'}`,
      detail: 'The clock starts when you press Start and keeps running if you close this page.',
    })
  } else {
    rules.push({ key: 'time', label: 'No time limit', detail: 'Take as long as you need.' })
  }

  if (quiz?.prevent_backtracking) {
    rules.push({
      key: 'backtracking',
      label: 'No going back',
      detail: 'Once you move on from a question you cannot return to it.',
    })
  }

  if (drawCount) {
    rules.push({
      key: 'draw',
      label: `${drawCount} questions`,
      detail: 'Drawn for you from a larger set, so your paper differs from your classmates.',
    })
  }

  // No "of N" and no count of what is left when there is no ceiling: both
  // would read as "Infinity", and neither is a fact about this quiz.
  if (Number.isFinite(allowed)) {
    rules.push({
      key: 'attempts',
      label: `Attempt ${used + 1} of ${allowed}`,
      detail:
        used + 1 >= allowed
          ? 'This is your last attempt. Ask your teacher if you need another.'
          : `You have ${allowed - used - 1} more after this one.`,
    })
  } else {
    rules.push({
      key: 'attempts',
      label: `Attempt ${used + 1}`,
      detail: 'You can retake this quiz as many times as you like until it closes.',
    })
  }

  rules.push({
    key: 'reopen',
    label: 'Leaving is recorded',
    detail: 'You can come back and carry on, but your teacher sees that the quiz was reopened.',
  })

  return rules
}

/**
 * Where a quiz sits in its own life, for the teacher's tabs.
 *
 * Derived rather than stored: `opens_at` and `closes_at` already say it, and a
 * second stored field would be one more thing to keep true. A quiz explicitly
 * closed by the teacher is past whatever its dates say.
 */
export function lifecycleOf(quiz, now = Date.now()) {
  if (!quiz?.status || quiz.status === 'draft') return 'draft'
  if (quiz.status === 'closed') return 'past'
  if (quiz.closes_at && now > new Date(quiz.closes_at).getTime()) return 'past'
  if (quiz.opens_at && now < new Date(quiz.opens_at).getTime()) return 'scheduled'
  return 'ongoing'
}

export const LIFECYCLE_TABS = [
  { id: 'ongoing', label: 'Ongoing', hint: 'Open to students right now' },
  { id: 'scheduled', label: 'Scheduled', hint: 'Published, waiting for its opening time' },
  { id: 'draft', label: 'Drafts', hint: 'Not published' },
  { id: 'past', label: 'Past', hint: 'Closed, or past their closing time' },
]

/**
 * One line describing an in-progress or reopened attempt, for the teacher.
 *
 * Reopening is not misconduct and is not worded as though it were -- a dropped
 * connection looks exactly the same. It is reported because a teacher deciding
 * whether to grant another attempt needs to know it happened.
 */
export function describeAttemptActivity(attempt) {
  if (!attempt) return ''
  const reopens = Number(attempt.reopen_count) || 0
  if (attempt.status === DISCARDED) {
    return 'Attempt discarded by you'
  }
  if (attempt.status === IN_PROGRESS) {
    return reopens
      ? `In progress · reopened ${reopens} time${reopens === 1 ? '' : 's'}`
      : 'In progress'
  }
  if (attempt.expired_at_submit) {
    return reopens ? `Time ran out · reopened ${reopens}×` : 'Time ran out'
  }
  return reopens ? `Reopened ${reopens} time${reopens === 1 ? '' : 's'}` : ''
}

/* ------------------------------------------------------------------ focus

   Leaving the quiz -- switching browser tab, or sending the app to the
   background -- is recorded per event, with the question that was on screen.

   What this can and cannot see, stated here because the teacher's screen must
   not overclaim it: it detects THIS tab or app losing focus. It cannot see
   what the student switched to, and it is blind to a second device, a phone on
   the desk, or a person in the room. A student reading their notes on paper
   produces no events at all. It is evidence of attention leaving the page, not
   evidence of cheating, and the wording everywhere downstream reflects that.

   Nothing is blocked on the strength of it. Blocking would be unenforceable --
   the events are written by the client and a determined student can simply not
   send them -- and punishing a dropped connection or an incoming call is worse
   than recording it. */

/** More than this many events and the tail is counted rather than stored. */
export const FOCUS_EVENT_CAP = 100

/**
 * One away-and-back event, ready to append.
 *
 * `at` is an ISO string, not a server timestamp: Firestore refuses sentinel
 * values inside array elements, and this is one element of an array that grows
 * during the attempt. The attempt's own `started_at` is server-stamped, so the
 * trustworthy anchor is still there to compare against.
 */
export function focusEvent({ at, questionIndex, questionId, awayMs }) {
  return {
    at,
    question_index: Number.isFinite(questionIndex) ? questionIndex : null,
    question_id: questionId ?? null,
    away_ms: Math.max(0, Math.round(Number(awayMs) || 0)),
  }
}

/**
 * Roll up an attempt's away events for the teacher.
 *
 * Grouped by question as well as totalled, because "left the page 9 times"
 * and "left the page 9 times, all on question 7" are different observations
 * and only the second one is worth a conversation.
 */
export function summariseFocus(attempt) {
  const events = Array.isArray(attempt?.focus_events) ? attempt.focus_events : []
  const overflow = Number(attempt?.focus_events_dropped) || 0
  const count = events.length + overflow
  const totalAwayMs = events.reduce((sum, e) => sum + (Number(e?.away_ms) || 0), 0)

  const byQuestion = new Map()
  for (const event of events) {
    const key = event?.question_index ?? -1
    const row = byQuestion.get(key) ?? { questionIndex: key, count: 0, awayMs: 0 }
    row.count += 1
    row.awayMs += Number(event?.away_ms) || 0
    byQuestion.set(key, row)
  }

  const worst = [...byQuestion.values()].sort((a, b) => b.count - a.count || b.awayMs - a.awayMs)[0] ?? null

  return { count, totalAwayMs, events, overflow, byQuestion: [...byQuestion.values()], worst }
}

/** Human duration for a span of milliseconds, at second resolution. */
export function formatAway(ms) {
  const total = Math.round((Number(ms) || 0) / 1000)
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`
}

/**
 * One neutral line about an attempt's away events, or '' when there were none.
 *
 * Deliberately descriptive. "Left the page" is what was observed; "cheated" is
 * an inference this data cannot support.
 */
export function describeFocus(attempt) {
  const { count, totalAwayMs, worst } = summariseFocus(attempt)
  if (!count) return ''
  const base = `Left the page ${count} time${count === 1 ? '' : 's'} · ${formatAway(totalAwayMs)} away`
  if (worst && worst.count > 1 && worst.questionIndex >= 0) {
    return `${base} · most on Q${worst.questionIndex + 1}`
  }
  return base
}
