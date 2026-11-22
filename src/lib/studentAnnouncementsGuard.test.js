/**
 * The student's announcements query must carry what the rule reads.
 *
 * firestore.rules lets a student read an announcement only when its
 * `teacher_id` is one of the student's own `teacher_ids`. A list query is
 * allowed only if the rule can be proven for every document it could return,
 * so a query filtered by `class_id` alone is refused outright and the tab
 * showed "No Announcements" while the bell notification (a different
 * collection) still arrived.
 *
 * `firestoreRules.test.js` can prove the refusal, but only under
 * `npm run test:rules`; this reads the query from the page's source so the
 * everyday suite catches a refactor that drops the second filter. Same
 * approach as classTasksGuards.test.js.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(
  fileURLToPath(new URL('../routes/student/classes/$classId/index.jsx', import.meta.url)),
  'utf8',
)

describe('the student announcements query carries what the rule reads', () => {
  const at = src.indexOf("collection(db, 'announcements')")
  const queryText = src.slice(at, src.indexOf('.catch', at))

  it('reads announcements at all', () => {
    expect(at, "no announcements read in the student class page").toBeGreaterThan(-1)
  })

  it('filters by class_id and by teacher_id in the same query', () => {
    expect(queryText).toMatch(/where\(\s*'class_id'\s*,\s*'=='\s*,\s*classId\s*\)/)
    expect(queryText).toMatch(/where\(\s*'teacher_id'\s*,\s*'=='\s*,/)
  })

  it('does not hide a failed read behind the empty state', () => {
    expect(src).toMatch(/loadFailed=\{Boolean\(data\.queryErrors\?\.announcements\)\}/)
    expect(src).toMatch(/Announcements Could Not Load/)
  })
})
