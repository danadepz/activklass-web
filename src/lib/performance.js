/**
 * Persist the model's output to `student_performance`.
 *
 * Owned by the logic lane (see OWNERSHIP.md).
 *
 * Until now the at-risk classification existed only in the browser: computed
 * from attendance, quiz attempts and the gradebook, rendered, and forgotten.
 * That left three of the confirmed modules ("Identify At-Risk Students", "View
 * Subject Analytics", "Predict Class Standing") with nothing behind them, and
 * left the `can_view_analytics` guardian scope gating a document that did not
 * exist -- a parent could be granted a permission with nothing to read.
 *
 * One document per student per class, overwritten on each run. Deliberately NOT
 * a time series: a history means deciding retention and defending why
 * yesterday's projection differs from today's, which is a separate feature. The
 * snapshot is what the module list asks for.
 *
 * Written from the read path (useClassRisk) rather than from the gradebook
 * save, on purpose. The prediction needs /api/predict, and putting a call to
 * the Flask AI service inside the grade-saving transaction would mean an AI
 * outage could stop a teacher recording marks. Here the worst case is that a
 * snapshot is a few minutes stale.
 *
 * Every write is best-effort. This is derived data that can be recomputed on
 * the next page load, so a failure must never surface as an error on a panel
 * the teacher opened to read something else.
 */
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/** Firestore rejects `undefined`; unmeasured indicators are absent, not zero. */
function defined(obj) {
  return Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => v !== undefined))
}

/** `{classId}_{studentId}` -- one open snapshot per student per class. */
export function performanceDocId(classId, studentId) {
  return `${classId}_${studentId}`
}

/**
 * @param classId    the class these predictions belong to
 * @param teacherId  uid of the teacher whose view produced them
 * @param entries    `[{ studentId, indicators, grade, result }]`, where
 *                   `result` is one shaped prediction from predictRiskBatch
 */
export async function saveClassPerformance({ classId, teacherId, entries }) {
  const rows = (entries ?? []).filter((e) => e?.studentId && e?.result)
  if (!classId || !rows.length) return 0

  // A writeBatch caps at 500 operations. A class never approaches that, but the
  // cap is silent -- commit() rejects and NOTHING is written -- so chunk anyway
  // rather than leave a section size that quietly breaks the whole save.
  let written = 0
  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db)
    for (const { studentId, indicators, grade, result } of rows.slice(i, i + 400)) {
      batch.set(
        doc(db, 'student_performance', performanceDocId(classId, studentId)),
        {
          class_id: classId,
          student_id: studentId,
          risk_flag: result.flag ?? null,
          at_risk: result.atRisk === true,
          risk_probability: result.probability ?? null,
          // How much of the model's basis was actually measured. A confident
          // probability at low coverage is the backend's defaults talking, so
          // storing the flag without this would preserve a claim we cannot make.
          coverage: result.coverage ?? null,
          // Which of THIS student's indicators are out of band -- the
          // explainable part, and the only part a teacher can act on.
          signals: result.signals ?? [],
          missing_indicators: result.missing ?? [],
          indicators: defined(indicators),
          computed_grade: grade ?? null,
          // Carried through rather than restated: while the model is fitted on
          // a synthetic dataset, every stored row says so.
          model_training: result.training ?? null,
          generated_by: teacherId ?? null,
          generated_at: serverTimestamp(),
        },
        { merge: true },
      )
      written += 1
    }
    await batch.commit()
  }
  return written
}
