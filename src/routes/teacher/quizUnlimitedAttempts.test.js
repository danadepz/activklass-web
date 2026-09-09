/**
 * The teacher can choose "no ceiling", and the closing date is what stops it
 * (T-34, andecobs-50).
 *
 * Derick filed no defect. He asked for "unlimited attempts as long as wala pa
 * ang due date" — a practice drill a student keeps taking until it closes. The
 * date half was already built and enforced; what was missing was any value a
 * teacher could type that meant no ceiling, because `attempts_allowed` fell
 * through `Number(x) || 1` and the editor refused anything below 1.
 *
 * The pure half of the fix — `attempts_allowed: null` as the sentinel,
 * `attemptsAllowedFor` returning Infinity, `canStart` still closing on the
 * date, no counter printing the word "Infinity" — is covered in
 * `lib/quizAttempts.test.js` by the pane that built it, and those tests were
 * re-proved by reverting the fix before this file was written.
 *
 * What is pinned here is the part that lives in the screen and had no test:
 * the refusals. Unlimited is bounded by the closing date and nothing else, so
 * a quiz set to unlimited without one never stops, which is the opposite of
 * what he asked for; and an unlimited quiz has no last attempt, so results set
 * to open "after their last attempt" would never open — worse, today they
 * release after the first sitting, which on a retake quiz hands out the answer
 * key. Both are refusals a teacher only meets at the moment they misconfigure
 * it, so they are exactly the kind that rot silently.
 *
 * `attemptsProblem` is module-private inside an 1800-line page component, so
 * it is lifted out of the source and run on its own rather than rendering that
 * page or asking its lane to export a helper for a test. The remaining
 * assertions read the source: they cover a disabled input, a checkbox and two
 * display lines in another lane, which is shape rather than logic.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { RELEASE_AFTER_ATTEMPTS, RELEASE_IMMEDIATE } from '@/lib/quizFeedback'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const src = read('./quizzes.$quizId.jsx')

/** A named function declaration lifted out of the source and made callable. */
function lift(name, args, scope = {}) {
  const at = src.indexOf(`function ${name}(`)
  if (at === -1) return null
  let depth = 0
  const start = src.indexOf('{', src.indexOf(')', at))
  for (let j = start; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1
    else if (src[j] === '}') {
      depth -= 1
      if (depth === 0) {
        const names = Object.keys(scope)
        // eslint-disable-next-line no-new-func
        const make = new Function(...names, `return (function ${name}(${args}) ${src.slice(start, j + 1)})`)
        return make(...names.map((n) => scope[n]))
      }
    }
  }
  return null
}

const attemptsProblem = lift('attemptsProblem', 'settings', { RELEASE_AFTER_ATTEMPTS })

/** The builder's settings object, as `initialSettings` shapes it. */
const settings = (over) => ({
  attempts_unlimited: false,
  attempts_allowed: 1,
  closes_at: '',
  feedback_release: RELEASE_IMMEDIATE,
  ...over,
})

describe('unlimited needs the date that ends it (T-34)', () => {
  it('the guard is still there to be called', () => {
    expect(attemptsProblem, 'no attemptsProblem in quizzes.$quizId.jsx').toBeTypeOf('function')
  })

  it('refuses unlimited with no closing date', () => {
    // A quiz that never stops is not "until the due date".
    const why = attemptsProblem(settings({ attempts_unlimited: true }))
    expect(why).toBeTruthy()
    expect(why).toMatch(/closing date/i)
  })

  it('refuses unlimited with results held until the last attempt', () => {
    // There is no last attempt. feedbackVisibility reads attempts_allowed
    // directly, so null lands on `Number(null) || 1` and releases the answer
    // key after the first sitting — silently, on the one release setting whose
    // own hint recommends it for retakes.
    const why = attemptsProblem(settings({
      attempts_unlimited: true,
      closes_at: '2026-12-01T09:00',
      feedback_release: RELEASE_AFTER_ATTEMPTS,
    }))
    expect(why).toBeTruthy()
    expect(why).toMatch(/last attempt|all attempts/i)
  })

  it('allows unlimited once it has a closing date and a workable release', () => {
    expect(attemptsProblem(settings({
      attempts_unlimited: true,
      closes_at: '2026-12-01T09:00',
    }))).toBeNull()
  })

  it('says nothing at all about a quiz with a numeric ceiling', () => {
    // The refusals must not reach the teachers who never asked for this.
    for (const release of [RELEASE_IMMEDIATE, RELEASE_AFTER_ATTEMPTS]) {
      expect(attemptsProblem(settings({ attempts_allowed: 3, feedback_release: release }))).toBeNull()
    }
    expect(attemptsProblem(undefined)).toBeNull()
  })

  it('blocks publishing rather than saving, like the pool and feedback checks', () => {
    // A draft may be half-configured; a quiz students can sit may not.
    expect(src).toMatch(/if \(attemptsWarning\) \{\s*\n\s*refusePublish\(attemptsWarning\)/)
  })
})

describe('the teacher picks unlimited, never guesses a magic number (T-34)', () => {
  it('offers it as a checkbox in the builder and in the live panel', () => {
    // Two places, because the builder is hidden once a quiz is published and
    // the live panel is the only way in after that. The wording differs only
    // in length — the builder's column is narrow.
    const boxes = src.match(/checked=\{[^}]*[uU]nlimited[^}]*\}/g) ?? []
    expect(boxes.length, 'the choice is offered in only one of the two places').toBe(2)
    expect(src).toMatch(/Unlimited until it closes/)
    expect(src).toMatch(/Unlimited attempts until it closes/)
  })

  it('greys the number box out and shows the symbol instead of a number', () => {
    expect(src).toMatch(/placeholder=\{[^}]*unlimited[^}]*'∞'/i)
    expect(src).toMatch(/disabled=\{[^}]*unlimited/i)
  })

  it('folds the choice back into attempts_allowed and stores no field of its own', () => {
    // attempts_unlimited is derived on load and folded back on save. Storing
    // it would give two sources of truth for one fact.
    expect(src).toMatch(/attempts_allowed: settings\.attempts_unlimited \? null :/)
    expect(src).toMatch(/attempts_allowed: unlimited \? null :/)
  })

  it('the live panel refuses unlimited without a closing date too', () => {
    // Reachable on a published quiz, where the builder is hidden.
    expect(src).toMatch(/if \(unlimited && !closesAt\)/)
  })

  it('keeps "at least 1" for everyone who is not unlimited', () => {
    expect(src).toMatch(/if \(!unlimited && \(!Number\.isFinite\(parsed\) \|\| parsed < 1\)\)/)
  })
})

describe('no student is shown the word Infinity (T-34)', () => {
  it('the class page counter goes through attemptsLabel', () => {
    // `Attempts {used}/{allowed}` would read "Attempts 1/Infinity". This line
    // is in the Student lane, which is how it would drift back.
    const page = read('../student/classes/$classId/index.jsx')
    const line = page.split('\n').find((l) => l.includes('Attempts {used}'))
    expect(line, 'no attempts counter on the student class page').toBeTruthy()
    expect(line).toContain('attemptsLabel(allowed)')
  })

  it('the remediation list says it in words rather than printing a ceiling', () => {
    const page = read('../student/remediation.jsx')
    expect(page).toMatch(/Number\.isFinite\(allowed\)/)
    expect(page).toMatch(/unlimited until it closes/)
  })

  it('the results table explains the symbol rather than leaving it bare', () => {
    expect(src).toMatch(/Unlimited attempts until the quiz closes/)
  })
})
