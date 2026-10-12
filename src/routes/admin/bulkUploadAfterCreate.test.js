/**
 * Bulk upload no longer relints every row as "already taken" against the
 * accounts it just created (T-166, maykel_64440-244 / andecobs-247).
 *
 * `BulkUpload`'s duplicate check (`rowDuplicate`) runs live against the
 * `users` prop, and a successful create calls `onDone()`, which refetches
 * that list — so the stale preview recomputed against a roster that now
 * holds the ten accounts it just made, and every row lit up red naming the
 * person it had just created, beside a green "10 created, 0 failed". Two
 * testers hit it independently within the hour; the screenshots showed the
 * same file and account clean *before* Create and all-red *after*.
 *
 * `afterUpload(created)` is the fix's whole decision: once the attempt
 * actually created something, the picked file's rows are cleared, so what
 * remains on screen is the result, not a preview re-linted against itself.
 * A wholly-failed attempt (nothing created) leaves the rows in place to fix
 * and re-upload — this is the one case covered by `done means`'s "a
 * genuinely conflicting row in a fresh file still warns before creating":
 * if creation never happened, the preview has nothing to invalidate.
 */
import { describe, expect, it } from 'vitest'
import { afterUpload } from './BulkUpload'

describe('T-166 — the preview does not relint the accounts it just created', () => {
  it('clears the picked file once accounts were actually created', () => {
    expect(afterUpload(10)).toEqual({ rows: [], fileName: '' })
    expect(afterUpload(1)).toEqual({ rows: [], fileName: '' })
  })

  it('leaves the rows alone when nothing was created, so the admin can fix and re-upload', () => {
    expect(afterUpload(0)).toBeNull()
  })

  it('still clears on a partial success — the created accounts are the ones that would relint', () => {
    // 7 created, 3 failed: the 3 failures are reported in `result.failed`,
    // not by leaving the whole table up to re-check against itself.
    expect(afterUpload(7)).toEqual({ rows: [], fileName: '' })
  })
})
