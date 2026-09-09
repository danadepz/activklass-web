/**
 * Approving an attendance dispute writes what the teacher chose, and the
 * teacher's own P/L/A/E row is gone (T-42, T-43 — triplecookiemonster-57/58).
 *
 * T-42: Kristine marked a student Late, the student contested it as a
 * mis-click, she hit Approve — and the row became **Excused**, remarks
 * "Excused — contest approved". `approve()` hard-coded `status: 'excused'`,
 * so accepting *any* dispute asserted a fact nobody had claimed: the student
 * was never absent with a note. Her own words for the fix were a small prompt
 * offering P, L, A, E and a save.
 *
 * T-43: the teacher's own attendance card sat above the students on every
 * class sheet, every day, and its value was written and read back by that one
 * screen and nothing else — not the summaries projection, not the cross-class
 * sheet, not history, risk, reports or the student pages. Removing it is what
 * she asked for.
 *
 * Both are shape rather than pure logic — `approve` and the card live inside a
 * page component with Firestore, router and query hooks behind them — so this
 * reads the source. What each assertion pins is the thing that made the tester
 * write in: a status that is chosen rather than assumed, and a row that is not
 * there.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./attendance.jsx', import.meta.url)), 'utf8')

/** The body of a named function declaration, brace-matched. */
function functionBody(name) {
  const at = src.search(new RegExp(`(async )?function ${name}\\b`))
  if (at === -1) return null
  let depth = 0, i = src.indexOf('{', at)
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1
    else if (src[j] === '}') { depth -= 1; if (depth === 0) return src.slice(i, j + 1) }
  }
  return null
}

describe('approving a dispute writes the chosen status (T-42)', () => {
  const approve = functionBody('approve')

  it('takes the status from the caller instead of assuming one', () => {
    expect(approve, 'no approve() found').toBeTruthy()
    expect(src).toMatch(/async function approve\(\s*c\s*,\s*status\s*\)/)
  })

  it('no longer hard-codes excused into the day record', () => {
    // The exact line that turned Kristine's Late into an E.
    expect(approve).not.toMatch(/status:\s*'excused'/)
  })

  it('labels the remark from the status it actually wrote', () => {
    expect(approve).toMatch(/remarks:\s*`\$\{label\} — contest approved`/)
    expect(approve).not.toMatch(/remarks:\s*'Excused — contest approved'/)
  })

  it('offers all four statuses to choose from, the way she asked', () => {
    // P / L / A / E — the picker is driven by STATUS_KEYS, not a subset.
    expect(src).toMatch(/const STATUS_KEYS = \['present', 'late', 'absent', 'excused'\]/)
    expect(src).toMatch(/picked\[c\.id\]\s*\?\?\s*'excused'/)
  })

  it('still defaults to excused, so an excused absence stays one click', () => {
    expect(src).toMatch(/\?\?\s*'excused'/)
  })
})

describe("the teacher's own attendance row is gone (T-43)", () => {
  it('nothing holds or dirties a teacher entry any more', () => {
    for (const gone of ['teacherDirty', 'teacherEntry', 'toggleTeacher']) {
      expect(src, `${gone} is back`).not.toContain(gone)
    }
  })

  it('the day document is no longer written with a teacher field', () => {
    expect(src).not.toMatch(/teacher:\s*teacherEntry/)
    expect(src).not.toMatch(/dayData\.teacher/)
  })

  it('the student rows are still marked the same way', () => {
    // The removal must not have taken the students' own controls with it.
    expect(src).toContain('STATUS_KEYS')
    expect(src).toMatch(/records\./)
  })
})
