/**
 * Two guards on the class-tasks convoy that its own tests read past, both
 * proven live on 2026-09-13 (Step 6 of docs/plans/modules-content-and-deliverables.md).
 *
 * 1. The student's task query must carry BOTH fields. The rule proves a
 *    student's read from `status == 'published'` as well as the roster, so a
 *    query without the status filter is refused outright — enrolled or not —
 *    because the engine cannot rule out a draft. `firestoreRules.test.js`
 *    proves the refusal against the emulator, but that suite runs only under
 *    `npm run test:rules`; a refactor that dropped the second `where()` from
 *    the hook would pass `npm run test` and blank every student's "Up next"
 *    panel on the live project. So the query is read from the hook's source
 *    here, in the suite that runs on every change.
 *
 * 2. Deleting a task a class can already see is irreversible for the students
 *    too, so it asks the teacher to type DELETE, as the other irreversible
 *    deletes in this app do; a draft nobody has seen does not. During the
 *    live pass the published delete refused a bare click on the confirm
 *    button and accepted it after typing DELETE — which is right, and is not
 *    pinned anywhere.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('the student task query carries what the rule reads (class_tasks)', () => {
  const src = read('../hooks/useStudentDeliverables.js')
  const at = src.indexOf("collection(db, 'class_tasks')")
  const queryText = src.slice(at, src.indexOf(')))', at))

  it('reads class_tasks at all', () => {
    expect(at, 'no class_tasks read in useStudentDeliverables').toBeGreaterThan(-1)
  })

  it('filters by class_id with an in-chunk, and by status == published, in the same query', () => {
    expect(queryText).toMatch(/where\(\s*'class_id'\s*,\s*'in'\s*,/)
    expect(queryText).toMatch(/where\(\s*'status'\s*,\s*'=='\s*,\s*'published'\s*\)/)
  })

  it('chunks the class ids at IN_CHUNK, never at the SDK limit', () => {
    // The T-57 lesson: the rules engine judges an `in` query per document and
    // refuses the whole read past 18 ids. IN_CHUNK (10) is the measured safe size.
    expect(src).toMatch(/IN_CHUNK/)
    expect(src).not.toMatch(/slice\(\s*\w+\s*,\s*\w+\s*\+\s*30\s*\)/)
  })
})

describe('the teacher-side query is the shape the rule proves through classes.teacher_id', () => {
  const src = read('../hooks/useClassTasks.js')
  it("filters by class_id == the class, and nothing else the rule cannot see", () => {
    expect(src).toMatch(/where\(\s*'class_id'\s*,\s*'=='\s*,\s*classId\s*\)/)
  })
})

describe('deleting a task the class can see asks the teacher to type DELETE', () => {
  const src = read('../routes/teacher/classes/$classId/modules.jsx')
  const at = src.indexOf('async function remove(')
  const body = src.slice(at, src.indexOf('\n  }\n', at))

  it('has the remove handler at all', () => {
    expect(at, 'no remove() in modules.jsx').toBeGreaterThan(-1)
  })

  it('a published task needs DELETE typed; a draft does not', () => {
    expect(body).toMatch(/typeToConfirm:\s*'DELETE'/)
    // conditional on published, not unconditional
    expect(body).toMatch(/published\s*\?\s*\{\s*typeToConfirm:\s*'DELETE'\s*\}\s*:\s*\{\s*\}/)
  })

  it('says what each delete means to the students, in those words', () => {
    expect(body).toMatch(/removed from every student\\?'s Modules tab and dashboard/)
    expect(body).toMatch(/never published, so no student has seen it/)
    expect(body).toMatch(/cannot be undone/)
  })

  it('names no vendor or exception to the teacher when the delete fails', () => {
    expect(body).toMatch(/could not be deleted\. Check your connection and try again\./)
    expect(body).not.toMatch(/Firebase|Firestore|err\.message/)
  })
})
