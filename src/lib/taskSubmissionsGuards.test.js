/**
 * Guards on the submission bin (docs/plans/modules-content-and-deliverables.md
 * section 9), in the suite that runs on every change.
 *
 * `firestoreRules.test.js` proves the rule against the emulator -- and that
 * the suite bites, five cases red with the block removed -- but that runs
 * only under `npm run test:rules`, which needs Java. Each guard here pins a
 * query or write shape the deployed rule was proven to require, live,
 * through the Firestore REST API on 2026-09-13 (S-5): a refactor that
 * dropped one would pass `npm run test` and be refused on the live project.
 *
 * 1. The teacher's read of a task's bin carries class_id AND task_id. The
 *    rule proves a teacher through the class, so a task_id-only query is
 *    refused even for the owner (live: 403). Dropping the class_id filter
 *    would blank every "N of M submitted" chip.
 * 2. The student's read is by student_id -- the only shape a student may
 *    run (live: a task_id query as Carlo -> 403).
 * 3. The write carries the three identity fields the rule reads, and no
 *    caller may hand the id in: it is the pair, built by submissionId().
 * 4. A paper exam never writes accepts_submissions true: the dialog hides
 *    the box for kind 'exam' and writes false, so a kind change cannot
 *    leave a bin open on an exam.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('the teacher reads a bin with both fields the rule needs', () => {
  const src = read('../hooks/useTaskSubmissions.js')
  const at = src.indexOf("collection(db, 'task_submissions')")
  const queryText = src.slice(at, src.indexOf('))', at))

  it('reads task_submissions at all', () => {
    expect(at, 'no task_submissions read in useTaskSubmissions').toBeGreaterThan(-1)
  })

  it('filters by class_id == and task_id == in the same query', () => {
    expect(queryText).toMatch(/where\(\s*'class_id'\s*,\s*'=='\s*,\s*classId\s*\)/)
    expect(queryText).toMatch(/where\(\s*'task_id'\s*,\s*'=='\s*,\s*taskId\s*\)/)
  })
})

describe('the student reads only their own rows', () => {
  it('useStudentDeliverables reads task_submissions by student_id and nothing else', () => {
    const src = read('../hooks/useStudentDeliverables.js')
    const at = src.indexOf("collection(db, 'task_submissions')")
    expect(at).toBeGreaterThan(-1)
    const queryText = src.slice(at, src.indexOf(')))', at) + 3)
    expect(queryText).toMatch(/where\(\s*'student_id'\s*,\s*'=='\s*,\s*studentId\s*\)/)
    expect(queryText).not.toMatch(/'task_id'|'class_id'/)
  })

  it('the student class page reads task_submissions by student_id too', () => {
    const src = read('../routes/student/classes/$classId/index.jsx')
    const at = src.indexOf("collection(db, 'task_submissions')")
    expect(at).toBeGreaterThan(-1)
    const queryText = src.slice(at, src.indexOf(')))', at) + 3)
    expect(queryText).toMatch(/where\(\s*'student_id'\s*,\s*'=='\s*,\s*profile\.id\s*\)/)
  })
})

describe('the write carries the identity the rule reads, at the pair id', () => {
  const src = read('./taskSubmissions.js')
  const at = src.indexOf('export async function submitWork')
  const body = src.slice(at, src.indexOf('\n}\n', at))

  it('writes task_id, class_id and student_id from the arguments', () => {
    expect(body).toMatch(/task_id:\s*taskId/)
    expect(body).toMatch(/class_id:\s*classId/)
    expect(body).toMatch(/student_id:\s*studentId/)
  })

  it('addresses the document by submissionId(taskId, studentId), never a caller-supplied id', () => {
    expect(body).toMatch(/doc\(db,\s*'task_submissions',\s*submissionId\(taskId,\s*studentId\)\)/)
    expect(/submitWork\(\{[^}]*\bid\b/.test(body)).toBe(false)
  })

  it('stamps submitted_at from the server, so late is judged on the server clock', () => {
    expect(body).toMatch(/submitted_at:\s*serverTimestamp\(\)/)
  })
})

describe('a paper exam never opens a bin', () => {
  const src = read('../routes/teacher/classes/$classId/modules.jsx')

  it('the dialog writes accepts_submissions false for kind exam', () => {
    expect(src).toMatch(/accepts_submissions:\s*form\.kind\s*===\s*'exam'\s*\?\s*false\s*:/)
  })

  it('and does not render the box for an exam', () => {
    expect(src).toMatch(/form\.kind\s*!==\s*'exam'\s*&&\s*\(/)
  })

  it('the whitelist keeps the field as a strict boolean', () => {
    const lib = read('./classTasks.js')
    expect(lib).toMatch(/out\.accepts_submissions\s*=\s*input\.accepts_submissions\s*===\s*true/)
  })
})
