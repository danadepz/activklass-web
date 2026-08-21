/**
 * Reading a class gradebook, computing its grades, and publishing them.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Lifted out of
 * routes/teacher/classes/$classId/record.jsx unchanged: the record page was
 * the only writer of scores, so keeping the loader and `syncEntries` inside it
 * cost nothing. It is no longer the only writer -- posting a quiz's scores and
 * applying a remediation recovery both change `assessments` from other pages,
 * and an entry left unsynced is a grade the student cannot see.
 *
 * `entries` is the crux: it is the ONLY grade document a student is permitted
 * to read, and it is derived, not authoritative. Anything that touches a score
 * must call `syncEntries` afterwards or the student keeps reading the old one.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { fetchUsersByIds } from '@/lib/roster'
import { computeFinalGrade, finalAcrossPeriods } from '@/lib/grading'

export async function loadBundle(classId) {
  const gbSnap = await getDoc(doc(db, 'gradebooks', classId))
  const gb = gbSnap.exists() ? gbSnap.data() : {}
  const configured = Boolean(gb.configured && gb.periods?.length && gb.components?.length)

  const classSnap = await getDoc(doc(db, 'classes', classId))
  if (!classSnap.exists()) throw new Error('Class not found')
  const klass = classSnap.data()
  const ids = klass.student_ids ?? []
  const users = ids.length ? await fetchUsersByIds(ids) : []
  const students = users
    .map((u) => ({ student_id: u.id, first_name: u.first_name, last_name: u.last_name }))
    .sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
    )

  let assessments = []
  if (configured) {
    const aSnap = await getDocs(collection(db, 'gradebooks', classId, 'assessments'))
    assessments = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }

  return {
    configured,
    periods: gb.periods ?? [],
    components: gb.components ?? [],
    mode: gb.grading_mode ?? 'deped_k12',
    overrides: gb.overrides ?? {},
    students,
    assessments,
    /* Class identity, carried so syncEntries can stamp it onto each entry.
       A guardian may read their child's entry but NOT classes/{id} -- that doc
       holds student_ids, the whole roster -- so without this the parent app
       gets a grade it cannot label with the subject it belongs to. */
    klass: {
      subject: klass.subject ?? null,
      subject_code: klass.subject_code ?? null,
      section: klass.section ?? null,
      grade_level: klass.grade_level ?? null,
    },
  }
}

/* One student's grade for one period: component breakdown + (transmuted) grade,
   honouring a manual override. */
function gradeForPeriod(bundle, periodAssessments, studentId, periodId) {
  const studentScores = {}
  for (const a of periodAssessments) {
    const sc = a.scores?.[studentId]
    if (sc) studentScores[a.id] = sc
  }
  const componentsWithA = bundle.components.map((c) => ({
    ...c,
    assessments: periodAssessments.filter((a) => a.component_id === c.id),
  }))
  const { final, breakdown } = computeFinalGrade(componentsWithA, studentScores, bundle.mode)
  const override = bundle.overrides?.[periodId]?.[studentId]
  return {
    components: breakdown,
    period_grade: final,
    override: override ?? null,
    grade: override != null ? override : final,
  }
}

/* Shape one period's view the way RecordGrid expects it. */
export function buildPeriodRecord(bundle, periodId) {
  const period = bundle.periods.find((p) => p.id === periodId) ?? bundle.periods[0]
  const periodAssessments = bundle.assessments.filter((a) => a.period_id === period.id)
  const scores = {}
  for (const a of periodAssessments) scores[a.id] = a.scores ?? {}
  const grades = {}
  for (const s of bundle.students) {
    grades[s.student_id] = gradeForPeriod(bundle, periodAssessments, s.student_id, period.id)
  }
  return {
    periods: bundle.periods,
    period,
    components: bundle.components,
    assessments: periodAssessments,
    scores,
    students: bundle.students,
    grades,
  }
}

/* Shape the cross-period summary the way SummaryView expects it. */
export function buildSummary(bundle) {
  const grades = {}
  for (const s of bundle.students) {
    const perPeriod = {}
    const values = {}
    for (const p of bundle.periods) {
      const periodAssessments = bundle.assessments.filter((a) => a.period_id === p.id)
      const g = gradeForPeriod(bundle, periodAssessments, s.student_id, p.id)
      perPeriod[p.id] = { grade: g.grade, computed: g.period_grade, override: g.override }
      values[p.id] = g.grade
    }
    grades[s.student_id] = {
      periods: perPeriod,
      final_grade: finalAcrossPeriods(values, bundle.periods, bundle.mode),
    }
  }
  return { periods: bundle.periods, students: bundle.students, grades }
}

/* Persist each student's computed grade to gradebooks/{classId}/entries/{id}.
   This is the ONLY grade document a student is permitted to read (their own),
   so it must be kept in sync whenever scores or overrides change. Safe to call
   after any save — it recomputes from a fresh bundle (teacher-readable). */
export async function syncEntries(classId) {
  const bundle = await loadBundle(classId)
  if (!bundle.configured) return
  const summary = buildSummary(bundle)

  // Class average per assessment (mean of graded scores). This is a safe
  // aggregate to expose to a student; individual peer scores are never written
  // into anyone's entry — only the student's own raw_score is.
  const classAvg = {}
  for (const a of bundle.assessments) {
    const vals = Object.values(a.scores ?? {})
      .filter((sc) => sc?.status === 'graded' && sc.raw_score != null)
      .map((sc) => sc.raw_score)
    classAvg[a.id] = vals.length
      ? Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 100) / 100
      : null
  }
  const components = bundle.components.map((c) => ({
    id: c.id,
    name: c.name,
    weight_percent: c.weight_percent,
  }))

  const batch = writeBatch(db)
  for (const s of bundle.students) {
    const g = summary.grades[s.student_id]
    const computed = {}
    for (const p of bundle.periods) computed[p.id] = g.periods[p.id]?.grade ?? null
    // Per-assessment breakdown with ONLY this student's score (+ class average),
    // so they can see exactly where they're struggling.
    const assessments = bundle.assessments.map((a) => {
      const sc = a.scores?.[s.student_id]
      return {
        id: a.id,
        title: a.title ?? 'Untitled',
        component_id: a.component_id,
        period_id: a.period_id,
        total_points: a.total_points ?? 0,
        date_given: a.date_given ?? null,
        raw_score: sc?.status === 'graded' ? sc.raw_score : null,
        status: sc?.status ?? 'pending',
        class_average: classAvg[a.id],
      }
    })
    batch.set(
      doc(db, 'gradebooks', classId, 'entries', s.student_id),
      {
        student_id: s.student_id,
        // Denormalised so the entry is self-describing: see loadBundle.
        class_id: classId,
        subject: bundle.klass.subject,
        subject_code: bundle.klass.subject_code,
        section: bundle.klass.section,
        grade_level: bundle.klass.grade_level,
        final_grade: g.final_grade,
        computed_grades: computed,
        periods: bundle.periods.map((p) => ({
          id: p.id,
          name: p.name,
          grade: g.periods[p.id]?.grade ?? null,
        })),
        components,
        assessments,
        mode: bundle.mode,
        updated_at: serverTimestamp(),
      },
      { merge: true },
    )
  }
  await batch.commit()
}
