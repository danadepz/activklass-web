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
 * Quiz trend in percentage points from attempts carrying `submitted_at`.
 *
 * Walks attempts in submission order, unlike the quiz *average*, which stays
 * best-per-student to match every other teacher view. A student whose scores
 * are falling still has their one good early attempt sitting in the maximum,
 * which is exactly the case this is here to catch.
 */
export function quizTrendFromAttempts(attempts) {
  const scored = (attempts ?? [])
    .filter((a) => a?.total_score != null && a?.total_possible)
    .map((a) => ({ pct: (a.total_score / a.total_possible) * 100, at: sortKey(a.submitted_at) }))
    .sort((x, y) => x.at.localeCompare(y.at))
  return splitTrend(scored.map((a) => a.pct), MIN_ATTEMPTS)
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
export function missedQuizCounts(quizzes, attemptedQuizIds, studentId, now = Date.now()) {
  const attempted = attemptedQuizIds ?? new Set()
  let expected = 0
  let notDone = 0
  for (const quiz of quizzes ?? []) {
    if (!assignedTo(quiz, studentId) || !windowClosed(quiz, now)) continue
    expected += 1
    if (!attempted.has(quiz.id)) notDone += 1
  }
  return { notDone, expected }
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
