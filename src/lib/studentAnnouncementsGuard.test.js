/**
 * The student class page must read announcements through
 * lib/studentAnnouncements.js, the one query shape firestore.rules can prove
 * (class_id + teacher_id). A class_id-only read is refused outright and used
 * to show up as "No Announcements".
 *
 * The rules suite proves the helper itself against the emulator, but only
 * under `npm run test:rules`; this reads the page's source so the everyday
 * suite catches a refactor that goes back to an inline query. Same approach
 * as classTasksGuards.test.js.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(
  fileURLToPath(new URL('../routes/student/classes/$classId/index.jsx', import.meta.url)),
  'utf8',
)

describe('the student class page reads announcements the provable way', () => {
  it('builds the query with studentAnnouncementsQuery from the class teacher', () => {
    expect(src).toMatch(/studentAnnouncementsQuery\(\s*db\s*,\s*classId\s*,\s*clazz\.teacher_id\s*\)/)
  })

  it('has no inline announcements query of its own', () => {
    expect(src).not.toMatch(/collection\(\s*db\s*,\s*'announcements'\s*\)/)
  })

  it('treats a class with no usable teacher id as a failed read, not an empty one', () => {
    expect(src).toMatch(/announcementsQuery \? null : new Error/)
  })

  it('does not hide a failed read behind the empty state', () => {
    expect(src).toMatch(/loadFailed=\{Boolean\(data\.queryErrors\?\.announcements\)\}/)
    expect(src).toMatch(/Announcements Could Not Load/)
  })
})
