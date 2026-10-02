/**
 * Grade / Year Level follows Education Level (T-122, triplecookiemonster-153).
 *
 * Kristine's screenshot was the New Class modal with Education Level
 * ("College") and Grade / Year Level (free text, "e.g. 3rd") both boxed red --
 * her ask was that the second field offer only the grades real for the first,
 * as a dropdown. The owner's mapping (2026-10-02, corrected the same day) has
 * four rungs that do not overlap: Elementary 1-6, High School 7-10, Senior
 * High 11-12, College 1st-5th Year. The Education Level select itself only
 * offered three values before this card, so "Senior High" is a new option
 * there too -- without it Grades 11-12 would have no selectable level once
 * High School is pinned to 7-10 (see ClassFormModal.jsx's GRADE_LEVEL_OPTIONS
 * comment).
 *
 * `gradeLevelFor` is the one place the "clear a now-invalid grade" rule
 * lives -- `handleEducationLevelChange` just calls it -- so pinning it here
 * pins the real behaviour, not a copy of it.
 */
import { describe, expect, it } from 'vitest'
import { GRADE_LEVEL_OPTIONS, gradeLevelFor } from './ClassFormModal.jsx'

describe('GRADE_LEVEL_OPTIONS (T-122)', () => {
  it('offers exactly Grades 7-10 for High School', () => {
    expect(GRADE_LEVEL_OPTIONS['High School']).toEqual(['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'])
  })

  it('offers exactly Grades 1-6 for Elementary', () => {
    expect(GRADE_LEVEL_OPTIONS.Elementary).toEqual(['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'])
  })

  it('offers exactly Grades 11-12 for Senior High', () => {
    expect(GRADE_LEVEL_OPTIONS['Senior High']).toEqual(['Grade 11', 'Grade 12'])
  })

  it('offers 1st through 5th Year for College -- not trimmed to four', () => {
    expect(GRADE_LEVEL_OPTIONS.College).toEqual(['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'])
  })

  it('covers every grade exactly once across the four levels', () => {
    const all = [...GRADE_LEVEL_OPTIONS.Elementary, ...GRADE_LEVEL_OPTIONS['High School'], ...GRADE_LEVEL_OPTIONS['Senior High']]
    expect(all).toEqual(['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'])
    expect(new Set(all).size).toBe(12)
  })
})

describe('gradeLevelFor -- clearing a now-invalid grade (T-122)', () => {
  it('clears a College year when the level drops to Elementary', () => {
    expect(gradeLevelFor('Elementary', '3rd Year')).toBe('')
  })

  it('clears a grade that belonged to a different K-12 rung', () => {
    // Grade 10 is High School, not Senior High -- switching must not leave it sitting there.
    expect(gradeLevelFor('Senior High', 'Grade 10')).toBe('')
  })

  it('keeps a grade that is still valid under the new level', () => {
    expect(gradeLevelFor('High School', 'Grade 8')).toBe('Grade 8')
  })

  it('keeps a blank grade blank', () => {
    expect(gradeLevelFor('College', '')).toBe('')
  })
})
