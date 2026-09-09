/**
 * A score dispute opens the answers the teacher is judging
 * (T-40, triplecookiemonster-55).
 *
 * Kristine was ruling on disputes from "1/3" and one line of reason: the
 * Score disputes band was three static divs, nothing in a row was clickable,
 * and no teacher screen rendered `per_question` at all — so there was nowhere
 * to go and look. A dispute on a quiz-posted column now opens that student's
 * own attempt.
 *
 * Three things here are load-bearing and would each fail quietly:
 *
 *   1. The link. A `grade_contests` document carries no quiz id. It goes
 *      contest.assessment_id -> assessment.source_quiz_id, the field
 *      quizToRecord stamps when a quiz's scores are posted. Get it wrong and
 *      either nothing opens or the wrong attempt does.
 *   2. The query. It must carry BOTH quiz_id and class_id. A quiz_id-only
 *      query is refused *even for the owning teacher* — the rules cannot prove
 *      ownership from it (DATA-MODEL §4, and CLAUDE.md's standing warning that
 *      a list query must carry the fact the rule reads). That failure is a
 *      403 in the browser and nothing at all in a unit test, which is exactly
 *      why it is asserted here.
 *   3. The hand-entered column. A dispute on a column typed straight into the
 *      grid has no attempt behind it and must look and behave as it always did.
 *
 * The panel is a sub-component of a page that loads a whole gradebook bundle,
 * so this reads the source; the browser pass drove the modal itself.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./record.jsx', import.meta.url)), 'utf8')

/** The body of a named function declaration, brace-matched.
 *  Skips the parameter list first — these components destructure their props,
 *  so the first `{` after the name is the parameters, not the body. */
function functionBody(name) {
  const at = src.search(new RegExp(`function ${name}\\b`))
  if (at === -1) return null
  let params = 0
  let i = src.indexOf('(', at)
  for (; i < src.length; i += 1) {
    if (src[i] === '(') params += 1
    else if (src[i] === ')') { params -= 1; if (params === 0) break }
  }
  const start = src.indexOf('{', i)
  let depth = 0
  for (let j = start; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1
    else if (src[j] === '}') { depth -= 1; if (depth === 0) return src.slice(start, j + 1) }
  }
  return null
}

describe('a disputed quiz column can be opened (T-40)', () => {
  it('the panel is given the assessments it needs to make the link', () => {
    // Before, it took only classId and could not know which column was a quiz.
    expect(src).toMatch(/function GradeContestsPanel\(\{\s*classId,\s*assessments/)
  })

  it('links the contest to its quiz through the assessment, not a field on the contest', () => {
    expect(src).toMatch(/assessments\.find\(\(a\) => a\.id === c\.assessment_id\)\?\.source_quiz_id/)
  })

  it('offers the way in on the row', () => {
    expect(src).toContain('Review answers')
  })

  it('opens nothing for a hand-entered column', () => {
    // quizIdOf returns null there, and every affordance is gated on it.
    expect(src).toMatch(/\?\?\s*null/)
    expect(src).toMatch(/\{quizId && /)
  })
})

describe('the attempt query carries what the rules read (T-40)', () => {
  const modal = functionBody('ContestReviewModal')

  it('exists', () => {
    expect(modal, 'no ContestReviewModal found').toBeTruthy()
  })

  it('filters by class_id as well as quiz_id', () => {
    // A quiz_id-only query is refused for the owning teacher too. This is a
    // 403 in the browser and invisible everywhere else.
    expect(modal).toMatch(/where\(\s*'quiz_id'\s*,\s*'=='/)
    expect(modal).toMatch(/where\(\s*'class_id'\s*,\s*'=='/)
  })

  it('counts finished attempts, not one still in progress', () => {
    expect(modal).toMatch(/finishedAttempts/)
  })

  it('says so in plain words when there is nothing to show', () => {
    // No finished attempt, or the quiz deleted. No vendor names, no raw errors.
    expect(modal).not.toMatch(/Firebase|Firestore|Failed to fetch/)
    expect(modal).toMatch(/attempt|quiz/i)
  })
})

describe('the teacher ruling on a dispute sees everything (T-40)', () => {
  it('does not hide the breakdown behind the student-facing release setting', () => {
    // feedbackVisibility decides when a *student* may see their own breakdown.
    // Consulting it here would hide the evidence from the person judging it.
    expect(functionBody('ContestReviewModal')).not.toMatch(/feedbackVisibility/)
  })
})
