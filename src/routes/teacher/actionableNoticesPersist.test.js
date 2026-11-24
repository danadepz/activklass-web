/**
 * Owner policy (2026-11-24): a notice that asks the teacher to do something must
 * not disappear after three seconds. When posting quiz scores is skipped -- most
 * often "Quarter 1 is locked — unlock it to post these scores" -- the toast
 * says what to do, so both places that show it keep it until dismissed.
 * Source-read, like the other route guards: the two call sites sit deep inside
 * a 3,000-line editor that a render test cannot reach cheaply.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./quizzes.$quizId.jsx', import.meta.url)), 'utf8')

describe('skipped score posting stays on screen', () => {
  it('the results view keeps the skipped reason until dismissed', () => {
    expect(src).toContain('if (result.skipped) toast.warning(result.skipped, { duration: 0 })')
  })

  it('publishing keeps the skipped classes until dismissed', () => {
    expect(src).toMatch(/if \(synced\.skipped\.length\) toast\.warning\(`Published\. \$\{synced\.skipped\.join\(' '\)\}`, \{ duration: 0 \}\)/)
  })

  it('no skipped reason is shown as a timed info toast', () => {
    expect(src).not.toMatch(/toast\.info\([^)]*skipped/)
  })
})
