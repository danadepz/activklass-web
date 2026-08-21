/**
 * How much of their result a student is allowed to see, and when.
 *
 * Pure -- no Firestore, no React -- because this is the rule that decides
 * whether a retake is an assessment or a copying exercise.
 *
 * Why this exists: the feedback page revealed everything, unconditionally and
 * immediately. `quiz-feedback.jsx` printed **the correct answer for every item
 * the student got wrong**, on every attempt, with no setting to stop it -- and
 * `attempts_allowed` goes up to 10. Attempt one was the answer key; attempt
 * two was transcription. Nothing in the product said so, which is the worst
 * version of it: teachers were setting up retakes believing they measured
 * something.
 *
 * Ported to activklass-mobile/src/lib/quizFeedback.ts. A rule enforced on one
 * client and not the other is not a rule -- a student who opens the phone app
 * would simply read the answers there. Keep the two in step; this copy is the
 * original.
 */

/** When the result becomes readable. */
export const RELEASE_IMMEDIATE = 'immediate'
export const RELEASE_AFTER_CLOSE = 'after_close'
export const RELEASE_AFTER_ATTEMPTS = 'after_attempts'
export const RELEASE_NEVER = 'never'

/** How much of it is readable once it is. */
export const DETAIL_SCORE = 'score'
export const DETAIL_WRONG_ITEMS = 'wrong_items'
export const DETAIL_ANSWERS = 'answers'
export const DETAIL_RATIONALE = 'rationale'

/**
 * The options a teacher picks between, in the order they should be listed.
 *
 * `immediate` + `rationale` is what the product did before this module, and it
 * stays the default: changing what existing quizzes reveal without the teacher
 * asking would be a worse surprise than the leak, and every quiz already
 * published was set up on that understanding.
 */
export const RELEASE_OPTIONS = [
  { id: RELEASE_IMMEDIATE, label: 'As soon as they submit', hint: 'Best for practice and remediation drills.' },
  { id: RELEASE_AFTER_CLOSE, label: 'When the quiz closes', hint: 'Needs a closing date. Stops early takers briefing late ones.' },
  { id: RELEASE_AFTER_ATTEMPTS, label: 'After their last attempt', hint: 'The one to use with retakes — otherwise attempt 1 is the answer key.' },
  { id: RELEASE_NEVER, label: 'Never — I will discuss it in class', hint: 'The score still reaches the class record.' },
]

export const DETAIL_OPTIONS = [
  { id: DETAIL_SCORE, label: 'Score only' },
  { id: DETAIL_WRONG_ITEMS, label: 'Score, and which items were wrong' },
  { id: DETAIL_ANSWERS, label: 'Score, wrong items, and the correct answers' },
  { id: DETAIL_RATIONALE, label: 'Everything, including the AI explanation' },
]

/** Detail levels are cumulative; this is their order. */
const DETAIL_RANK = {
  [DETAIL_SCORE]: 0,
  [DETAIL_WRONG_ITEMS]: 1,
  [DETAIL_ANSWERS]: 2,
  [DETAIL_RATIONALE]: 3,
}

/**
 * Why a quiz's feedback settings cannot be saved as written, or null.
 *
 * `after_close` without a closing date is the trap: it looks like a strict
 * setting and behaves like `never`, silently, for the rest of the term.
 */
export function feedbackProblem(quiz) {
  if (quiz?.feedback_release === RELEASE_AFTER_CLOSE && !quiz?.closes_at) {
    return 'Releasing results when the quiz closes needs a closing date — set one, or choose a different release.'
  }
  return null
}

/**
 * What this student may see of this attempt, right now.
 *
 * `attemptCount` is how many attempts they have already submitted, including
 * this one. `now` is injected rather than read so the caller can be tested.
 *
 * Unknown or missing settings fall back to the pre-existing behaviour
 * (immediate, full detail) rather than to the strictest reading. A quiz saved
 * before these fields existed was written by a teacher who saw full feedback
 * on the page, and quietly hiding it later would change their assessment
 * without telling them.
 */
export function feedbackVisibility({ quiz, attemptCount = 1, now = Date.now() } = {}) {
  const release = quiz?.feedback_release ?? RELEASE_IMMEDIATE
  const detail = quiz?.feedback_detail ?? DETAIL_RATIONALE
  const rank = DETAIL_RANK[detail] ?? DETAIL_RANK[DETAIL_RATIONALE]

  let released = true
  let waitingOn = null

  if (release === RELEASE_NEVER) {
    released = false
    waitingOn = 'Your teacher is not releasing results for this quiz — they will go through it with your class.'
  } else if (release === RELEASE_AFTER_CLOSE) {
    const closesAt = quiz?.closes_at ? new Date(quiz.closes_at).getTime() : null
    // No closing date means there is no moment this could ever release. Saying
    // "when your teacher closes it" is the honest reading, and feedbackProblem
    // stops the combination being saved in the first place.
    released = closesAt != null && now > closesAt
    if (!released) {
      waitingOn = closesAt
        ? `Results open when this quiz closes on ${new Date(closesAt).toLocaleString()}.`
        : 'Results open when your teacher closes this quiz.'
    }
  } else if (release === RELEASE_AFTER_ATTEMPTS) {
    const allowed = Number(quiz?.attempts_allowed) || 1
    released = attemptCount >= allowed
    if (!released) {
      const left = allowed - attemptCount
      waitingOn = `Results open after your last attempt — you have ${left} more.`
    }
  }

  return {
    released,
    waitingOn,
    // The score is the floor: every released result shows it. Withholding the
    // score as well is what RELEASE_NEVER is for.
    showScore: released,
    showItems: released && rank >= DETAIL_RANK[DETAIL_WRONG_ITEMS],
    showCorrectAnswers: released && rank >= DETAIL_RANK[DETAIL_ANSWERS],
    showRationale: released && rank >= DETAIL_RANK[DETAIL_RATIONALE],
  }
}

/**
 * One line telling the teacher what students will see, for the editor.
 *
 * The settings are two dropdowns whose combined effect is not obvious --
 * "after their last attempt" plus "score only" is a very different quiz from
 * "immediately" plus "everything" -- so the editor states the result rather
 * than leaving the teacher to infer it.
 */
export function describeFeedback(quiz) {
  const release = RELEASE_OPTIONS.find((r) => r.id === (quiz?.feedback_release ?? RELEASE_IMMEDIATE))
  const detail = DETAIL_OPTIONS.find((d) => d.id === (quiz?.feedback_detail ?? DETAIL_RATIONALE))
  if (release?.id === RELEASE_NEVER) {
    return 'Students see no result for this quiz. The score still reaches the class record.'
  }
  return `Students see "${detail?.label.toLowerCase()}" — ${release?.label.toLowerCase()}.`
}
