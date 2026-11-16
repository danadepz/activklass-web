const PASS = 75

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
