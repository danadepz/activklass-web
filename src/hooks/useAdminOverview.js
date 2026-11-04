/**
 * School-wide data for the admin's oversight and reports.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Firestore reads, joined in
 * memory.
 *
 * Scoping history:
 * - T-126 narrowed `users/{uid}` to sameSchoolAsCaller, so `users` requires
 *   `where('school_id', '==', schoolId)` (T-167).
 * - T-203 (audit F-02) narrowed `classes` to `sameSchoolAsUser(teacher_id)`
 *   and `quiz_attempts` to `sameSchoolAsUser(student_id)`. Unscoped reads of
 *   `classes` or `quiz_attempts` can no longer be proven by the rules engine
 *   and Firestore rejects them outright with "Missing or insufficient permissions."
 * - Therefore, after scoping `users` by `school_id`, `classes` is queried
 *   by `where('teacher_id', 'in', chunk)` for this school's teachers, and
 *   `quiz_attempts` is queried by `where('student_id', 'in', chunk)` for this
 *   school's students.
 * - Chunk size is capped at 10 (not the 30-item array IN limit) because Cloud
 *   Firestore limits security rule document lookups (`get()`) to under 20 calls
 *   per query evaluation: an IN query with >15 items causes the rules engine
 *   to exceed its document access limit and fail with PERMISSION_DENIED.
 * - `quizzes` read rule remains `signedIn()` (metadata-only), so it can still
 *   be enumerated or filtered.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const adminOverviewKey = ['fs-admin-overview']

// Maximum IDs per IN query: kept at 10 to ensure Cloud Firestore's document
// lookup limit (get() in security rules) is never exceeded during rule evaluation.
const CHUNK_SIZE = 10

const all = async (name) => {
  const snap = await getDocs(collection(db, name))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

const usersInSchool = async (schoolId) => {
  const snap = await getDocs(query(collection(db, 'users'), where('school_id', '==', schoolId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

const classesForTeachers = async (teacherIds) => {
  if (!teacherIds.length) return []
  const chunks = []
  for (let i = 0; i < teacherIds.length; i += CHUNK_SIZE) {
    chunks.push(teacherIds.slice(i, i + CHUNK_SIZE))
  }
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(db, 'classes'), where('teacher_id', 'in', chunk))),
    ),
  )
  return snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
}

const attemptsForStudents = async (studentIds) => {
  if (!studentIds.length) return []
  const chunks = []
  for (let i = 0; i < studentIds.length; i += CHUNK_SIZE) {
    chunks.push(studentIds.slice(i, i + CHUNK_SIZE))
  }
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(db, 'quiz_attempts'), where('student_id', 'in', chunk))),
    ),
  )
  return snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
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

  const users = await usersInSchool(schoolId)
  const byId = Object.fromEntries(users.map((u) => [u.id, u]))
  const schoolTeacherIds = new Set(users.filter((u) => u.role === 'teacher').map((u) => u.id))
  const teacherIds = Array.from(schoolTeacherIds)
  const studentIds = users.filter((u) => u.role === 'student').map((u) => u.id)

  const [allClasses, allQuizzes, allAttempts] = await Promise.all([
    classesForTeachers(teacherIds),
    all('quizzes'),
    attemptsForStudents(studentIds),
  ])

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
