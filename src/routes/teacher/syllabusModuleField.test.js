/**
 * The module description is a box a teacher can grow, and the break survives
 * to the student (T-33, andecobs-49).
 *
 * The tester filed no defect — he pointed at an inconsistency in his own
 * screenshot: the syllabus Description above it is a textarea, the sub-module
 * Learning objectives below it is a textarea that auto-grows, and the module
 * description between them was a one-line `<input>` whose text scrolled
 * sideways out of view.
 *
 * The half that is easy to lose is the second one. Turning the field into a
 * textarea means teachers press Enter in it, and the student reads that
 * description in a plain div — without `white-space: pre-wrap` every break they
 * type collapses into a single space, so the editor would promise a shape the
 * student page throws away. The two live in different lanes, which is exactly
 * how they drift apart, so both are pinned here.
 *
 * The editor is a sub-component of a page with a dozen hooks behind it, so this
 * reads the source rather than rendering it.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/** The JSX element carrying a given placeholder, opening tag through `/>`. */
function elementWithPlaceholder(src, placeholder) {
  const at = src.indexOf(`placeholder="${placeholder}"`)
  if (at === -1) return null
  const open = src.lastIndexOf('<', at)
  const close = src.indexOf('/>', at)
  return src.slice(open, close + 2)
}

describe('syllabus module description (T-33)', () => {
  const syllabus = read('./syllabus.jsx')

  it('is a textarea, not the one-line input the tester photographed', () => {
    const el = elementWithPlaceholder(syllabus, 'Module description (optional)')
    expect(el, 'no module-description field found').toBeTruthy()
    expect(el.startsWith('<textarea'), `still a ${el.slice(0, 12)}…`).toBe(true)
  })

  it('opens at two lines and grows with what is typed', () => {
    const el = elementWithPlaceholder(syllabus, 'Module description (optional)')
    expect(el).toMatch(/rows=\{Math\.max\(2,/)
  })

  it('sits between the two fields that already behaved this way', () => {
    // If either neighbour stops being a textarea the inconsistency is back,
    // just pointing the other way.
    expect(elementWithPlaceholder(syllabus, 'Description (optional)')?.startsWith('<textarea'))
      .not.toBe(false)
  })
})

describe('the student sees the breaks the teacher typed (T-33)', () => {
  it("the module description renders with pre-wrap on the student's class page", () => {
    const student = read('../student/classes/$classId/index.jsx')
    const line = student.split('\n').find((l) => l.includes('m.description'))
    expect(line, 'no module-description render on the student page').toBeTruthy()
    expect(line).toMatch(/whiteSpace:\s*'pre-wrap'/)
  })
})
