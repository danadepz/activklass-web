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
      reason: 'email already on another account', count: 100, rows: '2–101',
    })
  })

  it('keeps one line per distinct reason, commonest first', () => {
    expect(summarizeFailures([
      { row: 0, reason: 'missing employee_number' },
      { row: 1, reason: 'already exists' },
      { row: 2, reason: 'already exists' },
    ])).toEqual([
      { reason: 'already exists', count: 2, rows: '3–4' },
      { reason: 'missing employee_number', count: 1, rows: '2' },
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
      .toEqual([{ reason: 'The server could not be reached.', count: 1, rows: '' }])
  })

  it('has nothing to say about a clean upload', () => {
    expect(summarizeFailures([])).toEqual([])
    expect(summarizeFailures(undefined)).toEqual([])
  })

  it('does not drop a failure that came back without a reason', () => {
    expect(summarizeFailures([{ row: 4 }]))
      .toEqual([{ reason: 'could not be created', count: 1, rows: '6' }])
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
