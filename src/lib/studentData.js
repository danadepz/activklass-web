/**
 * Student-side Firestore reads, Firestore-primary (no Flask), and rules-aware.
 *
 * A student may only read documents the security rules expose to them:
 *   - classes/{classId}/syllabus/current      (enrolled students)
 *   - classes/{classId}/attendance/{date}     (enrolled students)
 *   - gradebooks/{classId}/entries/{studentId} (own computed grade only)
 *
 * Crucially, students must NOT read gradebooks/{classId} or its assessments
 * subcollection — those hold every student's raw scores (peer privacy, and the
 * rules deny it). Grades therefore come from the per-student `entries` doc,
 * which the teacher's Class Record writes on save. Every read here is resilient
 * so a single denied/missing doc never blanks the whole page.
 */
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'

/**
 * The student's own computed-grade entry for a class, or null.
 * Shape (written by the teacher Class Record on save):
 *   { student_id, final_grade, computed_grades: { periodId: grade },
 *     periods: [{ id, name, grade }], mode, updated_at }
 */
export async function loadStudentEntry(classId, studentId) {
  try {
    const snap = await getDoc(doc(db, 'gradebooks', classId, 'entries', studentId))
    return snap.exists() ? snap.data() : null
  } catch {
    return null
  }
}

/**
 * One student's attendance across every recorded day in a class.
 * Returns { log: [{ date, status, remarks, excuse_url }], tally, rate }.
 * `rate` = present / (present+late+absent+excused), 0–100, or null.
 */
export async function loadStudentAttendance(classId, studentId) {
  const empty = { log: [], tally: { present: 0, late: 0, absent: 0, excused: 0 }, rate: null }
  try {
    const snap = await getDocs(collection(db, 'classes', classId, 'attendance'))
    const log = []
    const tally = { present: 0, late: 0, absent: 0, excused: 0 }
    snap.forEach((d) => {
      const data = d.data()
      const rec = data.records?.[studentId]
      if (!rec?.status) return
      if (tally[rec.status] != null) tally[rec.status] += 1
      log.push({
        date: data.date ?? d.id,
        status: rec.status,
        remarks: rec.remarks ?? null,
        excuse_url: rec.excuse_url ?? null,
      })
    })
    // Sort through a string key: a Firestore Timestamp in `date` has no
    // localeCompare, and the throw would hit the catch below and blank the
    // student's entire attendance view instead of just misordering it.
    const sortKey = (v) =>
      v && typeof v.toDate === 'function' ? v.toDate().toISOString() : String(v ?? '')
    log.sort((a, b) => sortKey(b.date).localeCompare(sortKey(a.date)))
    const counted = tally.present + tally.late + tally.absent + tally.excused
    const rate = counted ? Math.round((tally.present / counted) * 100) : null
    return { log, tally, rate }
  } catch {
    return empty
  }
}

/**
 * This student's attendance contests for a class, keyed by date.
 * Returns { [date]: { id, status, reason, excuse_url, resolution_note, ... } }.
 */
export async function loadStudentContests(classId, studentId) {
  try {
    const snap = await getDocs(
      query(collection(db, 'attendance_contests'), where('student_id', '==', studentId)),
    )
    const byDate = {}
    snap.forEach((d) => {
      const c = { id: d.id, ...d.data() }
      if (c.class_id === classId) byDate[c.date] = c
    })
    return byDate
  } catch {
    return {}
  }
}

/**
 * This student's grade/score contests for a class, keyed by assessment id.
 * Returns { [assessmentId]: { id, status, reason, excuse_url, resolution_note, ... } }.
 */
export async function loadStudentGradeContests(classId, studentId) {
  try {
    const snap = await getDocs(
      query(collection(db, 'grade_contests'), where('student_id', '==', studentId)),
    )
    const byAssessment = {}
    snap.forEach((d) => {
      const c = { id: d.id, ...d.data() }
      if (c.class_id === classId) byAssessment[c.assessment_id] = c
    })
    return byAssessment
  } catch {
    return {}
  }
}

/** Syllabus modules/topics for a class. Reads syllabus_id from class doc, then loads from top-level /syllabi/{syllabusId} */
export async function loadSyllabus(classId) {
  try {
    const classSnap = await getDoc(doc(db, 'classes', classId))
    if (!classSnap.exists()) return null
    const syllabusId = classSnap.data().syllabus_id
    if (!syllabusId) return null
    const snap = await getDoc(doc(db, 'syllabi', syllabusId))
    return snap.exists() ? snap.data() : null
  } catch {
    return null
  }
}
