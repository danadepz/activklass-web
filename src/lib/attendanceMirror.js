import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Project one student's attendance out of the class sheet.
 *
 * A day of attendance is stored as ONE document per class —
 * `classes/{classId}/attendance/{date}` with a `records` map keyed by student
 * id. That shape is right for the teacher, who edits a whole class at a time,
 * and impossible for a guardian: rules allow or deny a document whole, so
 * letting a parent read it would hand them every classmate's record.
 *
 * So each student gets their own document. Same answer the gradebook already
 * reached with `gradebooks/{classId}/entries/{studentId}`, for the same reason.
 *
 * The class sheet stays the source of truth. This is a projection, rebuilt from
 * it on every save, so the two cannot drift into disagreement — a partial
 * update would have to be merged and could go stale; a rebuild cannot.
 */

const EMPTY_TALLY = { present: 0, late: 0, absent: 0, excused: 0 }

export function summaryId(classId, studentId) {
  return `${classId}_${studentId}`
}

/**
 * Rebuild the per-student summaries for one class from its attendance sheets.
 *
 * Called after the teacher saves a day. Reads every day document once and
 * writes one summary per student, which is cheaper and far less error-prone
 * than trying to patch each summary with the single day that changed.
 *
 * `studentIds` comes from the class roster rather than from the sheets, so a
 * student with no records yet still gets a summary saying so — otherwise their
 * guardian sees a permission error where the honest answer is "nothing
 * recorded".
 */
export async function syncAttendanceSummaries(classId, studentIds) {
  const daysSnap = await getDocs(collection(db, 'classes', classId, 'attendance'))

  // studentId -> { date -> record }
  const byStudent = new Map(studentIds.map((id) => [id, {}]))
  daysSnap.forEach((d) => {
    const data = d.data()
    const date = data.date ?? d.id
    const records = data.records ?? {}
    for (const [sid, rec] of Object.entries(records)) {
      if (!rec?.status) continue
      // A student removed from the roster keeps no summary; skipping them here
      // means their stale document is deleted by the caller, not resurrected.
      if (!byStudent.has(sid)) continue
      byStudent.get(sid)[date] = {
        status: rec.status,
        remarks: rec.remarks ?? '',
        excuse_url: rec.excuse_url ?? null,
      }
    }
  })

  // writeBatch caps at 500 operations; past that commit() rejects and NOBODY
  // is updated, so a large roster degrades into several commits.
  const entries = [...byStudent.entries()]
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db)
    for (const [studentId, days] of entries.slice(i, i + 400)) {
      const tally = { ...EMPTY_TALLY }
      for (const rec of Object.values(days)) {
        if (rec.status in tally) tally[rec.status] += 1
      }
      const counted = tally.present + tally.late + tally.absent + tally.excused
      batch.set(doc(db, 'attendance_summaries', summaryId(classId, studentId)), {
        class_id: classId,
        student_id: studentId,
        days,
        tally,
        // Same formula the student's own view uses (lib/studentData.js), so the
        // two never quote a parent and a student different percentages.
        rate: counted ? Math.round((tally.present / counted) * 100) : null,
        updated_at: serverTimestamp(),
      })
    }
    await batch.commit()
  }

  return entries.length
}
