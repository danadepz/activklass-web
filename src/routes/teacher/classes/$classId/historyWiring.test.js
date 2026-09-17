/**
 * T-64 (triplecookiemonster-83): the class Logs page never showed a score
 * change or a new assessment. `historyEvents.test.js` locks how an assessment
 * document turns into log lines, but not the two wires on either side of it,
 * and cutting either one brings Kristine's symptom straight back with that
 * suite still green:
 *
 *   1. the class record's save must STAMP the change -- `changes` on every
 *      assessment it writes a score to, `override_changes` on the gradebook
 *      for an override -- or there is nothing for Logs to read (before the
 *      fix a typed score left no timestamp anywhere);
 *   2. the Logs page must READ `gradebooks/{classId}/assessments` and hand
 *      each document (and the gradebook) to the event shaping, under a
 *      "Class record" filter.
 *
 * Both pages import `@/lib/firebase` at module scope and load through async
 * Firestore calls, so the wiring is read from source here, the way
 * `lib/classTasksGuards.test.js` pins a query shape in the everyday suite.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('T-64 — the class record save stamps what Logs reads', () => {
  const src = read('./record.jsx')
  const at = src.indexOf('async function saveAll(')
  const body = src.slice(at, src.indexOf('\n  }\n', at))

  it('has a saveAll at all', () => {
    expect(at, 'no saveAll in record.jsx').toBeGreaterThan(-1)
  })

  it('appends a { at, student_ids } entry to `changes` on the assessment it writes scores to', () => {
    expect(body).toMatch(/updates\.changes\s*=/)
    expect(body).toMatch(/student_ids:\s*Object\.keys\(cells\)/)
    const stamp = body.indexOf('updates.changes')
    const write = body.indexOf("batch.update(doc(db, 'gradebooks', classId, 'assessments', assessmentId), updates)")
    expect(write, 'the assessment write moved or went').toBeGreaterThan(-1)
    expect(stamp, '`changes` must be set before the assessment update is batched').toBeLessThan(write)
    expect(stamp).toBeGreaterThan(-1)
  })

  it('appends to `override_changes` on the gradebook when an override is saved', () => {
    expect(body).toMatch(/overrideUpdates\.override_changes\s*=/)
    const stamp = body.indexOf('overrideUpdates.override_changes')
    const write = body.indexOf("batch.update(doc(db, 'gradebooks', classId), overrideUpdates)")
    expect(write).toBeGreaterThan(-1)
    expect(stamp).toBeGreaterThan(-1)
    expect(stamp).toBeLessThan(write)
  })
})

describe('T-64 — the Logs page reads the class record', () => {
  const src = read('./history.jsx')

  it('reads the assessments subcollection and shapes every document into events', () => {
    expect(src).toMatch(/getDocs\(\s*collection\(\s*db\s*,\s*'gradebooks'\s*,\s*classId\s*,\s*'assessments'\s*\)\s*\)/)
    expect(src).toMatch(/assessmentEvents\(\s*d\.data\(\)\s*\)/)
  })

  it('shapes the gradebook override history into events', () => {
    expect(src).toMatch(/overrideEvents\(\s*gb\s*,\s*nameById\s*\)/)
  })

  it('offers a "Class record" filter for those events', () => {
    expect(src).toMatch(/record:\s*\{\s*tag:\s*'Class record'/)
  })
})
