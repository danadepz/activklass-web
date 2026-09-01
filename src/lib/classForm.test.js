/**
 * Which level a stored class edits as, and the term line that follows from it.
 *
 * Reported as andecobs-33 (T-19): "No semester number sa edit class pero naa
 * sa add class." The Semester select is real and shared by both modes, but the
 * College block it sits in is gated on the level, and the level used to come
 * from `education_level ?? 'High School'`. A class saved before that field
 * existed carries nothing, so it edited as K-12 and the field was never drawn.
 */
import { describe, expect, it } from 'vitest'
import { classEducationLevel, classToForm, academicTerm } from './classForm'

describe('classEducationLevel', () => {
  it('takes the stored level when the class has one', () => {
    expect(classEducationLevel({ education_level: 'College' })).toBe('College')
    expect(classEducationLevel({ education_level: 'Elementary' })).toBe('Elementary')
    // A stored level wins even against college-shaped leftovers.
    expect(classEducationLevel({ education_level: 'High School', semester: '1st' })).toBe('High School')
  })

  it('reads a legacy class as College from what only a college class carries', () => {
    expect(classEducationLevel({ semester: '1st' })).toBe('College')
    expect(classEducationLevel({ units: 3 })).toBe('College')
    expect(classEducationLevel({ units: 0 })).toBe('College')
    expect(classEducationLevel({ grade_level: '3rd' })).toBe('College')
    expect(classEducationLevel({ grade_level: '1st Year' })).toBe('College')
  })

  it('leaves a K-12 class alone', () => {
    expect(classEducationLevel({ grade_level: 'Grade 10' })).toBe('High School')
    expect(classEducationLevel({ grade_level: '', semester: '' })).toBe('High School')
    expect(classEducationLevel({})).toBe('High School')
  })
})

describe('classToForm', () => {
  it('opens a legacy college class as College, so Edit draws Units and Semester', () => {
    const form = classToForm({ subject: 'Data Structures', grade_level: '2nd', semester: '1st', units: 3 })
    expect(form.education_level).toBe('College')
    expect(form.semester).toBe('1st')
    expect(form.units).toBe('3')
  })

  it('still opens a K-12 class as High School', () => {
    const form = classToForm({ subject: 'Mathematics 10', section: 'Grade 10 - Rizal', grade_level: 'Grade 10' })
    expect(form.education_level).toBe('High School')
    expect(form.semester).toBe('')
    expect(form.units).toBe('')
  })
})

describe('academicTerm', () => {
  it('prints the semester for a college class, stored level or derived', () => {
    expect(academicTerm({ education_level: 'College', academic_year: '2026-2027', semester: '1st' }))
      .toBe('2026-2027 · 1st Sem')
    expect(academicTerm({ academic_year: '2026-2027', semester: 'summer', units: 3 }))
      .toBe('2026-2027 · Midyear')
  })

  it('prints the school year alone for K-12', () => {
    expect(academicTerm({ education_level: 'High School', academic_year: '2026-2027', semester: null }))
      .toBe('2026-2027')
  })
})
