/**
 * T-243 (andecobs-323, Derickk): Grade Configuration never explains how a final grade is computed.
 *
 * Derick asked for a short explanation near the Grading Type or Preview, in plain words with
 * one worked example, changing as the grading type changes.
 *
 * What is pinned here:
 * 1. explainGradeComputation generates plain-words formulas and worked examples driven
 *    off the entered component weights and mode.
 * 2. Arithmetic matches computeFinalGrade exactly (no separate drifted math).
 * 3. DepEd explains initial grade and transmuted grade per DO 015 s. 2026.
 * 4. CHED raw percentage explains that weighted percent is the final grade.
 * 5. CHED point scale explicitly describes the final step as a point-scale band lookup
 *    (not a percentage calculation), supporting standard and inverted directions.
 * 6. GradingComputationExplanation component renders in the UI and updates with the mode.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { computeFinalGrade, gradePolicy, pointScaleBands } from '@/lib/grading'
import { explainGradeComputation } from './gradePreview.js'
import { GradingComputationExplanation } from './grading.jsx'

const depedComponents = [
  { id: 'c1', name: 'Written Works', weight_percent: '30' },
  { id: 'c2', name: 'Performance Tasks', weight_percent: '50' },
  { id: 'c3', name: 'Quarterly Assessment', weight_percent: '20' },
]

const collegeComponents = [
  { id: 'c1', name: 'Class Standing', weight_percent: '60' },
  { id: 'c2', name: 'Major Exam', weight_percent: '40' },
]

describe('T-243 — explainGradeComputation arithmetic and wording', () => {
  it('pins DepEd K-12 explanation against computeFinalGrade', () => {
    expect(typeof explainGradeComputation).toBe('function')
    if (typeof explainGradeComputation !== 'function') return

    const res = explainGradeComputation(depedComponents, 'deped_k12')
    expect(res.hasComponents).toBe(true)
    expect(res.formula).toContain('Written Works × 30%')
    expect(res.formula).toContain('Performance Tasks × 50%')
    expect(res.formula).toContain('Quarterly Assessment × 20%')

    // Verify sample calculation matches computeFinalGrade
    const sampleScores = {
      a0: { status: 'graded', raw_score: 85 },
      a1: { status: 'graded', raw_score: 80 },
      a2: { status: 'graded', raw_score: 90 },
    }
    const direct = computeFinalGrade(
      [
        { id: 'c0', weight_percent: 30, assessments: [{ id: 'a0', total_points: 100 }] },
        { id: 'c1', weight_percent: 50, assessments: [{ id: 'a1', total_points: 100 }] },
        { id: 'c2', weight_percent: 20, assessments: [{ id: 'a2', total_points: 100 }] },
      ],
      sampleScores,
      'deped_k12',
    )
    expect(res.initial).toBe(direct.initial)
    expect(res.final).toBe(direct.final)
    expect(res.descriptor).toBe(direct.descriptor)
    expect(res.example).toContain(`${direct.initial}`)
    expect(res.finalStep).toContain(`Transmuted per DepEd Order No. 015, s. 2026`)
    expect(res.finalStep).toContain(`${direct.final}`)
    expect(res.finalStep).toContain(direct.descriptor)
  })

  it('pins CHED raw percentage explanation against computeFinalGrade', () => {
    expect(typeof explainGradeComputation).toBe('function')
    if (typeof explainGradeComputation !== 'function') return

    const policy = gradePolicy({ passing_percent: 60 })
    const res = explainGradeComputation(collegeComponents, 'ched_percentage', policy)
    expect(res.hasComponents).toBe(true)
    expect(res.formula).toBe('Period grade = Class Standing × 60% + Major Exam × 40%')

    const direct = computeFinalGrade(
      [
        { id: 'c0', weight_percent: 60, assessments: [{ id: 'a0', total_points: 100 }] },
        { id: 'c1', weight_percent: 40, assessments: [{ id: 'a1', total_points: 100 }] },
      ],
      {
        a0: { status: 'graded', raw_score: 85 },
        a1: { status: 'graded', raw_score: 80 },
      },
      'ched_percentage',
      policy,
    )
    expect(res.initial).toBe(direct.initial)
    expect(res.final).toBe(direct.final)
    expect(res.finalStep).toContain('Under CHED Raw Percentage, the weighted percent is the period grade')
    expect(res.finalStep).toContain(`${direct.final}%`)
    expect(res.finalStep).toContain('passes at 60% or higher')
  })

  it('pins CHED point scale as a band lookup (not a percentage calculation)', () => {
    expect(typeof explainGradeComputation).toBe('function')
    if (typeof explainGradeComputation !== 'function') return

    const policyStandard = gradePolicy({ point_scale_direction: 'standard', passing_percent: 75 })
    const resStandard = explainGradeComputation(collegeComponents, 'ched_point', policyStandard)
    expect(resStandard.finalStep).toContain('Point-scale table lookup')
    expect(resStandard.finalStep).toContain('band')
    expect(resStandard.finalStep).toContain('1.0 is highest, 3.00 passes')
    expect(resStandard.finalStep).not.toContain('weighted percent is the period grade')

    const policyInverted = gradePolicy({ point_scale_direction: 'inverted', passing_percent: 75 })
    const resInverted = explainGradeComputation(collegeComponents, 'ched_point', policyInverted)
    expect(resInverted.finalStep).toContain('Point-scale table lookup')
    expect(resInverted.finalStep).toContain('5.0 is highest, 3.00 passes')
  })

  it('dynamically updates formula when component weights change', () => {
    expect(typeof explainGradeComputation).toBe('function')
    if (typeof explainGradeComputation !== 'function') return

    const custom = [
      { id: 'c1', name: 'Quizzes', weight_percent: '45' },
      { id: 'c2', name: 'Projects', weight_percent: '55' },
    ]
    const res = explainGradeComputation(custom, 'ched_percentage')
    expect(res.formula).toBe('Period grade = Quizzes × 45% + Projects × 55%')
    expect(res.example).toContain('0.45')
    expect(res.example).toContain('0.55')
  })

  it('handles empty component list gracefully', () => {
    expect(typeof explainGradeComputation).toBe('function')
    if (typeof explainGradeComputation !== 'function') return

    const res = explainGradeComputation([], 'deped_k12')
    expect(res.hasComponents).toBe(false)
    expect(res.summary).toContain('Add at least one named component')
  })
})

describe('T-243 — GradingComputationExplanation component rendering', () => {
  it('renders explanation for DepEd K-12 with testid and mode label', () => {
    expect(typeof GradingComputationExplanation).toBe('function')
    if (typeof GradingComputationExplanation !== 'function') return

    const html = renderToStaticMarkup(
      <GradingComputationExplanation
        mode="deped_k12"
        components={depedComponents}
        policy={{}}
      />,
    )
    expect(html).toContain('data-testid="grading-computation-explanation"')
    expect(html).toContain('How grades are computed (DepEd K-12)')
    expect(html).toContain('Written Works × 30%')
    expect(html).toContain('Transmuted per DepEd Order No. 015, s. 2026')
  })

  it('renders explanation for CHED Point Scale with table lookup wording', () => {
    expect(typeof GradingComputationExplanation).toBe('function')
    if (typeof GradingComputationExplanation !== 'function') return

    const html = renderToStaticMarkup(
      <GradingComputationExplanation
        mode="ched_point"
        components={collegeComponents}
        policy={{ point_scale_direction: 'standard' }}
      />,
    )
    expect(html).toContain('data-testid="grading-computation-explanation"')
    expect(html).toContain('How grades are computed (CHED Point Scale)')
    expect(html).toContain('Point-scale table lookup')
  })

  it('renders nothing when there are no components', () => {
    expect(typeof GradingComputationExplanation).toBe('function')
    if (typeof GradingComputationExplanation !== 'function') return

    const html = renderToStaticMarkup(
      <GradingComputationExplanation
        mode="deped_k12"
        components={[]}
        policy={{}}
      />,
    )
    expect(html).toBe('')
  })
})
