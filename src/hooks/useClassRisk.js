/**
 * Early-warning predictions for a class, from the Random Forest behind
 * /api/predict.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Assembling the indicators is the
 * whole job, and half of them are rates of change rather than levels:
 *
 *   prior_average_grade  0.26 of the model's basis  -- caller supplies from the gradebook
 *   attendance_trend     0.21                       -- recent attendance minus earlier
 *   missing_work_rate    0.17                       -- work marked missing + quizzes never sat
 *   quiz_trend           0.15                       -- recent quiz scores minus earlier
 *   quiz_average         0.13                       -- from graded quiz attempts
 *   attendance_rate      0.08                       -- from the attendance sheet
 *
 * The trends are why this fires before the gradebook does. A student on 80 who
 * is sliding and a student on 80 who is steady are the same row to any
 * level-only view; the model separates them 0.99 from 0.10. Everything here
 * comes from data already in Firestore -- attendance is stored per day,
 * attempts carry submitted_at, gradebook scores carry a 'missing' status -- so
 * nothing new has to be asked of a teacher or a student.
 *
 * One of the four reads exists for a signal that is defined by ABSENCE. Every
 * other quiz figure here is derived from quiz_attempts, and a student who never
 * opened a quiz has no attempt document at all -- so the ones who had stopped
 * working were invisible, and the backend filled their silence with a healthy
 * default. Reading the quiz list alongside the attempt list is what closes it:
 * missing_work_rate pools work a teacher marked missing with quizzes whose
 * window shut unattempted.
 *
 * A trend needs history to exist at all. Early in a term there are not enough
 * recorded days or attempts to difference, and every trend helper returns
 * undefined rather than 0 in that case: 0 means "measured, and flat", which is
 * a reassuring claim we would not have earned. Read `coverage` before showing
 * anything -- the backend fills gaps with neutral defaults, so a student we
 * know little about comes back steady rather than unknown.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { predictRiskBatch } from '@/lib/ai'
import { saveClassPerformance } from '@/lib/performance'
import {
  DAY_WEIGHT,
  MIN_ATTENDANCE_DAYS,
  missedQuizCounts,
  missingRate,
  missingWorkCounts,
  quizTrendFromAttempts,
  sortKey,
  splitTrend,
} from '@/lib/riskSignals'

/**
 * Whole-term attendance rate (0-100) and the recent-vs-earlier trend (-1..1)
 * per student, from the date-keyed attendance subcollection.
 */
async function attendanceSignals(classId) {
  const snap = await getDocs(collection(db, 'classes', classId, 'attendance'))
  const days = snap.docs
    .map((d) => ({ date: d.data().date ?? d.id, records: d.data().records ?? {} }))
    .sort((a, b) => sortKey(a.date).localeCompare(sortKey(b.date)))

  const series = {}
  days.forEach(({ records }) => {
    Object.entries(records).forEach(([studentId, rec]) => {
      const weight = DAY_WEIGHT[rec?.status]
      if (weight == null) return
      ;(series[studentId] ??= []).push(weight)
    })
  })

  return Object.fromEntries(
    Object.entries(series).map(([id, marks]) => [
      id,
      {
        rate: marks.length ? (marks.reduce((a, b) => a + b, 0) / marks.length) * 100 : undefined,
        trend: splitTrend(marks, MIN_ATTENDANCE_DAYS),
      },
    ]),
  )
}

/**
 * Best score (0-100), chronological trend, and which quizzes were attempted.
 *
 * The level stays best-per-student, which is what every other teacher view
 * reports. The trend deliberately does not: it walks attempts in submission
 * order, because a student whose scores are falling still has their one good
 * early attempt sitting in the maximum.
 *
 * `attempted` collects EVERY attempt, including ones still awaiting manual
 * grading. Scoring and submission are different questions: an ungraded attempt
 * cannot go into an average, but the student did sit the quiz, and counting
 * them as a non-submission would punish them for their teacher's backlog.
 */
async function quizSignals(classId) {
  const snap = await getDocs(
    query(collection(db, 'quiz_attempts'), where('class_id', '==', classId)),
  )
  const scored = {}
  const attempted = {}
  snap.docs.forEach((d) => {
    const a = d.data()
    ;(attempted[a.student_id] ??= new Set()).add(a.quiz_id)
    // total_score is the field every teacher view reads; an attempt without it
    // is awaiting manual grading, not a zero.
    if (a.total_score == null || !a.total_possible) return
    ;(scored[a.student_id] ??= []).push(a)
  })

  return {
    attempted,
    byStudent: Object.fromEntries(
      Object.entries(scored).map(([id, list]) => [
        id,
        {
          best: Math.max(...list.map((a) => (a.total_score / a.total_possible) * 100)),
          trend: quizTrendFromAttempts(list),
        },
      ]),
    ),
  }
}

/** Every quiz pointed at this class, drafts included -- missedQuizCounts
 *  decides which of them were actually expected of a given student. */
async function classQuizzes(classId) {
  const snap = await getDocs(
    query(collection(db, 'quizzes'), where('class_ids', 'array-contains', classId)),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Every graded assessment in this class, for the missing-work counts. */
async function classAssessments(classId) {
  const snap = await getDocs(collection(db, 'gradebooks', classId, 'assessments'))
  return snap.docs.map((d) => d.data())
}

/**
 * `students` is `[{ student_id, grade }]` -- the caller already has grades
 * loaded, and refetching the gradebook here would double the work on a page
 * that just computed it.
 */
export function useClassRisk(classId, students, options = {}) {
  const ids = (students ?? []).map((s) => s.student_id).sort().join(',')
  const { profile } = useAuth()

  return useQuery({
    ...options,
    queryKey: ['class-risk', classId, ids],
    enabled: !!classId && (students ?? []).length > 0 && (options.enabled ?? true),
    // The model is deterministic for a given input, so there is nothing to gain
    // from refetching on every focus.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [attendance, quizzes, assessments, quizBank] = await Promise.all([
        attendanceSignals(classId),
        quizSignals(classId),
        classAssessments(classId),
        classQuizzes(classId),
      ])

      // One clock for the whole class, so two students are never judged
      // against a quiz deadline that fell between their two evaluations.
      const now = Date.now()

      const payload = students.map((s) => ({
        studentId: s.student_id,
        indicators: {
          attendanceRate: attendance[s.student_id]?.rate,
          attendanceTrend: attendance[s.student_id]?.trend,
          priorAverageGrade: s.grade ?? undefined,
          quizAverage: quizzes.byStudent[s.student_id]?.best,
          quizTrend: quizzes.byStudent[s.student_id]?.trend,
          // Pooled: assessments the teacher marked missing, plus quizzes whose
          // window closed with no attempt. The second half is invisible in
          // quiz_attempts by construction -- there is no document to find.
          missingWorkRate: missingRate(
            missingWorkCounts(assessments, s.student_id),
            missedQuizCounts(quizBank, quizzes.attempted[s.student_id], s.student_id, now),
          ),
        },
      }))

      const results = await predictRiskBatch(payload)
      const byStudent = Object.fromEntries(results.map((r) => [r.studentId, r]))

      /* Write the run down. Derived data, so a failure here is not the caller's
         problem -- the panel renders from `byStudent` either way and the next
         load recomputes. Only a teacher who owns the class may write, which the
         rules enforce; for anyone else this is a no-op that is swallowed. */
      saveClassPerformance({
        classId,
        teacherId: profile?.id,
        entries: payload.map((p) => ({
          studentId: p.studentId,
          indicators: p.indicators,
          grade: students.find((s) => s.student_id === p.studentId)?.grade ?? null,
          result: byStudent[p.studentId],
        })),
      }).catch(() => { /* snapshot is best-effort */ })

      return byStudent
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
  'Projected from attendance, grades and quiz scores and the direction each ' +
  'is moving. A guide for where to look now, not a judgement about a student.'
