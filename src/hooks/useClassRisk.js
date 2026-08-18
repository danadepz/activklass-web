/**
 * Remediation-risk predictions for a class, from the Random Forest behind
 * /api/predict.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Assembling the indicators is the
 * whole job: the model wants seven, this system collects four, and the three it
 * cannot supply are the reason `coverage` exists.
 *
 *   attendance_rate      0.42 of the model's basis  -- from the attendance sheet
 *   prior_average_grade  0.24                       -- caller supplies from the gradebook
 *   quiz_average         0.21                       -- from graded quiz attempts
 *   study_hours_per_week 0.09                       -- never collected
 *   household_income     0.02                       -- never collected
 *   age                  0.01                       -- from the user profile
 *   has_internet_access  0.01                       -- never collected
 *
 * So a full-coverage prediction is impossible here and always will be until
 * those three are asked for. Read `coverage` before showing anything: the
 * backend fills gaps with healthy cohort defaults, which means a student we
 * know almost nothing about comes back reassuring rather than unknown.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { predictRiskBatch } from '@/lib/ai'

/** present = 1, late = 0.5, absent = 0. Excused days are left out entirely
 *  rather than counted as present -- an excused absence is not attendance. */
const DAY_WEIGHT = { present: 1, late: 0.5, absent: 0 }

async function attendanceRates(classId) {
  const snap = await getDocs(collection(db, 'classes', classId, 'attendance'))
  const tally = {}
  snap.docs.forEach((d) => {
    const records = d.data().records ?? {}
    Object.entries(records).forEach(([studentId, rec]) => {
      const weight = DAY_WEIGHT[rec?.status]
      if (weight == null) return
      const t = (tally[studentId] ??= { got: 0, days: 0 })
      t.got += weight
      t.days += 1
    })
  })
  return Object.fromEntries(
    Object.entries(tally).map(([id, t]) => [id, t.days ? (t.got / t.days) * 100 : null]),
  )
}

async function quizAverages(classId) {
  const snap = await getDocs(
    query(collection(db, 'quiz_attempts'), where('class_id', '==', classId)),
  )
  const best = {}
  snap.docs.forEach((d) => {
    const a = d.data()
    // total_score is the field every teacher view reads; an attempt without it
    // is awaiting manual grading, not a zero.
    if (a.total_score == null || !a.total_possible) return
    const pct = (a.total_score / a.total_possible) * 100
    const prev = best[a.student_id]
    if (prev == null || pct > prev) best[a.student_id] = pct
  })
  return best
}

/**
 * `students` is `[{ student_id, grade, age }]` -- the caller already has grades
 * loaded, and refetching the gradebook here would double the work on a page
 * that just computed it.
 */
export function useClassRisk(classId, students, options = {}) {
  const ids = (students ?? []).map((s) => s.student_id).sort().join(',')

  return useQuery({
    ...options,
    queryKey: ['class-risk', classId, ids],
    enabled: !!classId && (students ?? []).length > 0 && (options.enabled ?? true),
    // The model is deterministic for a given input, so there is nothing to gain
    // from refetching on every focus.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [attendance, quizzes] = await Promise.all([
        attendanceRates(classId),
        quizAverages(classId),
      ])

      const payload = students.map((s) => ({
        studentId: s.student_id,
        indicators: {
          attendanceRate: attendance[s.student_id] ?? undefined,
          priorAverageGrade: s.grade ?? undefined,
          quizAverage: quizzes[s.student_id] ?? undefined,
          age: s.age ?? undefined,
        },
      }))

      const results = await predictRiskBatch(payload)
      return Object.fromEntries(results.map((r) => [r.studentId, r]))
    },
  })
}

/**
 * Fallback wording only.
 *
 * The real disclosure now travels with each prediction as `training.summary`,
 * so it cannot drift from what the model was actually fitted on. This string is
 * what renders if an older backend answers without the field.
 */
export const RISK_CAVEAT =
  'Predicted from attendance, grades and quiz scores. A guide for where to ' +
  'look, not a judgement about a student.'
