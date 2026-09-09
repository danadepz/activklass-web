import { describe, it, expect } from 'vitest'
import { summarizeFailures, rowRanges } from './bulkFailures'

// The ticket, as data: a 100-row teacher upload where every row was somebody
// the school already had, which printed a hundred lines down the page.
const ALL_TAKEN = Array.from({ length: 100 }, (_, i) => ({
  row: i, email: `t${i}@example.com`, reason: 'email already on another account',
}))

describe('summarizeFailures', () => {
  it('says a hundred identical failures in one line', () => {
    const groups = summarizeFailures(ALL_TAKEN)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual({
      reason: 'email already on another account', count: 100, rows: '2–101', who: '',
    })
  })

  it('keeps one line per distinct reason, commonest first', () => {
    expect(summarizeFailures([
      { row: 0, reason: 'missing employee_number' },
      { row: 1, reason: 'already exists' },
      { row: 2, reason: 'already exists' },
    ])).toEqual([
      { reason: 'already exists', count: 2, rows: '3–4', who: '' },
      { reason: 'missing employee_number', count: 1, rows: '2', who: '' },
    ])
  })

  it('still shows a short failure list in full', () => {
    expect(summarizeFailures([
      { row: 0, reason: 'missing name' },
      { row: 1, reason: 'missing birthdate' },
    ]).map((g) => `${g.count} — ${g.reason} — ${g.rows}`)).toEqual([
      '1 — missing name — 2',
      '1 — missing birthdate — 3',
    ])
  })

  it('counts the header as row 1, the way the spreadsheet does', () => {
    expect(summarizeFailures([{ row: 0, reason: 'missing name' }])[0].rows).toEqual('2')
  })

  it('names the reason alone when no one row failed', () => {
    // The request itself fell over: pointing at row 2 would be a lie.
    expect(summarizeFailures([{ reason: 'The server could not be reached.' }]))
      .toEqual([{ reason: 'The server could not be reached.', count: 1, rows: '', who: '' }])
  })

  it('has nothing to say about a clean upload', () => {
    expect(summarizeFailures([])).toEqual([])
    expect(summarizeFailures(undefined)).toEqual([])
  })

  it('does not drop a failure that came back without a reason', () => {
    expect(summarizeFailures([{ row: 4 }]))
      .toEqual([{ reason: 'could not be created', count: 1, rows: '6', who: '' }])
  })

  // andecobs-45: Audrey's row was refused as "already exists" and the panel
  // said "row 5", so the admin searched for her and found nothing. The
  // uploader knows the login and name it sent on each row; the panel says them.
  it('names the login and person on each failed row when the uploader says who they are', () => {
    const labels = [
      'sccu-000012 Shyna Tantay', 'sccu-000034 Juan Cruz',
      'sccu-000050 Shyna Tantay', 'sccu-000050 Audrey Cabunillas',
    ]
    expect(summarizeFailures([{ row: 3, reason: 'already exists' }], labels)[0].who)
      .toBe('sccu-000050 Audrey Cabunillas (row 5)')
  })

  it('caps the names the way it caps the rows', () => {
    const labels = Array.from({ length: 10 }, (_, i) => `snhs-00000${i} Student ${i}`)
    const failed = labels.map((_, i) => ({ row: i, reason: 'already exists' }))
    expect(summarizeFailures(failed, labels)[0].who).toBe(
      'snhs-000000 Student 0 (row 2), snhs-000001 Student 1 (row 3), ' +
      'snhs-000002 Student 2 (row 4), snhs-000003 Student 3 (row 5), and 6 more',
    )
  })

  it('leaves who blank for a row it has no label for', () => {
    expect(summarizeFailures([{ row: 7, reason: 'already exists' }], ['x'])[0].who).toBe('')
  })
})

describe('rowRanges', () => {
  it('reads consecutive rows as a range', () => {
    expect(rowRanges([2, 3, 4, 9])).toEqual('2–4, 9')
  })

  it('sorts and de-duplicates what it is given', () => {
    expect(rowRanges([9, 3, 2, 3, 4])).toEqual('2–4, 9')
  })

  it('caps the ranges so scattered rows are not a wall of their own', () => {
    expect(rowRanges([2, 4, 6, 8, 10, 12, 14])).toEqual('2, 4, 6, 8, and 3 more')
  })

  it('is empty when nothing carried a row number', () => {
    expect(rowRanges([])).toEqual('')
  })
})
