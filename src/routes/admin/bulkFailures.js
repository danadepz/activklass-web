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
 * Each group is `{ reason, count, rows, who }`, where `rows` is the
 * spreadsheet line numbers — the API counts data rows from 0, the person
 * reading their file counts the header as line 1, so the offset is +2 — and
 * `who` names the people on those lines, from `labels`: what the uploader
 * knows about each row it sent, by index, typically the issued login and the
 * name ("sccu-000050 Audrey Cabunillas"). A row number alone sent an admin
 * back to the sheet to work out whose account was refused (andecobs-45);
 * the login is what they would search the users table for. Capped like
 * `rows`. A failure carrying no row (the whole request fell over, not one
 * row of it) keeps both empty, and the panel then says only the reason
 * rather than pointing at a line that never failed.
 */
export function summarizeFailures(failed, labels = []) {
  const groups = new Map()
  for (const f of failed ?? []) {
    const reason = (f?.reason || 'could not be created').trim()
    const group = groups.get(reason) ?? { reason, count: 0, lines: [], who: [] }
    group.count += 1
    if (Number.isInteger(f?.row)) {
      group.lines.push(f.row + 2)
      if (labels[f.row]) group.who.push(`${labels[f.row]} (row ${f.row + 2})`)
    }
    groups.set(reason, group)
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ reason, count, lines, who }) => ({
      reason, count, rows: rowRanges(lines), who: capped(who),
    }))
}

/** "a, b, c, d, and 96 more" — the same cap rowRanges applies to lines. */
function capped(items, cap = 4) {
  const shown = items.slice(0, cap)
  if (items.length > cap) shown.push(`and ${items.length - cap} more`)
  return shown.join(', ')
}
