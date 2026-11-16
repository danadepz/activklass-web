import { describe, expect, it } from 'vitest'
import { remediationEvidenceSummary } from './remediationEvidence.js'

describe('remediation evidence explanation', () => {
  it('reports observed topic scores and qualifies the signal without claiming prerequisite failure', () => {
    const text = remediationEvidenceSummary({ evidenceByStudent: { s1: 60, s2: 82 } }, ['s1', 's2'])
    expect(text).toContain('1 of 2 selected students')
    expect(text).toContain('(60%, 82%)')
    expect(text).toContain('not a diagnosis of prerequisite knowledge')
  })

  it('states when selected students have no measured evidence', () => {
    expect(remediationEvidenceSummary({ evidenceByStudent: {} }, ['s1']))
      .toContain('no measured performance basis yet')
  })
})
