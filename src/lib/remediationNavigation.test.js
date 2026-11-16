import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { remediationReturnPath } from './remediationNavigation.js'

const editor = readFileSync(new URL('../routes/teacher/quizzes.$quizId.jsx', import.meta.url), 'utf8')
const scaffolds = readFileSync(new URL('../routes/teacher/classes/$classId/scaffolds.jsx', import.meta.url), 'utf8')

describe('remediation quiz return target', () => {
  it('returns to the original class and reopens the original plan', () => {
    expect(remediationReturnPath({ classId: 'class-9', planId: 'plan_2' }))
      .toBe('/teacher/classes/class-9/scaffolds?editPlan=plan_2')
  })

  it('rejects malformed route identifiers', () => {
    expect(remediationReturnPath({ classId: '../admin', planId: 'plan-2' })).toBeNull()
    expect(remediationReturnPath({ classId: 'class-9', planId: '' })).toBeNull()
  })

  it('returns only after publish succeeds, offers Stay on Quiz, and restores the selected plan', () => {
    expect(editor).toContain('if (remediationPath) setReturnNotice(true)')
    expect(editor).toContain('window.setTimeout(() => navigate(remediationPath, { replace: true }), 3000)')
    expect(editor).toContain('Stay on Quiz')
    expect(scaffolds).toContain('navigate(`/teacher/quizzes/${quizId}`')
    expect(scaffolds).toContain("state: { remediationReturn: { classId, planId: activeEditingPlan.id } }")
    expect(scaffolds).toContain("searchParams.get('editPlan')")
    expect(scaffolds).toContain('const activeEditingPlan = editingPlan ?? restoredPlan')
  })
})
