/**
 * Client-side objective auto-grading for the student Quiz Player.
 *
 * Mirrors the teacher quiz builder's question shapes (see
 * routes/teacher/.../quizzes.$quizId.jsx → toPayload):
 *   mcq:          options: [{ id, text, is_correct }]      answer = option id
 *   true_false:   answer_key: { value: bool }              answer = bool
 *   short_answer: answer_key: { answers: [str] }           answer = string
 *   matching:     answer_key: { pairs: [{ left, right }] } answer = { [pairIndex]: right }
 *   essay:        rubric: string                           answer = string (teacher-graded)
 *
 * Grades are deterministic and never decided by an LLM (essays are queued for
 * the teacher). Note: answer keys are readable by clients today — hardening that
 * split is a known follow-up (see firestore.rules quizzes comment).
 */

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Grade one objective question → { earned, correct }. Essays handled by caller. */
export function gradeAnswer(q, answer) {
  const points = Number(q.points) || 0
  switch (q.qtype) {
    case 'mcq': {
      const correctOpt = (q.options ?? []).find((o) => o.is_correct)
      const correct = answer != null && correctOpt != null && answer === correctOpt.id
      return { earned: correct ? points : 0, correct }
    }
    case 'true_false': {
      const correct = typeof answer === 'boolean' && answer === q.answer_key?.value
      return { earned: correct ? points : 0, correct }
    }
    case 'short_answer': {
      const accepted = (q.answer_key?.answers ?? []).map((a) => a.trim().toLowerCase())
      const correct = typeof answer === 'string' && accepted.includes(answer.trim().toLowerCase())
      return { earned: correct ? points : 0, correct }
    }
    case 'matching': {
      const pairs = q.answer_key?.pairs ?? []
      if (pairs.length === 0) return { earned: 0, correct: false }
      let hit = 0
      pairs.forEach((p, i) => {
        if ((answer?.[i] ?? '') === p.right) hit += 1
      })
      return { earned: round2((points * hit) / pairs.length), correct: hit === pairs.length }
    }
    default:
      return { earned: 0, correct: false }
  }
}

/**
 * Grade a whole quiz against an answers map { [questionId]: answer }.
 * Returns score totals plus a per-question breakdown for the feedback page.
 */
export function gradeQuiz(quiz, answers) {
  let total_score = 0
  let total_possible = 0
  let has_essays = false
  const per_question = (quiz.questions ?? []).map((q) => {
    const possible = Number(q.points) || 0
    total_possible += possible
    if (q.qtype === 'essay') {
      has_essays = true
      return { id: q.id, qtype: 'essay', earned: 0, possible, correct: null, pending: true }
    }
    const { earned, correct } = gradeAnswer(q, answers[q.id])
    total_score += earned
    return { id: q.id, qtype: q.qtype, earned, possible, correct, pending: false }
  })
  return {
    total_score: round2(total_score),
    total_possible,
    score_ratio: total_possible ? round2(total_score / total_possible) : 0,
    has_essays,
    per_question,
  }
}

/** Human-readable correct answer for the feedback breakdown. */
export function correctAnswerText(q) {
  switch (q.qtype) {
    case 'mcq':
      return (q.options ?? []).find((o) => o.is_correct)?.text ?? '—'
    case 'true_false':
      return q.answer_key?.value ? 'True' : 'False'
    case 'short_answer':
      return (q.answer_key?.answers ?? []).join('  /  ') || '—'
    case 'matching':
      return (q.answer_key?.pairs ?? []).map((p) => `${p.left} → ${p.right}`).join('; ')
    case 'essay':
      return q.rubric ? `Rubric: ${q.rubric}` : 'Graded by your teacher'
    default:
      return '—'
  }
}

/** Human-readable version of the student's submitted answer. */
export function studentAnswerText(q, answer) {
  switch (q.qtype) {
    case 'mcq':
      return (q.options ?? []).find((o) => o.id === answer)?.text ?? '— (no answer)'
    case 'true_false':
      return typeof answer === 'boolean' ? (answer ? 'True' : 'False') : '— (no answer)'
    case 'short_answer':
      return answer?.trim() ? answer : '— (no answer)'
    case 'matching':
      return (q.answer_key?.pairs ?? [])
        .map((p, i) => `${p.left} → ${answer?.[i] || '?'}`)
        .join('; ')
    case 'essay':
      return answer?.trim() ? answer : '— (no answer)'
    default:
      return '— (no answer)'
  }
}

/** Right-hand options for a matching question (deduped). */
export function matchingChoices(q) {
  return [...new Set((q.answer_key?.pairs ?? []).map((p) => p.right))]
}
