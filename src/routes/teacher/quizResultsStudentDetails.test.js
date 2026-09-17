/**
 * T-76 (maykel_64440-91): on a quiz's results, a teacher wanted to click a
 * student's name and see who they are. There is no teacher-side student
 * profile to link to, so the build is a read-only panel on the results page.
 *
 * Pinned from source (the panel and its trigger live inside the editor page,
 * which loads through async Firestore calls -- the historyWiring.test.js
 * pattern): the name is a button that opens the panel for that row, the panel
 * shows the roster's own fields and this quiz's attempts, and nothing a
 * password touches can reach it -- the card's one hard "must not".
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./quizzes.$quizId.jsx', import.meta.url)), 'utf8')
const at = src.indexOf('function StudentDetailsModal(')
const modal = at < 0 ? '' : src.slice(at, src.indexOf('\n}\n', at))

describe("T-76 — a student's name on the results opens who they are", () => {
  it("renders each result's name as a button that opens the panel for that student", () => {
    expect(src).toMatch(/<button\s+type="button"\s+onClick=\{\(\) => setDetailsFor\(\{ student: s, allowed, best, attempts: finished \}\)\}[^>]*>\s*\{s\.last_name\}, \{s\.first_name\}/)
    expect(src).toMatch(/\{detailsFor && \(\s*<StudentDetailsModal/)
  })

  it('shows the roster fields a teacher already sees, and the attempts used', () => {
    expect(at).toBeGreaterThan(-1)
    for (const label of ['ID / login', 'Student number', 'LRN', 'Email', 'Program', 'Year level', 'Status']) {
      expect(modal).toContain(`['${label}',`)
    }
    expect(modal).toMatch(/attempt\{attempts\.length === 1 \? '' : 's'\} used/)
  })

  it('never shows a password or a temporary password', () => {
    expect(modal).not.toMatch(/password/i)
    expect(modal).not.toMatch(/temp_pass|is_temp/i)
  })
})
