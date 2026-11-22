/**
 * Pure derivation of the model's three leading indicators — the trends that let
 * /api/predict fire before the gradebook does.
 *
 * Shared rather than duplicated because the teacher's panel and the student's
 * own forecast must agree. They read different Firestore shapes (a whole class
 * from the attendance subcollection, versus one student's already-loaded log),
 * so the I/O stays with each caller and only the arithmetic lives here. If the
 * two ever disagreed, a student would be told they are fine while their teacher
 * is looking at a flag — or the reverse, which is worse.
 *
 * No I/O; keep it unit-testable — which also lets the quiz-deadline logic take
 * `now` as an argument instead of reading the clock, so "was this missed?" is
 * testable at all.
 */
import { formatAcademicDate } from './academicDate'

/** present = 1, late = 0.5, absent = 0. Excused days are left out entirely
 *  rather than counted as present -- an excused absence is not attendance. */
export const DAY_WEIGHT = { present: 1, late: 0.5, absent: 0 }

/**
 * Below these counts a difference is noise, not a trend.
 *
 * Both helpers return undefined rather than 0 when short of history. That
 * distinction carries: 0 means "measured, and flat", a reassuring claim we
 * would not have earned in week two, and the backend would score it as a
 * steady student instead of an unknown one.
 */
export const MIN_ATTENDANCE_DAYS = 6
export const MIN_ATTEMPTS = 3

/** Firestore dates arrive as Timestamps or as 'YYYY-MM-DD' doc ids. */
export const sortKey = (v) =>
  v && typeof v.toDate === 'function' ? v.toDate().toISOString() : String(v ?? '')

/**
 * Mean of the trailing third minus the mean of the leading two thirds.
 *
 * A third rather than a fixed window so it scales with however much of the term
 * has been recorded: six days compares the last two against the first four, and
 * thirty compares the last ten against the first twenty. `values` must already
 * be in chronological order — this cannot tell which end is recent.
 */
export function splitTrend(values, minimum) {
  if (!Array.isArray(values) || values.length < minimum) return undefined
  const cut = Math.max(1, Math.floor(values.length / 3))
  const recent = values.slice(-cut)
  const earlier = values.slice(0, -cut)
  if (!recent.length || !earlier.length) return undefined
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
  return mean(recent) - mean(earlier)
}

/**
 * Attendance rate (0-100) from recognised marks: present 1, late 0.5, absent 0.
 * Excused and unrecorded sessions are outside the denominator. undefined when
 * nothing is recorded -- never a reassuring 100 or an alarming 0.
 */
export function attendanceRateFromMarks(statuses) {
  const marks = (statuses ?? []).map((s) => DAY_WEIGHT[s]).filter((w) => w != null)
  return marks.length ? (marks.reduce((a, b) => a + b, 0) / marks.length) * 100 : undefined
}

/** Same rate from a `{ date, status }` log, the shape the student page holds. */
export function attendanceRateFromLog(log) {
  return attendanceRateFromMarks((log ?? []).map((r) => r?.status))
}

/**
 * Attendance trend (-1..1) from a log of `{ date, status }`, in any order.
 *
 * Sorted here rather than trusted from the caller: studentData
 * .loadStudentAttendance returns newest-first for display while the class query
 * builds oldest-first, and feeding a reversed log to splitTrend inverts the
 * sign — flagging every improving student and clearing every sliding one.
 */
export function attendanceTrendFromLog(log) {
  const marks = [...(log ?? [])]
    .sort((a, b) => sortKey(a.date).localeCompare(sortKey(b.date)))
    .map((r) => DAY_WEIGHT[r?.status])
    .filter((w) => w != null)
  return splitTrend(marks, MIN_ATTENDANCE_DAYS)
}

/**
 * One entry per distinct graded quiz: the best scored attempt's percentage,
 * dated by the quiz's AUTHORITATIVE date (policy A3, 2026-11-22) -- its due
 * date, else its class-record column's date (see quizDueDates). `quizDates` is
 * { [quizId]: 'YYYY-MM-DD' }; a quiz with no such date keeps `date: null` and is
 * never given one from when it happened to be submitted. Dated quizzes come
 * first in date order, undated ones after.
 *
 * A retake is another try at the same activity, not another activity, so a
 * class whose teacher allows retakes no longer looks like it ran more quizzes
 * than one that does not. A scored 0 is kept (a real result); an attempt with
 * no `total_score` is awaiting grading and a zero `total_possible` is
 * unusable -- neither is a score. Legacy attempts without `quiz_id` each stay
 * their own entry rather than being merged by guess.
 */
export function distinctQuizScores(attempts, quizDates = {}) {
  const byQuiz = new Map()
  let anon = 0
  for (const a of attempts ?? []) {
    if (a?.total_score == null || !a?.total_possible) continue
    const pct = (a.total_score / a.total_possible) * 100
    const key = a.quiz_id ?? `__no_quiz_id_${anon++}`
    const cur = byQuiz.get(key)
    if (!cur) byQuiz.set(key, { quizId: a.quiz_id ?? null, best: pct, date: (a.quiz_id && quizDates?.[a.quiz_id]) || null })
    else cur.best = Math.max(cur.best, pct)
  }
  const rank = (q) => `${q.date ? `0${q.date}` : '1'}|${q.quizId ?? ''}`
  return [...byQuiz.values()].sort((x, y) => rank(x).localeCompare(rank(y)))
}

/**
 * Each quiz's authoritative date, 'YYYY-MM-DD': the due date (`closes_at`)
 * when the quiz has one, else the `date_given` of its class-record column
 * (`quiz-{id}`). Anything else is left out -- a missing date is not invented.
 */
export function quizDueDates(quizzes, assessments) {
  const out = {}
  const recordDate = {}
  for (const a of assessments ?? []) {
    if (a?.source_quiz_id && /^\d{4}-\d{2}-\d{2}/.test(a?.date_given ?? '')) recordDate[a.source_quiz_id] = a.date_given.slice(0, 10)
  }
  for (const q of quizzes ?? []) {
    const due = /^\d{4}-\d{2}-\d{2}/.test(q?.closes_at ?? '') ? q.closes_at.slice(0, 10) : null
    const date = due ?? recordDate[q?.id] ?? null
    if (q?.id && date) out[q.id] = date
  }
  return out
}

/** Mean of each distinct quiz's best percentage (0-100), or undefined. */
export function quizAverageFromAttempts(attempts) {
  const quizzes = distinctQuizScores(attempts)
  return quizzes.length ? quizzes.reduce((s, q) => s + q.best, 0) / quizzes.length : undefined
}

/**
 * Quiz trend in percentage points across distinct graded quizzes in order of
 * their authoritative dates. Only DATED quizzes take part: without trustworthy
 * chronology there is no trend, so fewer than MIN_ATTEMPTS (3) dated quizzes
 * gives undefined -- and the model then reports insufficient data (A7).
 */
export function quizTrendFromAttempts(attempts, quizDates = {}) {
  return splitTrend(distinctQuizScores(attempts, quizDates).filter((q) => q.date).map((q) => q.best), MIN_ATTEMPTS)
}

/**
 * Counts behind the quiz indicators, so a teacher sees how much evidence a
 * value rests on: distinct graded quizzes, quizzes attempted but not yet
 * graded, and retakes folded away.
 */
export function quizEvidence(attempts, quizDates = {}) {
  const all = attempts ?? []
  const distinct = distinctQuizScores(all, quizDates)
  const graded = distinct.length
  const attemptedIds = new Set(all.map((a) => a?.quiz_id).filter(Boolean))
  const gradedIds = new Set(distinctQuizScores(all).map((q) => q.quizId).filter(Boolean))
  const scoredAttempts = all.filter((a) => a?.total_score != null && a?.total_possible).length
  return {
    gradedQuizzes: graded,
    awaitingGrading: [...attemptedIds].filter((id) => !gradedIds.has(id)).length,
    retakesFolded: scoredAttempts - graded,
    undatedQuizzes: distinct.filter((q) => !q.date).length,
  }
}

/**
 * ---------------------------------------------------------------------------
 * Work not done
 *
 * Returned as {notDone, expected} COUNTS rather than a rate, because two
 * sources feed one indicator: assessments a teacher marked 'missing' in the
 * gradebook, and published quizzes whose window closed with no attempt. Rates
 * cannot be averaged without weighting by how much each side counted, and a
 * student with one missing assessment out of one plus zero missed quizzes out
 * of eight is not 50% adrift. Pool the counts, divide once.
 * ---------------------------------------------------------------------------
 */

/** Missing assessments for one student, from the class-wide assessment docs. */
export function missingWorkCounts(assessments, studentId) {
  let expected = 0
  let notDone = 0
  for (const assessment of assessments ?? []) {
    const score = assessment?.scores?.[studentId]
    // 'excused' is excluded: grading.js already treats it as neither earned nor
    // possible, and counting it would flag a student for an absence their
    // teacher approved. No record at all is not yet evidence of anything.
    if (!score || score.status === 'excused') continue
    expected += 1
    if (score.status === 'missing') notDone += 1
  }
  return { notDone, expected }
}

/**
 * Same counts, from the shape a student's own gradebook entry uses.
 *
 * gradebooks/{classId}/assessments holds one doc per assessment with a `scores`
 * map keyed by student; gradebooks/{classId}/entries/{studentId} holds that
 * student's assessments already flattened, each carrying its own status. Two
 * readers, two shapes, one definition of "not done" -- which is the point of
 * both living here.
 */
export function missingWorkCountsFromEntry(entryAssessments) {
  let expected = 0
  let notDone = 0
  for (const assessment of entryAssessments ?? []) {
    if (!assessment?.status || assessment.status === 'excused') continue
    expected += 1
    if (assessment.status === 'missing') notDone += 1
  }
  return { notDone, expected }
}

/**
 * Is this quiz assigned to this student?
 *
 * Mirrors routes/student/scaffolding.js:assignedToStudent exactly -- change
 * them together. Duplicated rather than imported because src/lib/** is the Data
 * lane and that file is student-page logic (see OWNERSHIP.md); importing it
 * here would also drag @/theme into a module that must stay pure.
 */
function assignedTo(quiz, studentId) {
  const a = quiz?.assigned_to
  return !a || a === 'all' || (Array.isArray(a) && a.includes(studentId))
}

/**
 * Can this quiz still be attempted?
 *
 * Only a quiz a student can no longer sit counts against them. An open quiz
 * they have not started yet is homework, not a warning sign, and counting it
 * would flag every student the morning a quiz is published.
 */
function windowClosed(quiz, now) {
  if (quiz?.status === 'closed') return true
  if (quiz?.status !== 'published') return false // drafts are not expected work
  const closesAt = quiz?.closes_at
  if (!closesAt) return false // open-ended: never overdue
  const closes = new Date(closesAt).getTime()
  return Number.isFinite(closes) && closes < now
}

/**
 * Quizzes this student was assigned, could no longer take, and never attempted.
 *
 * This is the blind spot the rest of the model cannot see. Every other quiz
 * signal is derived from quiz_attempts documents, and a student who never
 * opened a quiz has no document at all -- so disengagement arrived as an
 * ABSENCE of data, and absence of data is exactly what the backend fills with a
 * healthy default. The student who had stopped working was the one the model
 * was most confident about. Reading it from the quiz list instead of the
 * attempt list is what closes that.
 *
 * `attemptedQuizIds` is a Set of quiz ids this student has any attempt for; an
 * attempt document only exists once submitted, so its presence is submission.
 */
export function missedQuizCounts(quizzes, attemptedQuizIds, studentId, now = Date.now(), excusedQuizIds = null) {
  const attempted = attemptedQuizIds ?? new Set()
  let expected = 0
  let notDone = 0
  for (const quiz of quizzes ?? []) {
    if (!assignedTo(quiz, studentId) || !windowClosed(quiz, now)) continue
    // A4: an officially excused quiz leaves numerator AND denominator.
    if (excusedQuizIds?.has(quiz.id)) continue
    expected += 1
    if (!attempted.has(quiz.id)) notDone += 1
  }
  return { notDone, expected }
}

/**
 * Disclosure-only breakdown of one student's work, beside the rate.
 *
 * The rate itself is unchanged (missingWorkCounts + missedQuizCounts); this
 * says what the rest of the work is, so "0% missing" from one due item reads
 * differently from 0% across twelve, and unknown is never folded into done:
 *   missing    teacher-marked missing, or a closed assigned quiz never attempted
 *   submitted  a graded assessment score
 *   attempted  a closed quiz with any attempt (may still be in progress)
 *   ungraded   an assessment entry without a graded score yet
 *   excused    teacher-excused assessment, or an officially excused quiz (A4)
 *   unknown    an assessment with no entry for this student, already given
 *   notDue     an assessment dated in the future, or a quiz still open / draft
 */
export function workEvidence(assessments, quizzes, attemptedQuizIds, studentId, now = Date.now(), excusedQuizIds = null) {
  const out = { missing: 0, submitted: 0, attempted: 0, ungraded: 0, excused: 0, unknown: 0, notDue: 0 }
  for (const a of assessments ?? []) {
    const score = a?.scores?.[studentId]
    if (!score) {
      const given = a?.date_given ? new Date(`${a.date_given}T00:00:00`).getTime() : NaN
      if (Number.isFinite(given) && given > now) out.notDue += 1
      else out.unknown += 1
    } else if (score.status === 'excused') out.excused += 1
    else if (score.status === 'missing') out.missing += 1
    else if (score.status === 'graded' && score.raw_score != null) out.submitted += 1
    else out.ungraded += 1
  }
  const attempted = attemptedQuizIds ?? new Set()
  for (const quiz of quizzes ?? []) {
    if (!assignedTo(quiz, studentId)) continue
    if (quiz?.status !== 'published' && quiz?.status !== 'closed') continue // drafts are not assigned work
    if (excusedQuizIds?.has(quiz.id)) { out.excused += 1; continue }
    if (!windowClosed(quiz, now)) out.notDue += 1
    else if (attempted.has(quiz.id)) out.attempted += 1
    else out.missing += 1
  }
  return out
}

/**
 * A2 (2026-11-22): is there valid graded work behind this student's period
 * grade? A graded score with a raw score, or a teacher-marked 'missing' (which
 * the record scores as 0). Excused, ungraded and absent entries are not -- a
 * grade computed from none of them is not sent to the model.
 */
export function hasGradedWork(assessments, studentId) {
  return (assessments ?? []).some((a) => {
    const s = a?.scores?.[studentId]
    return s?.status === 'missing' || (s?.status === 'graded' && s?.raw_score != null)
  })
}

/**
 * A2: the 0-100 grade the model receives for one student in the SELECTED
 * grading period, or null -- which the backend reports as insufficient data
 * (A7). Null when the period has no valid graded work for the student and no
 * teacher override; otherwise the period grade through `toPercent` (the
 * Performance tab's DepEd/CHED conversion, unchanged).
 */
export function riskGradeInput({ grade, periodAssessments, studentId, override, toPercent = (g) => g }) {
  if (grade == null) return null
  if (override == null && !hasGradedWork(periodAssessments, studentId)) return null
  return toPercent(grade)
}

/**
 * Pool any number of {notDone, expected} counts into one 0-1 rate.
 *
 * undefined when nothing was expected of the student yet -- no assessments
 * marked and no quiz windows closed. That is genuinely unknown, not zero, and
 * sending 0 would tell the model "measured, and nothing outstanding".
 */
export function missingRate(...counts) {
  let notDone = 0
  let expected = 0
  for (const part of counts) {
    if (!part) continue
    notDone += part.notDone ?? 0
    expected += part.expected ?? 0
  }
  return expected ? notDone / expected : undefined
}

/* ---------------------------------------------------------------------------
 * Teacher-facing evidence wording (PredictedRisk). Pure text from counts.
 * ------------------------------------------------------------------------- */

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : word === 'quiz' ? 'zes' : 's'}`

/** Class-wide meeting coverage, from the attendance session ledger. */
export function sessionCoverageText(sessions) {
  if (!sessions) return null
  const since = sessions.start_source === 'class'
    ? ` since the class start date (${formatAcademicDate(sessions.start)})`
    : sessions.start_source === 'first_record'
      ? ` since the first recorded day (${formatAcademicDate(sessions.start)}; no class start date set)`
      : ''
  // Make-ups are reported apart from ordinary planned meetings; `recorded`
  // itself still includes them, because the attendance rate reads their marks.
  const recorded = sessions.recorded - (sessions.makeup_recorded ?? 0)
  const unconfirmed = sessions.unconfirmed - (sessions.makeup_unconfirmed ?? 0)
  const parts = [`${recorded} of ${recorded + unconfirmed} planned meetings${since} have at least one attendance mark`]
  if (unconfirmed) parts.push(`${unconfirmed} not yet confirmed`)
  if (sessions.cancelled) parts.push(`${sessions.cancelled} cancelled`)
  if (sessions.rescheduled) parts.push(`${sessions.rescheduled} moved`)
  if (sessions.makeup) {
    parts.push(`${sessions.makeup} make-up session${sessions.makeup === 1 ? '' : 's'} (${sessions.makeup_recorded ?? 0} recorded)`)
  }
  if (sessions.ended) parts.push(`class ended ${formatAcademicDate(sessions.ended)}; no regular meetings planned after it`)
  return parts.join(' · ')
}

/** What one student's six values rest on, in counts a teacher can check. */
export function evidenceText(evidence) {
  if (!evidence) return null
  const a = evidence.attendance ?? {}
  const q = evidence.quizzes ?? {}
  const w = evidence.work ?? {}
  const due = (w.missing ?? 0) + (w.submitted ?? 0) + (w.attempted ?? 0) + (w.ungraded ?? 0)
  const work = due
    ? `${w.missing ?? 0} of ${due} due items missing` +
      (w.attempted ? ` (${plural(w.attempted, 'quiz')} attempted; may be ungraded)` : '')
    : 'no work due yet'
  return [
    `${plural(a.marks ?? 0, 'attendance mark')} of ${plural(a.held_sessions ?? 0, 'held session')}` +
      (a.not_recorded ? ` (${a.not_recorded} not recorded)` : ''),
    `${q.gradedQuizzes ?? 0} graded ${q.gradedQuizzes === 1 ? 'quiz' : 'quizzes'}` +
      (q.awaitingGrading ? ` (${q.awaitingGrading} awaiting grading)` : '') +
      (q.undatedQuizzes ? ` (${q.undatedQuizzes} without a due date, left out of the trend)` : ''),
    work,
  ].join(' · ')
}

/**
 * Identify At-Risk Students — the model's view, kept deliberately apart from
 * the grade-threshold list on the same page.
 *
 * The two disagree by design, and the disagreement is the point: the list above
 * reports work already marked, this one projects where a student is heading
 * from the direction their attendance, submissions and quiz scores are moving.
 * A student who appears in neither list today but appears here first is exactly
 * who this panel exists for. Presenting them as one number would invite a
 * teacher to read a projection as a result.
 *
 * Each flagged student is shown WITH the indicators that put them there. A
 * percentage on its own tells a teacher to worry; "attendance down ~26 pts,
 * 35% of work not submitted" tells them what to open the conversation about.
 *
 * Coverage is shown, not hidden, and unlike the levels it now varies per
 * student: a trend needs enough recorded days or attempts to difference, so
 * early in a term the model is working from less than it looks. A teacher
 * needs to know that before acting on a green flag.
 */
