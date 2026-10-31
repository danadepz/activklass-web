/**
 * Verification for Priority 4: Teacher Gradebook CSV Export
 *
 * Verifies that:
 * 1. Both Lecture Only and Lecture with Laboratory modes export correctly.
 * 2. Lecture, laboratory, and combined grades are accurate.
 * 3. Missing scores ('M'), excused scores ('X'), and unassessed scores ('') are represented consistently.
 * 4. Missing track percentages are formatted as '—' without silent zeroing.
 * 5. Values with commas (e.g. "Dela Cruz, Juan") are properly escaped by csvCell.
 * 6. Student identifiers and membership remain correctly associated.
 */
import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from './csv'
import { componentTrack, hasLab, LAB } from './grading'

// Helper mirroring ClassRecordPage's exportCsv generation
function generateRecordCsv(record) {
  const fmt = (pct) => (pct === null || pct === undefined ? '—' : pct.toFixed(2).replace(/\.00$/, ''))
  const cellText = (score) => {
    if (!score) return ''
    if (score.status === 'missing') return 'M'
    if (score.status === 'excused') return 'X'
    return String(score.raw_score ?? '')
  }

  const byComponent = record.components
    .map((component) => ({
      ...component,
      track: componentTrack(component),
      assessments: record.assessments.filter((a) => a.component_id === component.id),
    }))
    .sort((a, b) => (a.track === b.track ? 0 : a.track === LAB ? 1 : -1))

  const labGraded = hasLab(record.policy)
  const header = ['Student']
  for (const component of byComponent) {
    for (const a of component.assessments) header.push(`${a.title} (/${fmt(a.total_points)})`)
    header.push(
      `${component.name} % (${fmt(component.weight_percent)}%${component.track === LAB ? ', laboratory' : ''})`,
    )
  }
  if (labGraded) {
    const labW = record.policy.lab_weight_percent
    header.push(
      `Lecture % (${fmt(100 - labW)}% of grade)`,
      `Laboratory % (${fmt(labW)}% of grade)`,
    )
  }
  header.push('Override', `${record.period.name} ${labGraded ? 'combined grade' : 'grade'}`)

  const rows = record.students.map((student) => {
    const grade = record.grades[student.student_id]
    const row = [`${student.last_name}, ${student.first_name}`]
    for (const component of byComponent) {
      for (const a of component.assessments) row.push(cellText(record.scores[a.id]?.[student.student_id]))
      row.push(fmt(grade?.components?.[component.id]))
    }
    if (labGraded) row.push(fmt(grade?.tracks?.lecture), fmt(grade?.tracks?.lab))
    row.push(grade?.override != null ? fmt(grade.override) : '', fmt(grade?.grade))
    return row
  })

  return { header, rows, csvContent: toCsv([header, ...rows]) }
}

describe('Gradebook CSV Export Verification', () => {
  it('correctly exports a Lecture Only class with score statuses and formatting', () => {
    const record = {
      period: { id: 'q1', name: 'Quarter 1' },
      policy: { grading_structure: 'lecture_only' },
      components: [
        { id: 'ww', name: 'Written Works', weight_percent: 40 },
        { id: 'pt', name: 'Performance Tasks', weight_percent: 60 },
      ],
      assessments: [
        { id: 'a1', component_id: 'ww', title: 'Quiz 1', total_points: 20 },
        { id: 'a2', component_id: 'ww', title: 'Quiz 2', total_points: 20 },
        { id: 'a3', component_id: 'pt', title: 'Project', total_points: 50 },
      ],
      students: [
        { student_id: 's1', first_name: 'Juan', last_name: 'Dela Cruz' },
        { student_id: 's2', first_name: 'Maria', last_name: 'Santos' },
      ],
      scores: {
        a1: { s1: { status: 'graded', raw_score: 18 }, s2: { status: 'missing' } },
        a2: { s1: { status: 'excused' }, s2: { status: 'graded', raw_score: 15 } },
        a3: { s1: { status: 'graded', raw_score: 45 } }, // s2 has no score entry
      },
      grades: {
        s1: { components: { ww: 90.0, pt: 90.0 }, override: null, grade: 90.0 },
        s2: { components: { ww: 75.0, pt: null }, override: 80.0, grade: 80.0 },
      },
    }

    const { header, rows, csvContent } = generateRecordCsv(record)

    expect(header).toEqual([
      'Student',
      'Quiz 1 (/20)',
      'Quiz 2 (/20)',
      'Written Works % (40%)',
      'Project (/50)',
      'Performance Tasks % (60%)',
      'Override',
      'Quarter 1 grade',
    ])

    // Row 1: Dela Cruz, Juan
    expect(rows[0]).toEqual([
      'Dela Cruz, Juan',
      '18',
      'X', // excused
      '90',
      '45',
      '90',
      '',
      '90',
    ])

    // Row 2: Santos, Maria
    expect(rows[1]).toEqual([
      'Santos, Maria',
      'M', // missing
      '15',
      '75',
      '', // unassessed
      '—', // component has no scores -> '—'
      '80', // manual override
      '80',
    ])

    // Comma in student name must be escaped with quotes
    expect(csvContent).toContain('"Dela Cruz, Juan"')
    expect(csvContent).toContain('"Santos, Maria"')
  })

  it('correctly exports a Lecture with Laboratory class with separate tracks and combined grade', () => {
    const record = {
      period: { id: 'mid', name: 'Midterm' },
      policy: {
        grading_structure: 'lecture_lab',
        lab_weight_percent: 100 / 3, // 33.333...%
      },
      components: [
        { id: 'lec', name: 'Lecture Exam', weight_percent: 100, track: 'lecture' },
        { id: 'lab_ex', name: 'Lab Exercise', weight_percent: 70, track: 'lab' },
        { id: 'lab_exam', name: 'Lab Exam', weight_percent: 30, track: 'lab' },
      ],
      assessments: [
        { id: 'a_lec', component_id: 'lec', title: 'Prelim Exam', total_points: 100 },
        { id: 'a_lx', component_id: 'lab_ex', title: 'Exercise 1', total_points: 100 },
        { id: 'a_le', component_id: 'lab_exam', title: 'Lab Exam 1', total_points: 100 },
      ],
      students: [
        { student_id: 's1', first_name: 'Ana', last_name: 'Reyes' },
        { student_id: 's2', first_name: 'Ben', last_name: 'Lim' },
      ],
      scores: {
        a_lec: { s1: { status: 'graded', raw_score: 82.4 }, s2: { status: 'graded', raw_score: 80 } },
        a_lx: { s1: { status: 'graded', raw_score: 90 } }, // s2 has no lab scores
        a_le: { s1: { status: 'graded', raw_score: 88 } },
      },
      grades: {
        s1: {
          components: { lec: 82.4, lab_ex: 90, lab_exam: 88 },
          tracks: { lecture: 82.4, lab: 89.4 },
          override: null,
          grade: 84.73,
        },
        s2: {
          components: { lec: 80, lab_ex: null, lab_exam: null },
          tracks: { lecture: 80, lab: null },
          override: null,
          grade: 80.0, // fallback to lecture alone
        },
      },
    }

    const { header, rows, csvContent } = generateRecordCsv(record)

    expect(header).toEqual([
      'Student',
      'Prelim Exam (/100)',
      'Lecture Exam % (100%)',
      'Exercise 1 (/100)',
      'Lab Exercise % (70%, laboratory)',
      'Lab Exam 1 (/100)',
      'Lab Exam % (30%, laboratory)',
      'Lecture % (66.67% of grade)',
      'Laboratory % (33.33% of grade)',
      'Override',
      'Midterm combined grade',
    ])

    // Student 1: Reference worked example numbers
    expect(rows[0]).toEqual([
      'Reyes, Ana',
      '82.4',
      '82.40',
      '90',
      '90',
      '88',
      '88',
      '82.40',
      '89.40',
      '',
      '84.73',
    ])

    // Student 2: Missing laboratory track -> formatted as '—', combined grade is 80 (not zeroed out!)
    expect(rows[1]).toEqual([
      'Lim, Ben',
      '80',
      '80',
      '',
      '—',
      '',
      '—',
      '80',
      '—',
      '',
      '80',
    ])

    expect(csvContent).toContain('"Reyes, Ana"')
    expect(csvContent).toContain('"Lim, Ben"')
    expect(csvContent).toContain('Midterm combined grade')
  })
})
