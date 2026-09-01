/**
 * A bulk upload's failures, said once per *reason* instead of once per row.
 *
 * A hundred-row file whose rows all tripped the same check printed a hundred
 * near-identical lines down the result panel, so the one fact it had to give
 * ran off the bottom of the screen and nobody read it (tester ticket
 * andecobs-30). The reasons come from a small fixed vocabulary — see
 * `_prepare_user` / `_create_one` in the backend's `api/admin.py` — so a real
 * file is almost always one or two of them, and grouping keeps everything
 * that was on screen (what went wrong, how many rows, which rows) in a line.
 *
 * The preview table above already caps itself at eight rows; this is the same
 * treatment for the panel underneath it.
 */

/**
 * Spreadsheet line numbers as ranges: [2,3,4,9] → "2–4, 9". Capped, because a
 * hundred scattered rows is a wall of its own; the count in front of the line
 * already says how many there were.
 */
export function rowRanges(lines, cap = 4) {
  const sorted = [...new Set(lines)].sort((a, b) => a - b)
  const runs = []
  for (const n of sorted) {
    const last = runs[runs.length - 1]
    if (last && n === last[1] + 1) last[1] = n
    else runs.push([n, n])
  }
  const shown = runs.slice(0, cap).map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
  const hidden = runs.slice(cap).reduce((n, [a, b]) => n + (b - a + 1), 0)
  if (hidden) shown.push(`and ${hidden} more`)
  return shown.join(', ')
}

/**
 * Group `result.failed` by reason, commonest first.
 *
 * Each group is `{ reason, count, rows }`, where `rows` is the spreadsheet
 * line numbers — the API counts data rows from 0, the person reading their
 * file counts the header as line 1, so the offset is +2. A failure carrying
 * no row (the whole request fell over, not one row of it) keeps an empty
 * `rows`, and the panel then says only the reason rather than pointing at a
 * line that never failed.
 */
export function summarizeFailures(failed) {
  const groups = new Map()
  for (const f of failed ?? []) {
    const reason = (f?.reason || 'could not be created').trim()
    const group = groups.get(reason) ?? { reason, count: 0, lines: [] }
    group.count += 1
    if (Number.isInteger(f?.row)) group.lines.push(f.row + 2)
    groups.set(reason, group)
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ reason, count, lines }) => ({ reason, count, rows: rowRanges(lines) }))
}
