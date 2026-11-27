import { bestAttempt } from '@/lib/quizToRecord'

export const BLOOM_KEYS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']

const emptyBucket = () => ({
  questionCount: 0,
  earnedPoints: 0,
  maximumPoints: 0,
  pendingCount: 0,
  pendingPoints: 0,
})

const finiteNumber = (value) => value != null && Number.isFinite(Number(value))

/**
 * Aggregate the best finished attempt for each student and class quiz.
 * Bloom labels come only from the attempt's immutable question_metadata
 * snapshot; current quiz questions are deliberately not consulted.
 */
export function aggregateBloomPerformance({ quizzes = [], attemptsByQuiz = {} } = {}) {
  const levels = Object.fromEntries(BLOOM_KEYS.map((key) => [key, emptyBucket()]))
  const unknown = {
    ...emptyBucket(),
    attemptsWithoutMetadata: 0,
    unitemizedAttempts: 0,
    unitemizedQuestions: 0,
  }
  const pending = { questionCount: 0, maximumPoints: 0 }
  let selectedAttemptCount = 0

  for (const quiz of quizzes) {
    const byStudent = new Map()
    for (const [index, attempt] of (attemptsByQuiz[quiz.id] ?? []).entries()) {
      if (attempt?.student_id == null) continue
      const group = byStudent.get(attempt.student_id) ?? []
      group.push({ ...attempt, _analysisOrder: index })
      byStudent.set(attempt.student_id, group)
    }

    for (const attempts of byStudent.values()) {
      const selected = bestAttempt(attempts)
      if (!selected) continue
      selectedAttemptCount += 1

      const snapshot = Array.isArray(selected.question_metadata) ? selected.question_metadata : []
      const metadataById = new Map(snapshot
        .filter((item) => item?.question_id != null)
        .map((item) => [String(item.question_id), item]))
      const hasMetadata = metadataById.size > 0
      if (!hasMetadata) unknown.attemptsWithoutMetadata += 1

      const results = Array.isArray(selected.per_question) ? selected.per_question : null
      if (!results) {
        unknown.unitemizedAttempts += 1
        unknown.unitemizedQuestions += Array.isArray(selected.question_ids) ? selected.question_ids.length : 0
        continue
      }

      for (const result of results) {
        const questionId = result?.id ?? result?.question_id
        const metadata = questionId == null ? null : metadataById.get(String(questionId))
        const key = BLOOM_KEYS.includes(metadata?.blooms_level) ? metadata.blooms_level : 'unknown'
        const bucket = key === 'unknown' ? unknown : levels[key]
        const possible = finiteNumber(result?.possible) ? Number(result.possible) : null
        const earned = finiteNumber(result?.earned) ? Number(result.earned) : null
        const isPending = result?.pending === true || result?.graded === false || earned == null

        if (isPending) {
          bucket.pendingCount += 1
          if (possible != null && possible > 0) bucket.pendingPoints += possible
          pending.questionCount += 1
          if (possible != null && possible > 0) pending.maximumPoints += possible
          continue
        }
        if (possible == null || possible <= 0) continue

        bucket.questionCount += 1
        bucket.earnedPoints += earned
        bucket.maximumPoints += possible
      }
    }
  }

  for (const bucket of [...Object.values(levels), unknown]) {
    bucket.earnedPoints = round2(bucket.earnedPoints)
    bucket.maximumPoints = round2(bucket.maximumPoints)
    bucket.pendingPoints = round2(bucket.pendingPoints)
    bucket.percentage = bucket.maximumPoints > 0
      ? round2((bucket.earnedPoints / bucket.maximumPoints) * 100)
      : null
  }

  return {
    levels,
    unknown,
    pending: { ...pending, maximumPoints: round2(pending.maximumPoints) },
    selectedAttemptCount,
  }
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
