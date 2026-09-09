/**
 * A quiz says which class it is for, and what subject (T-36, andecobs-53).
 *
 * Derick asked for both halves of one idea: the header should "show indication
 * on what class na assign... not just 'assign to 1 class'", and the list card
 * should "indicate what class and kuan pud diay ang subject name" — the way the
 * LMS his school uses says it. The header already held the full class objects
 * it was counting; the card already had `subject` sitting unused beside
 * `section`. The card half is locked by a real render in `quizzes.test.jsx`.
 *
 * This is the header half. `describeAssignment` is module-private inside a
 * 1800-line page component with a dozen hooks behind it, so rather than render
 * that page or ask its lane to export a helper for a test, the function is
 * lifted out of the source and run on its own. That is deliberately stronger
 * than asserting the source contains a template string: it exercises every
 * branch, including "and N more", which the fixing pane could not reach in the
 * browser because no teacher on this machine has four classes.
 *
 * Lifting it also means the test fails the moment the function is renamed or
 * removed — which is what a revert to `assigned to N class` would look like.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./quizzes.$quizId.jsx', import.meta.url)), 'utf8')

/** A named function declaration lifted out of the source and made callable. */
function lift(name) {
  const at = src.indexOf(`function ${name}(`)
  if (at === -1) return null
  let depth = 0
  const start = src.indexOf('{', src.indexOf(')', at))
  for (let j = start; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1
    else if (src[j] === '}') {
      depth -= 1
      if (depth === 0) {
        // eslint-disable-next-line no-new-func
        return new Function(`return (function ${name}(assignedClasses) ${src.slice(start, j + 1)})`)()
      }
    }
  }
  return null
}

const describeAssignment = lift('describeAssignment')
const cls = (section, subject) => ({ id: section, section, subject })

/** The line as the header prints it: lead then names. */
const line = (classes) => {
  const { lead, names } = describeAssignment(classes)
  return names ? `${lead} ${names}` : lead
}

describe('the quiz header names the class (T-36)', () => {
  it('the helper is still there to be called', () => {
    expect(describeAssignment, 'no describeAssignment in quizzes.$quizId.jsx').toBeTypeOf('function')
  })

  it('names the class and its subject when there is one', () => {
    // The tester's own quiz. His screenshot read "Assigned To 1 Class".
    expect(line([cls('Newton', 'Science 9')])).toBe('assigned to Newton · Science 9')
  })

  it('never prints a bare count for a single class again', () => {
    // The exact shape he complained about, in every arity.
    for (const n of [1, 2, 3, 4, 5]) {
      const classes = Array.from({ length: n }, (_, i) => cls(`S${i}`, `Sub${i}`))
      expect(line(classes)).not.toMatch(/\d classe?s?$/)
    }
  })

  it('keeps the count when there are several, then names them', () => {
    const three = [cls('LABYU2', 'A'), cls('C', 'B'), cls('Grade 10 - Rizal', 'C')]
    expect(line(three)).toBe('assigned to 3 classes: LABYU2, C and Grade 10 - Rizal')
  })

  it('falls back to "and N more" past three, which the browser pass could not reach', () => {
    const four = ['A', 'B', 'C', 'D'].map((s) => cls(s, 'Sub'))
    expect(line(four)).toBe('assigned to 4 classes: A, B and 2 more')
  })

  it('drops subjects once there are several, so the line stays a line', () => {
    // They differ across classes; repeating them turns the header into a
    // paragraph. The count carries the rest.
    const two = [cls('Newton', 'Science 9'), cls('Curie', 'Physics 11')]
    expect(line(two)).not.toMatch(/Science 9|Physics 11/)
  })

  it('leaves "not assigned" alone', () => {
    expect(line([])).toBe('not assigned')
  })

  it('survives a class with no subject on it', () => {
    // Older classes and seeded ones can lack the field; the section alone is
    // still better than a count, and undefined must not reach the page.
    expect(line([cls('Newton', undefined)])).toBe('assigned to Newton')
  })
})

describe('the header does not title-case a name the teacher typed (T-36)', () => {
  it('the names opt out of the capitalize the status line carries', () => {
    // className="capitalize" is right for "Published · 5 Questions" and wrong
    // for "bsit-c", which it would render "Bsit-C".
    const at = src.indexOf('assignment.names')
    expect(at, 'the header no longer prints assignment.names').toBeGreaterThan(-1)
    const around = src.slice(at - 400, at + 400)
    expect(around).toMatch(/normal-case|textTransform:\s*'none'/)
  })
})
