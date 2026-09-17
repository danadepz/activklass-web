/**
 * T-72 (maykel_64440-94): a score typed on the class record went back to the
 * quiz's score after a refresh or two -- the auto-post recomputed every cell.
 *
 * The fix has two halves and the lib suite only sees one. `quizScoreCells`
 * (lib/quizToRecord.test.js) keeps any cell marked `manual` or recovered; but
 * that mark is written HERE, by the record's save and by the grade recovery.
 * Drop the mark from either write and the keep-rule has nothing to find --
 * the tester's symptom returns with lib/quizToRecord.test.js still green.
 *
 * Both writes live inside async Firestore handlers, so the wiring is read from
 * source, the pattern historyWiring.test.js and classTasksGuards.test.js use.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('T-72 — the class record marks a typed quiz score so the auto-post keeps it', () => {
  const src = read('./record.jsx')
  const at = src.indexOf('async function saveAll(')
  const body = src.slice(at, src.indexOf('\n  }\n', at))

  it('builds the mark only for a quiz-linked column', () => {
    expect(at, 'no saveAll in record.jsx').toBeGreaterThan(-1)
    expect(body).toMatch(/const manual = assessment\.source_quiz_id \? \{ manual: true \} : \{\}/)
  })

  it('spreads the mark into a typed score AND a typed status (missing / excused)', () => {
    expect(body).toMatch(/\{ status: 'graded', raw_score: parsed\.raw_score, \.\.\.manual \}/)
    expect(body).toMatch(/\{ status: parsed\.status, \.\.\.manual \}/)
  })

  it('clears a cell with deleteField, so a blank cell loses the mark and is posted again', () => {
    expect(body).toMatch(/parsed\.status === 'none'\)\s*\{\s*updates\[`scores\.\$\{studentId\}`\] = deleteField\(\)/)
  })
})

describe('T-72 — a recovered grade is marked too', () => {
  it('gradeRecovery writes the applied score with manual: true', () => {
    const src = readFileSync(fileURLToPath(new URL('../../../../features/classes/gradeRecovery.js', import.meta.url)), 'utf8')
    expect(src).toMatch(/\{ status: 'graded', raw_score: result\.applied_score, manual: true \}/)
  })
})
