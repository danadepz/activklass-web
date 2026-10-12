/**
 * School-wide data for the admin's oversight and reports.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Firestore reads, joined in
 * memory. firestore.rules lets isAdmin() read `classes`, `quizzes` and
 * `quiz_attempts` unconditionally (none of those three rules reference
 * resource.data in that branch, so an unscoped list is provable and passes)
 * -- but `users/{uid}` was narrowed by T-126 to isAdmin() && sameSchoolAsCaller,
 * which an unscoped `getDocs(collection(db,'users'))` can never prove, and
 * Firestore refuses the whole call (T-167). The users read below carries the
 * same `where('school_id','==',schoolId)` filter `useAdminUsers.js` already
 * uses for exactly that reason.
 *
 * Reading `classes`/`quizzes`/`quiz_attempts` unscoped is rule-legal for an
 * admin but not what this screen means by "school-wide" -- a class belongs to
 * this oversight view only if its teacher is one of this school's own users,
 * so classes/quizzes/attempts are filtered down to that set after the users
 * read comes back scoped. No change to firestore.rules; this stays a
 * client-side join, same as `rows.map` already did for teacher names.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const adminOverviewKey = ['fs-admin-overview']

const all = async (name) => {
  const snap = await getDocs(collection(db, name))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

const usersInSchool = async (schoolId) => {
  const snap = await getDocs(query(collection(db, 'users'), where('school_id', '==', schoolId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** A quiz may link to classes by array or by the legacy scalar. */
function classIdsOf(quiz) {
  if (Array.isArray(quiz.class_ids) && quiz.class_ids.length) return quiz.class_ids
  return quiz.class_id ? [quiz.class_id] : []
}

const emptyOverview = {
  rows: [],
  users: [],
  stats: { totalUsers: 0, activeUsers: 0, teachers: 0, students: 0, parents: 0,
           classes: 0, activeClasses: 0, quizzes: 0, attempts: 0, schoolAverage: null },
}

export async function fetchOverview(schoolId) {
  if (!schoolId) return emptyOverview

  const [users, allClasses, allQuizzes, allAttempts] = await Promise.all([
    usersInSchool(schoolId),
    all('classes'),
    all('quizzes'),
    all('quiz_attempts'),
  ])

  const byId = Object.fromEntries(users.map((u) => [u.id, u]))
  const schoolTeacherIds = new Set(users.filter((u) => u.role === 'teacher').map((u) => u.id))
  const classes = allClasses.filter((c) => schoolTeacherIds.has(c.teacher_id))
  const classIds = new Set(classes.map((c) => c.id))
  const quizzes = allQuizzes.filter((q) => classIdsOf(q).some((id) => classIds.has(id)))
  const attempts = allAttempts.filter((a) => classIds.has(a.class_id))

  const attemptsByClass = {}
  attempts.forEach((a) => {
    if (!a.class_id) return
    ;(attemptsByClass[a.class_id] ??= []).push(a)
  })

  const rows = classes.map((c) => {
    const classAttempts = attemptsByClass[c.id] ?? []
    // total_score is the field every teacher view reads; an attempt without it
    // is ungraded rather than zero, so it must not drag the average down.
    const scored = classAttempts.filter((a) => a.total_score != null && a.total_possible)
    const avg = scored.length
      ? Math.round(
          (scored.reduce((s, a) => s + (a.total_score / a.total_possible) * 100, 0) / scored.length) * 10,
        ) / 10
      : null
    const teacher = byId[c.teacher_id]
    return {
      id: c.id,
      section: c.section ?? c.name ?? '(untitled)',
      subject: c.subject ?? '—',
      teacherName: teacher ? `${teacher.last_name}, ${teacher.first_name}` : '(unassigned)',
      teacherId: c.teacher_id ?? null,
      studentCount: (c.student_ids ?? []).length,
      quizCount: quizzes.filter((q) => classIdsOf(q).includes(c.id)).length,
      attemptCount: classAttempts.length,
      gradedCount: scored.length,
      averagePct: avg,
      archived: !!c.archived_at,
    }
  })

  const activeUsers = users.filter((u) => (u.status ?? 'active') === 'active')
  const graded = attempts.filter((a) => a.total_score != null && a.total_possible)

  return {
    rows,
    users,
    stats: {
      totalUsers: users.length,
      activeUsers: activeUsers.length,
      teachers: users.filter((u) => u.role === 'teacher').length,
      students: users.filter((u) => u.role === 'student').length,
      parents: users.filter((u) => u.role === 'parent').length,
      classes: classes.length,
      activeClasses: classes.filter((c) => !c.archived_at).length,
      quizzes: quizzes.length,
      attempts: attempts.length,
      schoolAverage: graded.length
        ? Math.round(
            (graded.reduce((s, a) => s + (a.total_score / a.total_possible) * 100, 0) / graded.length) * 10,
          ) / 10
        : null,
    },
  }
}

export function useAdminOverview(schoolId, options = {}) {
  return useQuery({
    ...options,
    queryKey: [...adminOverviewKey, schoolId],
    queryFn: () => fetchOverview(schoolId),
    enabled: Boolean(schoolId),
  })
}
