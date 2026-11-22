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
 *  a reassuring claim we would not have earned. Partial histories stay unknown:
 *  the backend requires all six features and does not impute neutral defaults.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { predictRiskBatch } from '@/lib/ai'
import { saveClassPerformance } from '@/lib/performance'
import {
  MIN_ATTENDANCE_DAYS,
  attendanceRateFromMarks,
  DAY_WEIGHT,
  missedQuizCounts,
  missingRate,
  missingWorkCounts,
  quizAverageFromAttempts,
  quizDueDates,
  quizEvidence,
  quizTrendFromAttempts,
  splitTrend,
  workEvidence,
} from '@/lib/riskSignals'
import { sessionLedger, studentAttendanceEvidence } from '@/lib/attendanceSessions'
import { fetchClassExcusals } from '@/lib/quizExcusals'

/**
 * Attendance per student from the date-keyed subcollection, through the
 * session ledger: cancelled and moved-away dates never count, and a held
 * session with no mark for a student is "not recorded", never absent.
 * Returns the raw day documents too, for the class-level coverage figures.
 */
async function attendanceSignals(classId) {
  const snap = await getDocs(collection(db, 'classes', classId, 'attendance'))
  const days = snap.docs.map((d) => ({ id: d.id, ...d.data(), date: d.data().date ?? d.id }))
  const forStudent = (studentId) => {
    const ev = studentAttendanceEvidence(days, studentId)
    return {
      rate: attendanceRateFromMarks(ev.statuses),
      trend: splitTrend(ev.statuses.map((s) => DAY_WEIGHT[s]), MIN_ATTENDANCE_DAYS),
      evidence: {
        held_sessions: ev.heldSessions,
        marks: ev.statuses.length,
        excused: ev.excused,
        not_recorded: ev.notRecorded,
      },
    }
  }
  return { days, forStudent }
}

/**
 * Quiz level and trend per student, over DISTINCT graded quizzes (best scored
 * attempt each), plus which quizzes were attempted at all.
 *
 * The level used to be the single best attempt across every quiz -- one good
 * quiz hid four poor ones -- while the student's own forecast averaged per
 * quiz. Both now use quizAverageFromAttempts.
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
  const byStudent = {}
  const attempted = {}
  snap.docs.forEach((d) => {
    const a = d.data()
    // shortcut: an in_progress attempt still counts as "attempted" (unchanged
    // behaviour; it carries no score). Whether an abandoned attempt on a closed
    // quiz is missing work is an open policy question -- see the report.
    ;(attempted[a.student_id] ??= new Set()).add(a.quiz_id)
    ;(byStudent[a.student_id] ??= []).push(a)
  })

  return { attempted, byStudent }
}

/**
 * Level, trend and evidence for one student's attempts. The trend orders
 * quizzes by their authoritative due dates (policy A3), which needs the quiz
 * list and the record columns -- so it runs once everything is loaded.
 */
function quizFigures(list, quizDates) {
  return {
    average: quizAverageFromAttempts(list),
    trend: quizTrendFromAttempts(list, quizDates),
    evidence: quizEvidence(list, quizDates),
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
  // `riskGrade` when the caller supplies one -- null there means "no valid
  // graded work" (A2) and must NOT fall back to the displayed grade.
  const gradeOf = (s) => ('riskGrade' in s ? s.riskGrade : s.grade) ?? undefined
  const grades = JSON.stringify((students ?? []).map((s) => [s.student_id, gradeOf(s) ?? null]))
  const { profile } = useAuth()

  return useQuery({
    ...options,
    queryKey: ['class-risk', classId, ids, grades],
    enabled: !!classId && (students ?? []).length > 0 && (options.enabled ?? true),
    // The model is deterministic for a given input, so there is nothing to gain
    // from refetching on every focus.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [attendance, quizzes, assessments, quizBank, classSnap, excused] = await Promise.all([
        attendanceSignals(classId),
        quizSignals(classId),
        classAssessments(classId),
        classQuizzes(classId),
        getDoc(doc(db, 'classes', classId)),
        // Official quiz excusals (A4). Readable only by the class's teacher,
        // which is who runs this; a refused read means none can be shown here,
        // and missing work is then computed as before rather than not at all.
        fetchClassExcusals(db, classId).catch(() => ({})),
      ])
      const quizDates = quizDueDates(quizBank, assessments)
      const quizBy = Object.fromEntries(students.map((s) => [s.student_id, quizFigures(quizzes.byStudent[s.student_id] ?? [], quizDates)]))

      // One clock for the whole class, so two students are never judged
      // against a quiz deadline that fell between their two evaluations.
      const now = Date.now()
      const today = new Date(now)
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      // Class-level: planned vs confirmed meetings. Disclosed, never used to
      // invent absences -- see attendanceSessions.js.
      // From the class's own start date (A1) when it has one; a legacy class
      // counts from its first recorded day and the coverage line says so.
      const cls = classSnap.data() ?? {}
      const ledger = sessionLedger(attendance.days, cls.schedule ?? null, todayIso, cls.start_date)
      const sessions = { ...ledger.counts, start: ledger.start, start_source: ledger.startSource }

      const att = Object.fromEntries(students.map((s) => [s.student_id, attendance.forStudent(s.student_id)]))
      const evidence = Object.fromEntries(students.map((s) => [s.student_id, {
        sessions,
        attendance: att[s.student_id].evidence,
        quizzes: quizBy[s.student_id].evidence,
        work: workEvidence(assessments, quizBank, quizzes.attempted[s.student_id], s.student_id, now, excused[s.student_id]),
      }]))

      const payload = students.map((s) => ({
        studentId: s.student_id,
        indicators: {
          attendanceRate: att[s.student_id].rate,
          attendanceTrend: att[s.student_id].trend,
          priorAverageGrade: gradeOf(s),
          quizAverage: quizBy[s.student_id].average,
          quizTrend: quizBy[s.student_id].trend,
          // Pooled: assessments the teacher marked missing, plus quizzes whose
          // window closed with no attempt. The second half is invisible in
          // quiz_attempts by construction -- there is no document to find.
          missingWorkRate: missingRate(
            missingWorkCounts(assessments, s.student_id),
            missedQuizCounts(quizBank, quizzes.attempted[s.student_id], s.student_id, now, excused[s.student_id]),
          ),
        },
      }))

      const results = await predictRiskBatch(payload)
      // Evidence rides beside the model's answer; it never changes it. Six
      // present features are what the model needs -- the counts are what a
      // teacher needs to judge how much that answer rests on.
      const byStudent = Object.fromEntries(
        results.map((r) => [r.studentId, { ...r, evidence: evidence[r.studentId] ?? null }]),
      )

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
  'Risk is an early guide only. It uses sample data, not real ActivKlass results yet. ' +
  'Use it as a reminder to check on the student, not as a final result.'
