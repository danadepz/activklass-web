import { bestAttempt } from '@/lib/quizToRecord'
import { automaticBloomAllocation, BLOOMS_ORDER } from '@/lib/bloomsAllocation'

const PASS = 75
const BLOOM_KEYS = new Set(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'])
const finite = (value) => value != null && Number.isFinite(Number(value))
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100

/** Explain the existing topic-score signal without inferring prerequisites. */
export function remediationEvidenceSummary(row, targetStudentIds = []) {
  const results = targetStudentIds
    .map((id) => row?.evidenceByStudent?.[id])
    .filter((score) => Number.isFinite(score))
  if (!results.length) {
    return 'No recorded quiz or assessment scores are available for the selected students on this topic, so this plan has no measured performance basis yet.'
  }
  const below = results.filter((score) => score < PASS).length
  const scores = results.map((score) => `${Math.round(score)}%`).join(', ')
  return `Observed evidence: ${below} of ${results.length} selected students have a best recorded score below ${PASS}% on tracked quizzes or assessments linked to this topic (${scores}). This is a review signal based on recorded results, not a diagnosis of prerequisite knowledge.`
}

/**
 * Build per-student topic evidence from each student's best finished attempt
 * on each quiz linked to this topic. Bloom/topic/objective values come from
 * the attempt snapshot only. Legacy questions may still contribute topic
 * scores, but never receive inferred cognitive labels.
 */
export function targetedRemediationEvidence({
  topicId,
  topicLabel,
  targetStudentIds = [],
  nameById = {},
  quizzes = [],
  attemptsByQuiz = {},
} = {}) {
  const students = targetStudentIds.map((studentId) => {
    const scored = { earned: 0, maximum: 0, count: 0 }
    const pending = { count: 0, maximum: 0 }
    const items = []
    let unitemizedAttempts = 0

    for (const quiz of quizzes) {
      if (['guided_practice', 'independent_practice', 'reassessment'].includes(quiz?.remediation_stage)) continue
      const selected = bestForStudent(attemptsByQuiz[quiz.id] ?? [], studentId)
      if (!selected) continue
      const snapshot = Array.isArray(selected.question_metadata) ? selected.question_metadata : []
      const metadataById = new Map(snapshot
        .filter((item) => item?.question_id != null)
        .map((item) => [String(item.question_id), item]))
      const questionIds = Array.isArray(selected.question_ids) ? selected.question_ids : []
      const results = Array.isArray(selected.per_question) ? selected.per_question : null

      if (!results) {
        if (quiz.topic_id === topicId && selected.status === 'graded' && finite(selected.total_score) && finite(selected.total_possible) && Number(selected.total_possible) > 0) {
          scored.earned += Number(selected.total_score)
          scored.maximum += Number(selected.total_possible)
          scored.count += questionIds.length
        } else {
          unitemizedAttempts += 1
        }
        continue
      }

      for (const [index, result] of results.entries()) {
        const questionId = result?.id ?? result?.question_id
        const metadata = questionId == null ? null : metadataById.get(String(questionId))
        // Any historical question snapshot is authoritative, including an
        // explicitly missing topic. Only legacy results without a snapshot
        // may fall back to the existing quiz-level topic link.
        if (metadata ? metadata.topic_id !== topicId : quiz.topic_id !== topicId) continue

        const possible = finite(result?.possible) ? Number(result.possible) : null
        const earned = finite(result?.earned) ? Number(result.earned) : null
        const isPending = result?.pending === true || result?.graded === false || earned == null
        if (isPending) {
          pending.count += 1
          if (possible != null && possible > 0) pending.maximum += possible
          continue
        }
        if (possible == null || possible <= 0) continue

        scored.earned += earned
        scored.maximum += possible
        scored.count += 1
        if (earned >= possible) continue

        const questionIndex = index
        const bloom = BLOOM_KEYS.has(metadata?.blooms_level) ? metadata.blooms_level : null
        items.push({
          quizTitle: quiz.title ?? 'Assessment',
          questionLabel: `Question ${questionIds.indexOf(questionId) >= 0 ? questionIds.indexOf(questionId) + 1 : questionIndex + 1}`,
          topicId: metadata?.topic_id ?? null,
          topicLabel: typeof metadata?.topic_label === 'string' && metadata.topic_label.trim() ? metadata.topic_label.trim() : topicLabel,
          objective: typeof metadata?.objective === 'string' && metadata.objective.trim() ? metadata.objective.trim() : null,
          bloomsLevel: bloom,
          earnedPoints: round2(earned),
          maximumPoints: round2(possible),
          outcome: earned <= 0 ? 'incorrect' : 'partial',
        })
      }
    }

    const topicScore = scored.maximum > 0
      ? { earnedPoints: round2(scored.earned), maximumPoints: round2(scored.maximum), percentage: round2((scored.earned / scored.maximum) * 100), questionCount: scored.count }
      : null
    const hasEvidence = items.length > 0 || (topicScore != null && topicScore.percentage < PASS)
    return {
      studentId,
      displayName: nameById[studentId] ?? studentId,
      topicScore,
      items,
      pendingCount: pending.count,
      pendingPoints: round2(pending.maximum),
      unitemizedAttempts,
      hasEvidence,
    }
  })

  const aiEvidence = students.filter((student) => student.hasEvidence).map((student, index) => ({
    student_label: `Learner ${index + 1}`,
    topic_performance_percent: student.topicScore?.percentage ?? null,
    difficulties: student.items.map((item, itemIndex) => ({
      reference: `Result ${itemIndex + 1}`,
      topic: item.topicLabel ?? topicLabel ?? null,
      learning_objective: item.objective,
      blooms_level: item.bloomsLevel,
      outcome: item.outcome,
      earned_points: item.earnedPoints,
      maximum_points: item.maximumPoints,
    })),
  }))

  return {
    topicId,
    topicLabel,
    students,
    aiEvidence,
    hasScoredEvidence: students.some((student) => student.hasEvidence),
    selectedStudentCount: students.length,
    pendingQuestionCount: students.reduce((sum, student) => sum + student.pendingCount, 0),
  }
}

function bestForStudent(attempts, studentId) {
  // Keep evidence separated by learner, then apply the shared best-attempt policy.
  const matching = attempts.filter((attempt) => attempt?.student_id === studentId)
  return bestAttempt(matching)
}

/** Turn anonymized evidence into bounded teacher instructions for generation. */
export function remediationEvidenceInstructions(evidence) {
  const rows = evidence?.aiEvidence ?? []
  if (!rows.length) return ''
  return [
    'Use these anonymized, per-learner learning results to target this topic. Keep learner groups separate while identifying overlapping concepts for shared teaching materials.',
    'Only the listed scored incorrect or partial-credit results are question-level difficulties. A null Bloom level means Unknown: do not infer a cognitive weakness. Pending/ungraded work was excluded. Topic percentages without itemized difficulties support topic-level review only.',
    'Do not include learner names, IDs, question text, student answers, correct answers, answer keys, or claims that these results diagnose mastery.',
    JSON.stringify(rows),
  ].join('\n')
}

/** Structured linked-quiz settings from observed levels; no level is inferred. */
export function remediationPracticeConfig(evidence, count = 10) {
  const observed = BLOOMS_ORDER.filter((level) =>
    (evidence?.aiEvidence ?? []).some((student) =>
      (student.difficulties ?? []).some((item) => item.blooms_level === level),
    ),
  )
  const bloomsLevels = observed.length ? observed : ['apply']
  const types = bloomsLevels.includes('create')
    ? ['essay']
    : bloomsLevels.includes('evaluate')
      ? ['short_answer']
      : ['mcq']
  return {
    bloomsLevels,
    bloomAllocation: automaticBloomAllocation(count, bloomsLevels),
    types,
    usedRecordedBloomLevels: observed.length > 0,
  }
}

export function targetedEvidenceSummary(evidence) {
  const students = evidence?.students ?? []
  if (!students.length) return 'No students are selected.'
  return students.map((student) => {
    const score = student.topicScore
      ? `${student.topicScore.percentage}% (${student.topicScore.earnedPoints}/${student.topicScore.maximumPoints} points)`
      : 'no eligible scored item results'
    const gapCount = student.items.length
    const pending = student.pendingCount ? `; ${student.pendingCount} pending item${student.pendingCount === 1 ? '' : 's'} excluded` : ''
    const unavailable = student.unitemizedAttempts ? `; item detail unavailable for ${student.unitemizedAttempts} attempt${student.unitemizedAttempts === 1 ? '' : 's'}` : ''
    return `${student.displayName}: ${score}; ${gapCount} incorrect or partial-credit item${gapCount === 1 ? '' : 's'} identified${pending}${unavailable}.`
  }).join(' ')
}

/** Format only the fields in the answer-key-free targeted response schema. */
export function scaffoldMaterialsToGuidance(materials) {
  if (!materials || typeof materials !== 'object') return ''
  const lines = []
  const summary = cleanString(materials.concept_summary)
  if (summary) lines.push('## Concept summary', summary)

  const explanations = Array.isArray(materials.targeted_explanations) ? materials.targeted_explanations : []
  if (explanations.length) {
    lines.push('## Explanations for the observed learning gaps')
    explanations.forEach((entry) => {
      const focus = cleanString(entry?.focus)
      const explanation = cleanString(entry?.explanation)
      if (focus || explanation) lines.push(`### ${focus || 'Topic review'}`, explanation)
    })
  }

  const example = materials.step_by_step_example
  if (example && typeof example === 'object') {
    const problem = cleanString(example.problem)
    const steps = Array.isArray(example.steps) ? example.steps.map(cleanString).filter(Boolean) : []
    const answer = cleanString(example.final_answer)
    if (problem || steps.length || answer) {
      lines.push('## Worked example')
      if (problem) lines.push(`**Problem:** ${problem}`)
      steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`))
      if (answer) lines.push(`**Final answer:** ${answer}`)
    }
  }

  const exercises = Array.isArray(materials.practice_exercises) ? materials.practice_exercises : []
  if (exercises.length) {
    lines.push('## Practice exercises')
    exercises.forEach((exercise, index) => {
      const prompt = cleanString(exercise?.prompt)
      const hint = cleanString(exercise?.hint)
      if (prompt || hint) {
        lines.push(`${index + 1}. ${prompt}`)
        if (hint) lines.push(`   Hint: ${hint}`)
      }
    })
  }

  return lines.filter(Boolean).join('\n\n')
}

/** Convert the reviewed Phase 4 generator shape into separate teacher-editable stage text. */
export function scaffoldMaterialsToStageContent(materials) {
  if (!materials || typeof materials !== 'object') return null
  const explanations = Array.isArray(materials.targeted_explanations)
    ? materials.targeted_explanations.map((row) => {
      const focus = cleanString(row?.focus)
      const explanation = cleanString(row?.explanation)
      return [focus && `### ${focus}`, explanation].filter(Boolean).join('\n\n')
    }).filter(Boolean)
    : []
  const summary = cleanString(materials.concept_summary)
  const example = materials.step_by_step_example
  const workedExample = example && typeof example === 'object'
    ? [
      cleanString(example.problem) && `**Problem:** ${cleanString(example.problem)}`,
      ...(Array.isArray(example.steps) ? example.steps.map(cleanString).filter(Boolean).map((step, i) => `${i + 1}. ${step}`) : []),
      cleanString(example.final_answer) && `**Final answer:** ${cleanString(example.final_answer)}`,
    ].filter(Boolean).join('\n\n')
    : ''
  const guided = Array.isArray(materials.practice_exercises)
    ? materials.practice_exercises.map((exercise, index) => {
      const prompt = cleanString(exercise?.prompt)
      const hint = cleanString(exercise?.hint)
      const feedback = cleanString(exercise?.feedback)
      return prompt ? `${index + 1}. ${prompt}${hint ? `\n   Hint: ${hint}` : ''}${feedback ? `\n   Feedback: ${feedback}` : ''}` : ''
    }).filter(Boolean).join('\n\n')
    : ''
  const independent = Array.isArray(materials.independent_practice)
    ? materials.independent_practice.map((exercise, index) => {
      const prompt = cleanString(typeof exercise === 'string' ? exercise : exercise?.prompt)
      return prompt ? `${index + 1}. ${prompt}` : ''
    }).filter(Boolean).join('\n\n')
    : ''
  return {
    concept_review: [summary, ...explanations].filter(Boolean).join('\n\n'),
    worked_example: workedExample,
    guided_practice: guided,
    independent_practice: independent,
  }
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}
