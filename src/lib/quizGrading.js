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

/**
 * Grade one objective question → { earned, correct }. Essays handled by caller.
 *
 * Every comparison coerces to string first. Answer keys reach us from the
 * builder, the AI draft path and the API, and a single non-string entry (a
 * number in answers[], say) used to throw `a.trim is not a function` mid-grade
 * -- which loses the student's whole submission, not just that question.
 */
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
      const accepted = (q.answer_key?.answers ?? [])
        .map((a) => String(a ?? '').trim().toLowerCase())
        .filter(Boolean)
      const given = String(answer ?? '').trim().toLowerCase()
      const correct = given !== '' && accepted.includes(given)
      return { earned: correct ? points : 0, correct }
    }
    case 'matching': {
      const pairs = q.answer_key?.pairs ?? []
      if (pairs.length === 0) return { earned: 0, correct: false }
      let hit = 0
      pairs.forEach((p, i) => {
        if (String(answer?.[i] ?? '') === String(p.right ?? '')) hit += 1
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
  const submitted = answers ?? {}
  const per_question = (quiz.questions ?? []).map((q) => {
    const possible = Number(q.points) || 0
    total_possible += possible
    if (q.qtype === 'essay') {
      has_essays = true
      return { id: q.id, qtype: 'essay', earned: 0, possible, correct: null, pending: true }
    }
    const { earned, correct } = gradeAnswer(q, submitted[q.id])
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
      return String(answer ?? '').trim() ? String(answer) : '— (no answer)'
    case 'matching':
      return (q.answer_key?.pairs ?? [])
        .map((p, i) => `${p.left} → ${answer?.[i] || '?'}`)
        .join('; ')
    case 'essay':
      return String(answer ?? '').trim() ? String(answer) : '— (no answer)'
    default:
      return '— (no answer)'
  }
}

/** Right-hand options for a matching question (deduped). */
export function matchingChoices(q) {
  return [...new Set((q.answer_key?.pairs ?? []).map((p) => p.right))]
}

/**
 * Apply a teacher's essay scores onto an attempt's existing `per_question`
 * breakdown and recompute the totals that depend on it.
 *
 * `marks` is `{ [questionId]: { earned, feedback? } }` for the essay
 * questions being marked right now -- not necessarily all of them, so
 * marking one essay on a two-essay quiz saves that one and leaves the other
 * `pending`. `has_essays_pending` (and with it the `submitted` status
 * `quizToRecord` treats as unscorable, see `quizScoreCells`) clears only
 * once every essay question in `perQuestion` has been marked.
 *
 * A non-essay or already-marked row is returned unchanged, so this is safe
 * to call with the attempt's full `per_question` array every time.
 */
export function applyEssayMarks(perQuestion = [], marks = {}) {
  const per_question = perQuestion.map((pq) => {
    if (pq.qtype !== 'essay' || !pq.pending) return pq
    const mark = marks[pq.id]
    if (!mark) return pq
    const possible = Number(pq.possible) || 0
    const earned = Math.min(possible, Math.max(0, round2(Number(mark.earned) || 0)))
    return { ...pq, earned, pending: false, feedback: mark.feedback?.trim() || null }
  })
  const total_score = round2(per_question.reduce((sum, pq) => sum + (Number(pq.earned) || 0), 0))
  const total_possible = per_question.reduce((sum, pq) => sum + (Number(pq.possible) || 0), 0)
  const has_essays_pending = per_question.some((pq) => pq.qtype === 'essay' && pq.pending)
  return {
    per_question,
    total_score,
    total_possible,
    score_ratio: total_possible ? round2(total_score / total_possible) : 0,
    has_essays_pending,
    // 'submitted' is the status quizToRecord's skip treats as unscorable
    // (see quizScoreCells) -- so a fully-marked attempt must read 'graded',
    // the same status an all-objective attempt gets at submit time.
    status: has_essays_pending ? 'submitted' : 'graded',
  }
}
