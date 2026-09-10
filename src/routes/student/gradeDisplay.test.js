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

describe('gradeDisplay — a teacher-set pass mark and a 5.0-is-highest scale (T-45)', () => {
  // The entry itself is the policy: syncEntries stamps both fields beside mode.
  const inverted = { mode: 'ched_point', passing_percent: 75, point_scale_direction: 'inverted' }
  const at60 = { mode: 'ched_percentage', passing_percent: 60, point_scale_direction: 'ched' }

  it('reads the direction: 4.75 is excellent and green, 1.0 fails and is red', () => {
    expect(passes(4.75, 'ched_point', inverted)).toBe(true)
    expect(passes(3.0, 'ched_point', inverted)).toBe(true)
    expect(passes(2.75, 'ched_point', inverted)).toBe(false)
    expect(gradeColor(4.75, 'ched_point', inverted)).toBe(green)
    expect(gradeColor(3.0, 'ched_point', inverted)).toBe(goldDeep)
    expect(gradeColor(1.0, 'ched_point', inverted)).toBe(red)
    expect(gradeTone(4.75, 'ched_point', inverted).label).toBe('Excellent')
    expect(gradeTone(3.0, 'ched_point', inverted).label).toBe('Passed')
    expect(gradeTone(1.0, 'ched_point', inverted).label).toBe('Failed')
    expect(passNote('ched_point', inverted)).toBe('5.00 is highest · 3.00 passes')
  })

  it('reads the pass mark on percentages', () => {
    expect(passes(60, 'ched_percentage', at60)).toBe(true)
    expect(passes(59, 'ched_percentage', at60)).toBe(false)
    expect(gradeColor(65, 'ched_percentage', at60)).toBe(goldDeep)
    expect(gradeColor(59, 'ched_percentage', at60)).toBe(red)
    expect(gradeTone(65, 'ched_percentage', at60).label).toBe('Satisfactory')
    expect(passNote('ched_percentage', at60)).toBe('60 passes')
  })

  it('gauges an inverted point grade the same distance as its standard twin', () => {
    expect(gradeAsPercent(4.75, 'ched_point', inverted)).toBe(gradeAsPercent(1.25, 'ched_point'))
    expect(gradeAsPercent(5.0, 'ched_point', inverted)).toBe(96)
    expect(gradeAsPercent(1.0, 'ched_point', inverted)).toBe(60)
  })

  it('agrees with the grading pipeline in both directions', () => {
    for (const policy of [inverted, { point_scale_direction: 'ched' }]) {
      for (const pct of [96, 91, 85, 79, 75, 74, 40]) {
        const point = chedPointEquivalent(pct, policy)
        expect(passes(point, 'ched_point', policy)).toBe(pct >= 75)
        expect(chedPointEquivalent(gradeAsPercent(point, 'ched_point', policy), policy)).toBe(point)
      }
    }
  })

  it('without a policy everything reads as it always did', () => {
    expect(passNote('ched_point')).toBe('1.00 is highest · 3.00 passes')
    expect(passNote('deped_k12')).toBe('75 passes')
    expect(gradeAsPercent(1.0, 'ched_point')).toBe(96)
    expect(gradeAsPercent(3.0, 'ched_point')).toBe(75)
    expect(gradeAsPercent(5.0, 'ched_point')).toBe(60)
    expect(gradeTone(3.0, 'ched_point', {}).label).toBe('Passed')
  })
})
