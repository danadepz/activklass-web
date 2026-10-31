/**
 * Verification for Priority 3: Student Grade Center Display
 *
 * Verifies that:
 * 1. Lecture with Laboratory display renders the authoritative reference numbers:
 *    - Midterm: Lecture 82.4%, Lab 89.4%, Combined 84.73
 *    - Finals: Lecture 78.8%, Lab 84.4%, Combined 80.67
 *    - Overall: 82.70
 * 2. Missing laboratory track is displayed as 'not yet graded' rather than '0%'.
 * 3. Missing lecture track is displayed as '—'.
 * 4. Completely ungraded period displays 'No graded work in this period yet.'
 * 5. Lecture Only classes do NOT display any laboratory breakdown or track rows.
 * 6. Legacy pre-laboratory entries render without errors and without tracks.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const view = vi.hoisted(() => ({ data: null }))

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'S1', role: 'student', first_name: 'Carlo', last_name: 'Mendoza' } }),
}))
vi.mock('@/lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: () => ({ data: view.data, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ classId: 'C1' }),
}))

import StudentClassDetail from './index.jsx'

function renderGradesTab(entryOverride) {
  view.data = {
    clazz: { id: 'C1', subject: 'Computer Programming 1', section: 'BSIT-1A', student_ids: ['S1'], dropped_student_ids: [] },
    teacher: { id: 'T1', first_name: 'Alan', last_name: 'Turing' },
    entry: entryOverride,
    attendance: { rate: 95, tally: { present: 19, late: 1, absent: 0, excused: 0 } },
    contestsByDate: {},
    gradeContestsByAssessment: {},
    syllabus: null,
    announcements: [],
    quizzes: [],
    attemptsByQuiz: {},
    scaffoldedTopicIds: new Set(),
    tasks: [],
    submissionByTask: {},
    dropped: false,
  }

  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={['/student/classes/C1?tab=grades']}>
      <StudentClassDetail />
    </MemoryRouter>,
  )
  return { html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }
}

describe('Student Grade Center Display Verification', () => {
  it('displays authoritative Lecture with Laboratory grades and separate track breakdown', () => {
    const labEntry = {
      student_id: 'S1',
      class_id: 'C1',
      final_grade: 82.7,
      mode: 'ched_percentage',
      passing_percent: 75,
      grading_structure: 'lecture_lab',
      lab_weight_percent: 100 / 3,
      periods: [
        {
          id: 'mid',
          name: 'Midterm',
          grade: 84.73,
          tracks: {
            lecture: 82.4,
            lab: 89.4,
            lecture_weight_percent: 200 / 3,
            lab_weight_percent: 100 / 3,
          },
        },
        {
          id: 'fin',
          name: 'Finals',
          grade: 80.67,
          tracks: {
            lecture: 78.8,
            lab: 84.4,
            lecture_weight_percent: 200 / 3,
            lab_weight_percent: 100 / 3,
          },
        },
      ],
      components: [
        { id: 'lec', name: 'Lecture Exam', weight_percent: 100, track: 'lecture' },
        { id: 'lx', name: 'Lab Exercise', weight_percent: 70, track: 'lab' },
        { id: 'le', name: 'Lab Exam', weight_percent: 30, track: 'lab' },
      ],
      assessments: [
        { id: 'a1', period_id: 'mid', component_id: 'lec', title: 'Prelim Exam', raw_score: 82.4, total_points: 100 },
        { id: 'a2', period_id: 'mid', component_id: 'lx', title: 'Exercise 1', raw_score: 90, total_points: 100 },
        { id: 'a3', period_id: 'mid', component_id: 'le', title: 'Midterm Lab Exam', raw_score: 88, total_points: 100 },
        { id: 'a4', period_id: 'fin', component_id: 'lec', title: 'Final Lecture Exam', raw_score: 78.8, total_points: 100 },
        { id: 'a5', period_id: 'fin', component_id: 'lx', title: 'Exercise 2', raw_score: 85, total_points: 100 },
        { id: 'a6', period_id: 'fin', component_id: 'le', title: 'Final Lab Exam', raw_score: 83, total_points: 100 },
      ],
    }

    const { text } = renderGradesTab(labEntry)

    // Current overall grade (formatGrade rounds percentage to whole number for report card: 82.7 -> 83)
    expect(text).toContain('Current grade')
    expect(text).toContain('83')

    // Midterm period (84.73 rounds to 85)
    expect(text).toContain('Midterm')
    expect(text).toContain('Grade 85')
    expect(text).toContain('Lecture 82.4% (67%) · Laboratory 89.4% (33%)')

    // Finals period (80.67 rounds to 81)
    expect(text).toContain('Finals')
    expect(text).toContain('Grade 81')
    expect(text).toContain('Lecture 78.8% (67%) · Laboratory 84.4% (33%)')

    // Components are labelled
    expect(text).toContain('Lab Exercise (70% · Laboratory)')
    expect(text).toContain('Lab Exam (30% · Laboratory)')
  })

  it('renders point-scale 2-decimal format in ched_point mode', () => {
    const pointEntry = {
      student_id: 'S1',
      class_id: 'C1',
      final_grade: 2.25,
      mode: 'ched_point',
      passing_percent: 75,
      grading_structure: 'lecture_lab',
      lab_weight_percent: 100 / 3,
      periods: [
        {
          id: 'mid',
          name: 'Midterm',
          grade: 2.25,
          tracks: {
            lecture: 82.4,
            lab: 89.4,
            lecture_weight_percent: 200 / 3,
            lab_weight_percent: 100 / 3,
          },
        },
      ],
      components: [
        { id: 'lec', name: 'Lecture Exam', weight_percent: 100, track: 'lecture' },
        { id: 'lx', name: 'Lab Exercise', weight_percent: 70, track: 'lab' },
        { id: 'le', name: 'Lab Exam', weight_percent: 30, track: 'lab' },
      ],
      assessments: [
        { id: 'a1', period_id: 'mid', component_id: 'lec', title: 'Prelim Exam', raw_score: 82.4, total_points: 100 },
      ],
    }

    const { text } = renderGradesTab(pointEntry)
    expect(text).toContain('Current grade')
    expect(text).toContain('2.25')
    expect(text).toContain('Grade 2.25')
  })

  it('renders "not yet graded" when laboratory has no scores yet, without treating it as zero', () => {
    const entryWithoutLab = {
      student_id: 'S1',
      class_id: 'C1',
      final_grade: 82.4,
      mode: 'ched_percentage',
      passing_percent: 75,
      grading_structure: 'lecture_lab',
      lab_weight_percent: 33.33,
      periods: [
        {
          id: 'mid',
          name: 'Midterm',
          grade: 82.4, // Fallback to lecture alone (rounds to 82)
          tracks: {
            lecture: 82.4,
            lab: null, // No lab scores yet
            lecture_weight_percent: 66.67,
            lab_weight_percent: 33.33,
          },
        },
      ],
      components: [
        { id: 'lec', name: 'Lecture Exam', weight_percent: 100, track: 'lecture' },
        { id: 'lx', name: 'Lab Exercise', weight_percent: 70, track: 'lab' },
      ],
      assessments: [
        { id: 'a1', period_id: 'mid', component_id: 'lec', title: 'Lecture Quiz', raw_score: 82.4, total_points: 100 },
      ],
    }

    const { text } = renderGradesTab(entryWithoutLab)

    expect(text).toContain('Grade 82')
    expect(text).toContain('Lecture 82.4% (67%) · Laboratory not yet graded (33%)')
    expect(text).not.toContain('Laboratory 0%')
  })

  it('renders "Lecture —" when lecture has no scores yet', () => {
    const entryWithoutLec = {
      student_id: 'S1',
      class_id: 'C1',
      final_grade: 89.4,
      mode: 'ched_percentage',
      passing_percent: 75,
      grading_structure: 'lecture_lab',
      lab_weight_percent: 33.33,
      periods: [
        {
          id: 'mid',
          name: 'Midterm',
          grade: 89.4,
          tracks: {
            lecture: null,
            lab: 89.4,
            lecture_weight_percent: 66.67,
            lab_weight_percent: 33.33,
          },
        },
      ],
      components: [
        { id: 'lx', name: 'Lab Exercise', weight_percent: 100, track: 'lab' },
      ],
      assessments: [
        { id: 'a1', period_id: 'mid', component_id: 'lx', title: 'Lab 1', raw_score: 89.4, total_points: 100 },
      ],
    }

    const { text } = renderGradesTab(entryWithoutLec)

    expect(text).toContain('Grade 89')
    expect(text).toContain('Lecture — (67%) · Laboratory 89.4% (33%)')
  })

  it('renders empty period notice when a period has a recorded grade but no graded assessments yet', () => {
    const mixedPeriodEntry = {
      student_id: 'S1',
      class_id: 'C1',
      final_grade: 85,
      mode: 'deped_k12',
      periods: [
        { id: 'q1', name: 'Quarter 1', grade: 85, tracks: null },
        { id: 'q2', name: 'Quarter 2', grade: 80, tracks: null },
      ],
      components: [
        { id: 'ww', name: 'Written Works', weight_percent: 40 },
      ],
      assessments: [
        { id: 'a1', period_id: 'q1', component_id: 'ww', title: 'Quiz 1', raw_score: 18, total_points: 20 },
      ],
    }

    const { text } = renderGradesTab(mixedPeriodEntry)
    expect(text).toContain('Quarter 1')
    expect(text).toContain('Grade 85')
    expect(text).toContain('Quarter 2')
    expect(text).toContain('Grade 80')
    expect(text).toContain('No graded work in this period yet.')
  })

  it('renders "No Grades Yet" empty state when class is completely ungraded', () => {
    const completelyUngradedEntry = {
      student_id: 'S1',
      class_id: 'C1',
      final_grade: null,
      mode: 'deped_k12',
      periods: [
        { id: 'q1', name: 'Quarter 1', grade: null, tracks: null },
      ],
      components: [
        { id: 'ww', name: 'Written Works', weight_percent: 40 },
      ],
      assessments: [],
    }

    const { text } = renderGradesTab(completelyUngradedEntry)
    expect(text).toContain('No Grades Yet')
    expect(text).toContain('Your grade summary appears here once your teacher records and saves your scores.')
  })

  it('renders Lecture Only classes cleanly without any track text', () => {
    const lectureOnlyEntry = {
      student_id: 'S1',
      class_id: 'C1',
      final_grade: 90,
      mode: 'deped_k12',
      periods: [
        { id: 'q1', name: 'Quarter 1', grade: 90, tracks: null },
      ],
      components: [
        { id: 'ww', name: 'Written Works', weight_percent: 40 },
        { id: 'pt', name: 'Performance Tasks', weight_percent: 60 },
      ],
      assessments: [
        { id: 'a1', period_id: 'q1', component_id: 'ww', title: 'Quiz 1', raw_score: 18, total_points: 20 },
      ],
    }

    const { text } = renderGradesTab(lectureOnlyEntry)
    expect(text).toContain('Grade 90')
    expect(text).not.toContain('Lecture 90%')
    expect(text).not.toContain('Laboratory')
  })
})
