/**
 * School-wide data for the admin's oversight and reports.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Everything here is a plain
 * Firestore read: firestore.rules grants isAdmin() read on every collection
 * involved, so class oversight and school-wide statistics need no endpoint.
 *
 * One query per collection, joined in memory. At pilot scale that is far
 * cheaper than per-class fan-out; if the school grows past a few thousand
 * attempts this should move to aggregated counters written on submit.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const adminOverviewKey = ['fs-admin-overview']

const all = async (name) => {
  const snap = await getDocs(collection(db, name))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** A quiz may link to classes by array or by the legacy scalar. */
function classIdsOf(quiz) {
  if (Array.isArray(quiz.class_ids) && quiz.class_ids.length) return quiz.class_ids
  return quiz.class_id ? [quiz.class_id] : []
}

export async function fetchOverview() {
  const [users, classes, quizzes, attempts] = await Promise.all([
    all('users'),
    all('classes'),
    all('quizzes'),
    all('quiz_attempts'),
  ])

  const byId = Object.fromEntries(users.map((u) => [u.id, u]))
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

export function useAdminOverview(options = {}) {
  return useQuery({ ...options, queryKey: adminOverviewKey, queryFn: fetchOverview })
}
