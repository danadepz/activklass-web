/**
 * Turning a passed remediation quiz back into a passing mark.
 *
 * Pure -- the writes live in features/classes/remediation.js -- because this
 * is the module that decides whether a learner passes, and that decision has
 * to be readable, arguable and testable on its own.
 *
 * The loop it closes: a low score raises a topic on the scaffolds page, the
 * teacher publishes a remediation plan with an AI practice quiz, the student
 * takes it -- and then nothing happened. The original failing mark stood, so
 * the remediation demonstrated competency that the record never recognised.
 *
 * Why not simply add the practice quiz as another assessment row: it would
 * dilute the component weight rather than repair the mark it was prescribed
 * for, and a 40 followed by a 90 in the same component still averages to a
 * fail. Recovery has to act on the original score.
 */

/** Passing mark. The DepEd cut-off the rest of the app already uses. */
export const PASSING = 75

export const CAPPED_REPLACE = 'capped_replace'
export const AVERAGE = 'average'
export const RECOVERY_POINTS = 'recovery_points'

/**
 * The three defensible ways to convert a remediation result into a mark.
 *
 * `capped_replace` is the default because it is the one that matches remedial
 * practice: passing the re-teach earns the passing mark, not an A. The other
 * two exist because a school may already have its own rule, and a policy that
 * cannot be changed gets worked around by typing over the scores.
 */
export const RECOVERY_POLICIES = [
  {
    id: CAPPED_REPLACE,
    label: 'Replace, capped',
    describe: (cap) => `The remediation score replaces the original, up to ${cap}%.`,
  },
  {
    id: AVERAGE,
    label: 'Average the two',
    describe: (cap) => `The mean of the original and the remediation, up to ${cap}%.`,
  },
  {
    id: RECOVERY_POINTS,
    label: 'Recovery points',
    describe: (cap) => `Closes part of the gap to ${cap}%, in proportion to the remediation score.`,
  },
]

const round2 = (n) => Math.round(n * 100) / 100

/**
 * The percentage a policy awards, before the never-lower rule.
 *
 * `cap` bounds every policy, including `average`: a 70 averaged with a 100 is
 * 85, and a remediation that lifts a learner above the passing mark is the
 * outcome no panel will accept.
 */
function policyPercent({ policy, cap, originalPct, remediationPct }) {
  switch (policy) {
    case AVERAGE:
      return Math.min((originalPct + remediationPct) / 2, cap)
    case RECOVERY_POINTS:
      // Proportional credit for the gap: a perfect remediation reaches the cap,
      // a bare pass on it moves most of the way, a poor one barely moves.
      return Math.min(originalPct + (remediationPct / 100) * Math.max(cap - originalPct, 0), cap)
    case CAPPED_REPLACE:
    default:
      return Math.min(remediationPct, cap)
  }
}

/**
 * One student's recovered mark, or a reason there isn't one.
 *
 * A recovery can only ever raise a score. If the policy computes something
 * lower -- a learner who scored 70 and then 40 on the remediation -- the
 * original stands and `improved` is false. Punishing a student for attempting
 * the re-teach would make remediation something to avoid.
 */
export function computeRecovery({
  policy = CAPPED_REPLACE,
  cap = PASSING,
  originalRaw,
  totalPoints,
  remediationPct,
}) {
  if (!Number.isFinite(totalPoints) || totalPoints <= 0) return null
  if (!Number.isFinite(remediationPct)) return null

  // No original score means nothing to repair. Writing the recovery mark into
  // an empty cell would invent an assessment the student never sat.
  if (!Number.isFinite(originalRaw)) return null

  const originalPct = (originalRaw / totalPoints) * 100
  const awardedPct = policyPercent({ policy, cap, originalPct, remediationPct })
  const appliedPct = Math.max(originalPct, awardedPct)
  const appliedRaw = round2((appliedPct / 100) * totalPoints)

  return {
    original_score: round2(originalRaw),
    original_pct: round2(originalPct),
    applied_score: appliedRaw,
    applied_pct: round2(appliedPct),
    remediation_pct: round2(remediationPct),
    policy,
    cap,
    improved: appliedRaw > round2(originalRaw),
  }
}

/**
 * Work out the recovery for every targeted student in one pass.
 *
 * `remediationPctByStudent` is the student's best percentage on the practice
 * quiz; the caller derives it the same way the record sync does, from the best
 * finished attempt.
 *
 * Students are bucketed rather than silently dropped. Each bucket is a
 * different conversation with the teacher: "has not taken it yet" is a nudge,
 * "no original score" means the record has a hole to fill first, and "no
 * improvement" is the honest answer that the remediation did not demonstrate
 * competency.
 */
export function planRecovery({
  targetStudentIds = [],
  scores = {},
  totalPoints,
  remediationPctByStudent = {},
  policy = CAPPED_REPLACE,
  cap = PASSING,
}) {
  const recoveries = {}
  const notAttempted = []
  const noOriginal = []
  const noImprovement = []

  for (const studentId of targetStudentIds) {
    const remediationPct = remediationPctByStudent[studentId]
    if (!Number.isFinite(remediationPct)) {
      notAttempted.push(studentId)
      continue
    }
    const cell = scores[studentId]
    const originalRaw = cell?.status === 'graded' ? Number(cell.raw_score) : NaN
    const result = computeRecovery({ policy, cap, originalRaw, totalPoints, remediationPct })
    if (!result) {
      noOriginal.push(studentId)
      continue
    }
    if (!result.improved) {
      noImprovement.push(studentId)
      continue
    }
    recoveries[studentId] = result
  }

  return { recoveries, notAttempted, noOriginal, noImprovement }
}

/** One sentence for the toast after applying. */
export function describeRecoveryResult({ applied = 0, notAttempted = 0, noOriginal = 0, noImprovement = 0 } = {}) {
  const parts = [`${applied} mark${applied === 1 ? '' : 's'} recovered`]
  if (noImprovement) parts.push(`${noImprovement} did not improve on their original`)
  if (notAttempted) parts.push(`${notAttempted} have not taken the practice quiz`)
  if (noOriginal) parts.push(`${noOriginal} have no original score on this assessment`)
  return `${parts.join(' · ')}.`
}
