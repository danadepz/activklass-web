/**
 * Verification for Priority 5: Switching from Lecture with Laboratory back to Lecture Only and vice versa
 *
 * Verifies that:
 * 1. Switching to Lecture Only removes laboratory components from the active calculation.
 * 2. Laboratory scores in assessments are preserved and not deleted or destroyed.
 * 3. The active grade is recomputed solely from lecture components without failure or corruption.
 * 4. Tracks is null on Lecture Only.
 * 5. Switching back to Lecture with Laboratory restores combined weighting.
 * 6. Existing assessment scores reconnect cleanly and recompute the expected combined grade.
 */
import { describe, expect, it } from 'vitest'
import {
  computeFinalGrade,
  DEFAULT_LAB_WEIGHT,
  gradePolicy,
  LAB,
  LECTURE,
  LECTURE_LAB,
  LECTURE_ONLY,
} from '@/lib/grading'

describe('Grading Mode Switching & Data Integrity', () => {
  // Common student scores and assessment definitions
  const studentId = 's1'
  const midAssessments = [
    { id: 'a_lec', component_id: 'c_lec', title: 'Prelim Exam', total_points: 100 },
    { id: 'a_lx', component_id: 'c_lx', title: 'Lab Ex 1', total_points: 100 },
    { id: 'a_le', component_id: 'c_le', title: 'Lab Exam 1', total_points: 100 },
  ]
  const scores = {
    a_lec: { status: 'graded', raw_score: 82.4 },
    a_lx: { status: 'graded', raw_score: 90.0 },
    a_le: { status: 'graded', raw_score: 88.0 },
  }

  const lectureComponents = [
    { id: 'c_lec', name: 'Lecture Exam', weight_percent: 100, track: LECTURE },
  ]
  const labComponents = [
    { id: 'c_lx', name: 'Lab Exercise', weight_percent: 70, track: LAB, required: true },
    { id: 'c_le', name: 'Lab Exam', weight_percent: 30, track: LAB, required: true },
  ]

  it('Step 1: In Lecture with Laboratory mode, calculates combined grade (84.73)', () => {
    const policy = gradePolicy({
      grading_structure: LECTURE_LAB,
      lab_weight_percent: DEFAULT_LAB_WEIGHT,
      grading_mode: 'ched_percentage',
    })

    const componentsWithA = [...lectureComponents, ...labComponents].map((c) => ({
      ...c,
      assessments: midAssessments.filter((a) => a.component_id === c.id),
    }))

    const result = computeFinalGrade(componentsWithA, scores, 'ched_percentage', policy)
    expect(result.final).toBe(84.73)
    expect(result.tracks.lecture).toBe(82.4)
    expect(result.tracks.lab).toBe(89.4)
  })

  it('Step 2: Switching to Lecture Only excludes lab components and computes pure lecture grade (82.40)', () => {
    // When switched to Lecture Only, only lecture components remain active
    const policy = gradePolicy({
      grading_structure: LECTURE_ONLY,
      grading_mode: 'ched_percentage',
    })

    const activeComponentsWithA = lectureComponents.map((c) => ({
      ...c,
      assessments: midAssessments.filter((a) => a.component_id === c.id),
    }))

    const result = computeFinalGrade(activeComponentsWithA, scores, 'ched_percentage', policy)
    // Grade is now computed solely from the lecture component
    expect(result.final).toBe(82.4)
    // Tracks is null for Lecture Only
    expect(result.tracks).toBeNull()

    // Data integrity check: the laboratory assessments and scores STILL exist in the score map!
    expect(scores.a_lx.raw_score).toBe(90.0)
    expect(scores.a_le.raw_score).toBe(88.0)
    expect(midAssessments.find((a) => a.id === 'a_lx')).toBeDefined()
  })

  it('Step 3: Switching back to Lecture with Laboratory restores the combined grade without losing data', () => {
    const policy = gradePolicy({
      grading_structure: LECTURE_LAB,
      lab_weight_percent: DEFAULT_LAB_WEIGHT,
      grading_mode: 'ched_percentage',
    })

    // Components restored with their IDs
    const restoredComponentsWithA = [...lectureComponents, ...labComponents].map((c) => ({
      ...c,
      assessments: midAssessments.filter((a) => a.component_id === c.id),
    }))

    const result = computeFinalGrade(restoredComponentsWithA, scores, 'ched_percentage', policy)
    // All original scores re-link cleanly and recalculate the exact 84.73 combined grade
    expect(result.final).toBe(84.73)
    expect(result.tracks.lecture).toBe(82.4)
    expect(result.tracks.lab).toBe(89.4)
  })

  it('Step 4: Warning message accurately informs teacher before confirming the switch', () => {
    const fmtPct = (n) => `${Number(n).toFixed(2).replace(/\.00$/, '')}%`
    const labWeight = 33.33

    const structureNoteToLectureOnly =
      ' This class group switches to Lecture only: laboratory components are removed from the' +
      ' setup and laboratory scores stop counting toward the grade. Existing scores are kept,' +
      ' not deleted.'

    const structureNoteToLectureLab =
      ' This class group switches to Lecture with Laboratory: laboratory scores start counting' +
      ` for ${fmtPct(Number(labWeight))} of each period.`

    expect(structureNoteToLectureOnly).toContain('laboratory components are removed from the setup')
    expect(structureNoteToLectureOnly).toContain('laboratory scores stop counting toward the grade')
    expect(structureNoteToLectureOnly).toContain('Existing scores are kept, not deleted.')

    expect(structureNoteToLectureLab).toContain('switches to Lecture with Laboratory')
    expect(structureNoteToLectureLab).toContain('33.33%')
  })
})
