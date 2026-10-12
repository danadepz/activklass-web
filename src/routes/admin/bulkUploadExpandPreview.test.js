/**
 * "…and N more" in the bulk-upload preview is now reachable, not just named
 * (T-171, maykel_64440-243). The preview exists so an admin can check
 * credentials before creating, and the rows the 8-row cap hid were exactly
 * the ones they could not check: "i cannot click the 2 more to view the
 * credentials of the other 2."
 *
 * `previewRows(rows, expanded)` is the fix's whole decision: under the cap,
 * nothing changes; over it, collapsed still shows only the cap (so a 500-row
 * file still does not render by default) and names how many more there are,
 * while expanded shows every row. `shown` always starts at index 0, whether
 * collapsed or expanded, so a hidden row's duplicate warning -- indexed into
 * `dupes`, which is computed over the full, unsliced row list -- lines up
 * correctly the moment the row is shown; this is what the ticket pane's card
 * calls out as the worst case to get wrong.
 */
import { describe, expect, it } from 'vitest'
import { previewRows } from './BulkUpload'

function rows(n) {
  return Array.from({ length: n }, (_, i) => ({ first_name: `R${i}`, last_name: 'Test' }))
}

describe('T-171 — the preview’s hidden rows are reachable', () => {
  it('shows every row and no toggle when the file is at or under the cap', () => {
    expect(previewRows(rows(8), false)).toEqual({ shown: rows(8), toggleLabel: null })
    expect(previewRows(rows(3), false)).toEqual({ shown: rows(3), toggleLabel: null })
  })

  it('still caps at 8 by default on a larger file, and names the rest', () => {
    const { shown, toggleLabel } = previewRows(rows(10), false)
    expect(shown).toHaveLength(8)
    expect(toggleLabel).toContain('2 more')
  })

  it('does not render all 500 rows of a large file by default', () => {
    const { shown } = previewRows(rows(500), false)
    expect(shown).toHaveLength(8)
  })

  it('reveals every row once expanded, in original order', () => {
    const { shown, toggleLabel } = previewRows(rows(10), true)
    expect(shown).toHaveLength(10)
    expect(shown[9].first_name).toBe('R9')
    expect(toggleLabel).toBe('Show fewer rows')
  })
})
