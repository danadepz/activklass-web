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
import { fetchUsersByIds, IN_CHUNK } from '@/lib/roster'
import { computeStudentFinal } from '@/lib/gradebook'
import { gradePolicy } from '@/lib/grading'
import { performanceDocId } from '@/lib/performance'

const classLabel = (c) =>
  c.subject_code ? `${c.subject_code} · ${c.section ?? ''}`.trim() : c.section || c.subject || c.name || 'Class'

/**
 * Best-effort read of this class's student_performance snapshots, keyed by
 * student id -> { probability, training }. `at_risk` isn't read separately:
 * it's the backend's own flag at the same 0.5 line the caller buckets on, so
 * nothing is lost by deriving it from the probability instead of carrying
 * both.
 *
 * `model_training` rides along because the model is still trained on generated
 * data (risk_model.py TRAINING_BASIS, real_data: false). This page used to
 * keep the probability alone, so a teacher read "High risk 81%" here with
 * nothing saying where the 81% came from -- while the Performance tab, which
 * shows the same number, says so plainly.
 */
async function loadRiskByStudent(classId, studentIds) {
  const ids = studentIds.map((sid) => performanceDocId(classId, sid))
  const byStudent = {}
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK)
    try {
      const snap = await getDocs(
        query(collection(db, 'student_performance'), where(documentId(), 'in', chunk), where('class_id', '==', classId)),
      )
      snap.forEach((d) => {
        const data = d.data()
        byStudent[data.student_id] = {
          probability: data.risk_probability ?? null,
          training: data.model_training ?? null,
        }
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
  const mode = gb.grading_mode ?? 'deped_k12'
  // Pass mark + point-scale direction, defaults filled (lib/grading.js).
  const policy = gradePolicy(gb)

  return users.map((u) => {
    const grade = configured
      ? computeStudentFinal(u.id, gb.periods, gb.components, assessments, gb.overrides ?? {}, mode, policy)
      : null
    return {
      studentId: u.id,
      firstName: u.first_name ?? '',
      lastName: u.last_name ?? '',
      lrn: u.lrn ?? u.student_number ?? null,
      classId: c.id,
      classLabel: classLabel(c),
      subject: c.subject ?? c.subject_title ?? '',
      mode,
      policy,
      configured,
      grade,
      riskProbability: risk[u.id]?.probability ?? null,
      riskTraining: risk[u.id]?.training ?? null,
    }
  })
}

/**
 * Fold the per-class results into one directory. A class that failed keeps
 * its label and error beside the rows of the classes that loaded, so the page
 * can show what it has and name what it could not get -- T-57 was one class
 * refusing and the whole page reading "Could not load students." with the
 * reason swallowed. Only when every class failed is there nothing to show,
 * and then the first error is rethrown so the page's error branch still runs.
 */
export function settleClassRows(classes, settled) {
  const rows = []
  const failed = []
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') rows.push(...r.value)
    else failed.push({ classId: classes[i].id, label: classLabel(classes[i]), error: r.reason })
  })
  if (classes.length > 0 && failed.length === classes.length) throw failed[0].error
  return { rows, failed }
}

export function useTeacherStudents(options = {}) {
  const { profile } = useAuth()
  const { data: classes } = useTeacherClasses()

  return useQuery({
    ...options,
    queryKey: ['fs-student-directory', profile?.id],
    enabled: !!profile?.id && !!classes && (options.enabled ?? true),
    queryFn: async () => {
      const list = classes ?? []
      const settled = await Promise.allSettled(list.map(loadClassRows))
      settled.forEach((r, i) => {
        // The page never shows the reason (a teacher reads what to try, not
        // an exception); the console keeps it for whoever debugs the report.
        if (r.status === 'rejected') console.error(`Students: class ${list[i].id} did not load`, r.reason)
      })
      return settleClassRows(list, settled)
    },
  })
}
