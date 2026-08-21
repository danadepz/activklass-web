/**
 * Unit tests for the grade-recovery policies in ./remediationRecovery.js.
 *
 * This module decides whether a learner passes, so every number below is one a
 * panel could ask about. The cap and the never-lower rule are the two the
 * whole design rests on: without the cap, remediation becomes a route to a
 * higher grade than sitting the assessment; without never-lower, attempting
 * the re-teach can cost a student marks.
 */
import { describe, expect, it } from 'vitest'
import {
  AVERAGE,
  CAPPED_REPLACE,
  PASSING,
  RECOVERY_POINTS,
  computeRecovery,
  describeRecoveryResult,
  planRecovery,
} from './remediationRecovery.js'

const graded = (raw) => ({ status: 'graded', raw_score: raw })

describe('computeRecovery · capped replace', () => {
  it('lifts a failing mark to the passing cap when the remediation is strong', () => {
    const result = computeRecovery({ originalRaw: 40, totalPoints: 100, remediationPct: 92 })
    expect(result.applied_pct).toBe(PASSING)
    expect(result.applied_score).toBe(75)
    expect(result.improved).toBe(true)
  })

  it('never lifts a learner past the cap, however well they remediate', () => {
    const result = computeRecovery({ originalRaw: 30, totalPoints: 100, remediationPct: 100 })
    expect(result.applied_pct).toBe(PASSING)
  })

  it('awards below the cap when the remediation was itself weak', () => {
    const result = computeRecovery({ originalRaw: 40, totalPoints: 100, remediationPct: 60 })
    expect(result.applied_pct).toBe(60)
    expect(result.improved).toBe(true)
  })

  it('leaves the original alone when the remediation went worse', () => {
    const result = computeRecovery({ originalRaw: 70, totalPoints: 100, remediationPct: 40 })
    expect(result.applied_score).toBe(70)
    expect(result.improved).toBe(false)
  })

  it('scales to the assessment total, not to 100', () => {
    const result = computeRecovery({ originalRaw: 8, totalPoints: 20, remediationPct: 90 })
    expect(result.applied_score).toBe(15) // 75% of 20
    expect(result.original_pct).toBe(40)
  })

  it('keeps the original score on the record for audit', () => {
    const result = computeRecovery({ originalRaw: 8, totalPoints: 20, remediationPct: 90 })
    expect(result.original_score).toBe(8)
    expect(result.remediation_pct).toBe(90)
    expect(result.policy).toBe(CAPPED_REPLACE)
    expect(result.cap).toBe(PASSING)
  })
})

describe('computeRecovery · other policies', () => {
  it('averages the original and the remediation', () => {
    const result = computeRecovery({ policy: AVERAGE, originalRaw: 50, totalPoints: 100, remediationPct: 90 })
    expect(result.applied_pct).toBe(70)
  })

  it('caps the average too, so two high scores cannot exceed the ceiling', () => {
    const result = computeRecovery({ policy: AVERAGE, originalRaw: 70, totalPoints: 100, remediationPct: 100 })
    expect(result.applied_pct).toBe(PASSING)
  })

  it('closes the gap in proportion under recovery points', () => {
    // 40 + 50% of the 35-point gap to 75.
    const result = computeRecovery({ policy: RECOVERY_POINTS, originalRaw: 40, totalPoints: 100, remediationPct: 50 })
    expect(result.applied_pct).toBe(57.5)
  })

  it('reaches exactly the cap on a perfect remediation', () => {
    const result = computeRecovery({ policy: RECOVERY_POINTS, originalRaw: 40, totalPoints: 100, remediationPct: 100 })
    expect(result.applied_pct).toBe(PASSING)
  })

  it('does not move a learner already above the cap', () => {
    const result = computeRecovery({ policy: RECOVERY_POINTS, originalRaw: 80, totalPoints: 100, remediationPct: 100 })
    expect(result.applied_score).toBe(80)
    expect(result.improved).toBe(false)
  })
})

describe('computeRecovery · refusals', () => {
  it('refuses when there is no original score to repair', () => {
    expect(computeRecovery({ originalRaw: NaN, totalPoints: 100, remediationPct: 90 })).toBeNull()
  })

  it('refuses when the remediation has no result', () => {
    expect(computeRecovery({ originalRaw: 40, totalPoints: 100, remediationPct: NaN })).toBeNull()
  })

  it('refuses an assessment worth no points', () => {
    expect(computeRecovery({ originalRaw: 0, totalPoints: 0, remediationPct: 90 })).toBeNull()
  })

  it('honours a school cap other than 75', () => {
    const result = computeRecovery({ originalRaw: 40, totalPoints: 100, remediationPct: 95, cap: 80 })
    expect(result.applied_pct).toBe(80)
  })
})

describe('planRecovery', () => {
  const scores = { s1: graded(40), s2: graded(70), s4: graded(50) }
  const base = {
    targetStudentIds: ['s1', 's2', 's3', 's4', 's5'],
    scores,
    totalPoints: 100,
    remediationPctByStudent: { s1: 90, s2: 30, s4: 88 },
  }

  it('recovers only the students the remediation actually helped', () => {
    const result = planRecovery(base)
    expect(Object.keys(result.recoveries).sort()).toEqual(['s1', 's4'])
    expect(result.recoveries.s1.applied_score).toBe(75)
  })

  it('separates every reason a student got no recovery', () => {
    const result = planRecovery(base)
    expect(result.noImprovement).toEqual(['s2'])   // took it, did worse
    expect(result.notAttempted).toEqual(['s3', 's5']) // never took it
    expect(result.noOriginal).toEqual([])
  })

  it('reports a student who has a remediation result but no original mark', () => {
    const result = planRecovery({
      ...base,
      targetStudentIds: ['s9'],
      remediationPctByStudent: { s9: 90 },
    })
    expect(result.noOriginal).toEqual(['s9'])
    expect(result.recoveries).toEqual({})
  })

  it('ignores an excused or otherwise ungraded original cell', () => {
    const result = planRecovery({
      ...base,
      targetStudentIds: ['s7'],
      scores: { s7: { status: 'excused' } },
      remediationPctByStudent: { s7: 90 },
    })
    expect(result.noOriginal).toEqual(['s7'])
  })
})

describe('describeRecoveryResult', () => {
  it('accounts for everyone the teacher targeted', () => {
    expect(describeRecoveryResult({ applied: 2, noImprovement: 1, notAttempted: 2, noOriginal: 1 }))
      .toBe('2 marks recovered · 1 did not improve on their original · 2 have not taken the practice quiz · 1 have no original score on this assessment.')
  })

  it('reads plainly when everything worked', () => {
    expect(describeRecoveryResult({ applied: 1 })).toBe('1 mark recovered.')
  })
})
