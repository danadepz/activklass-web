/**
 * Every student across every class the signed-in teacher owns, one row per
 * (student, class) pair.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Grades and risk are both
 * computed per class elsewhere (reports.jsx, useClassRisk) -- a student doing
 * fine in one class and struggling in another would be misrepresented by a
 * single blended row, so this deliberately does not average across a
 * student's classes.
 *
 * Risk is the Random Forest's own probability, not a grade cutoff: unlike a
 * fixed "below 85" line, `risk_probability` is a real 0-1 scale that already
 * weighs attendance trend, quiz trend and missing work alongside the grade
 * (see useClassRisk.js), and is where new indicators land as the model grows
 * -- a static threshold here would drift out of step with it. It's read from
 * the `student_performance` snapshot useClassRisk writes when a teacher opens
 * a class's Performance tab, not recomputed here: firing /api/predict for
 * every student in every class on every visit to a directory page is not what
 * a lookup/sort tool needs. A class whose Performance tab was never opened
 * has no snapshot yet, and that student's risk reads as unknown, not safe.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import { fetchUsersByIds } from '@/lib/roster'
import { computeStudentFinal } from '@/lib/gradebook'
import { performanceDocId } from '@/lib/performance'

const classLabel = (c) =>
  c.subject_code ? `${c.subject_code} · ${c.section ?? ''}`.trim() : c.section || c.subject || c.name || 'Class'

/**
 * Best-effort read of this class's student_performance snapshots, keyed by
 * student id -> risk_probability. `at_risk` isn't read separately: it's the
 * backend's own flag at the same 0.5 line the caller buckets on, so nothing
 * is lost by deriving it from the probability instead of carrying both.
 */
async function loadRiskByStudent(classId, studentIds) {
  const ids = studentIds.map((sid) => performanceDocId(classId, sid))
  const byStudent = {}
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30)
    try {
      const snap = await getDocs(
        query(collection(db, 'student_performance'), where(documentId(), 'in', chunk), where('class_id', '==', classId)),
      )
      snap.forEach((d) => {
        const data = d.data()
        byStudent[data.student_id] = data.risk_probability ?? null
      })
    } catch {
      // Snapshot is optional -- a missing/unreadable chunk just leaves those
      // students without a risk score, not an error for the whole page.
    }
  }
  return byStudent
}

async function loadClassRows(c) {
  const ids = c.student_ids ?? []
  if (ids.length === 0) return []

  const [gbSnap, users] = await Promise.all([
    getDoc(doc(db, 'gradebooks', c.id)),
    fetchUsersByIds(ids),
  ])
  const gb = gbSnap.exists() ? gbSnap.data() : {}
  const configured = Boolean(gb.configured && gb.periods?.length && gb.components?.length)

  let assessments = []
  if (configured) {
    const aSnap = await getDocs(collection(db, 'gradebooks', c.id, 'assessments'))
    assessments = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }

  const risk = await loadRiskByStudent(c.id, ids)

  return users.map((u) => {
    const grade = configured
      ? computeStudentFinal(u.id, gb.periods, gb.components, assessments, gb.overrides ?? {}, gb.grading_mode ?? 'deped_k12')
      : null
    return {
      studentId: u.id,
      firstName: u.first_name ?? '',
      lastName: u.last_name ?? '',
      lrn: u.lrn ?? u.student_number ?? null,
      classId: c.id,
      classLabel: classLabel(c),
      subject: c.subject ?? c.subject_title ?? '',
      mode: gb.grading_mode ?? 'deped_k12',
      configured,
      grade,
      riskProbability: risk[u.id] ?? null,
    }
  })
}

export function useTeacherStudents(options = {}) {
  const { profile } = useAuth()
  const { data: classes } = useTeacherClasses()

  return useQuery({
    ...options,
    queryKey: ['fs-student-directory', profile?.id],
    enabled: !!profile?.id && !!classes && (options.enabled ?? true),
    queryFn: async () => {
      const rows = await Promise.all((classes ?? []).map(loadClassRows))
      return rows.flat()
    },
  })
}
