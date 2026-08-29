import { describe, it, expect } from 'vitest'
import { formatGrade, passes, gradeColor, gradeTone, gradeAsPercent, passNote } from './gradeDisplay'
import { chedPointEquivalent } from '@/lib/grading'
import { green, goldDeep, red, faint } from '@/theme'

describe('gradeDisplay — the student side of Grade Config', () => {
  it('shows point grades with two decimals and percent grades whole', () => {
    expect(formatGrade(1.25, 'ched_point')).toBe('1.25')
    expect(formatGrade(3, 'ched_point')).toBe('3.00')
    expect(formatGrade(87.6, 'deped_k12')).toBe('88')
    expect(formatGrade(87.6, 'ched_percentage')).toBe('88')
    expect(formatGrade(87.6)).toBe('88')
    expect(formatGrade(null, 'ched_point')).toBe('—')
  })

  it('passes at 3.0 or lower on the point scale, 75 or higher elsewhere', () => {
    expect(passes(3.0, 'ched_point')).toBe(true)
    expect(passes(3.25, 'ched_point')).toBe(false)
    expect(passes(5.0, 'ched_point')).toBe(false)
    expect(passes(75, 'deped_k12')).toBe(true)
    expect(passes(74, 'deped_k12')).toBe(false)
    expect(passes(null, 'ched_point')).toBeNull()
  })

  it('never paints a passing point grade red', () => {
    expect(gradeColor(1.0, 'ched_point')).toBe(green)
    expect(gradeColor(3.0, 'ched_point')).toBe(goldDeep)
    expect(gradeColor(5.0, 'ched_point')).toBe(red)
    expect(gradeColor(null, 'ched_point')).toBe(faint)
    // Same value read as a percent is a fail — the mode must decide.
    expect(gradeColor(3.0)).toBe(red)
  })

  it('agrees with the grading pipeline about what a point grade means', () => {
    for (const pct of [96, 91, 85, 79, 75, 74, 40]) {
      const point = chedPointEquivalent(pct)
      expect(passes(point, 'ched_point')).toBe(pct >= 75)
      // Round-tripping lands inside the band the point came from.
      expect(chedPointEquivalent(gradeAsPercent(point, 'ched_point'))).toBe(point)
    }
  })

  it('labels the point scale in its own words', () => {
    expect(gradeTone(1.25, 'ched_point').label).toBe('Excellent')
    expect(gradeTone(3.0, 'ched_point').label).toBe('Passed')
    expect(gradeTone(5.0, 'ched_point').label).toBe('Failed')
    expect(gradeTone(92, 'deped_k12').label).toBe('Outstanding')
    expect(passNote('ched_point')).toMatch(/3\.00/)
    expect(passNote('deped_k12')).toMatch(/75/)
  })
})
