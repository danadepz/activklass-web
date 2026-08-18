/**
 * CSV building and download.
 *
 * Owned by the logic lane (see OWNERSHIP.md). reports.jsx grew its own copy of
 * this; anything new should import from here rather than add a third.
 */

/**
 * Quote a single cell.
 *
 * A leading =, +, - or @ is prefixed with a quote: spreadsheet software treats
 * those as formulas, so a name like "=cmd" in exported data becomes executable
 * on open. The export is student and staff data typed by people, so this is a
 * real path, not a theoretical one.
 */
export function csvCell(value) {
  if (value == null) return ''
  const text = String(value)
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/** rows: array of arrays. The first row is treated as the header by callers. */
export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

/** Triggers a browser download. Returns nothing; failures are browser-level. */
export function downloadCsv(filename, rows) {
  // A BOM so Excel opens UTF-8 correctly -- without it Filipino names with
  // accents render as mojibake, which looks like data corruption to a user.
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** `activklass-users-2026-08-18.csv` */
export function stampedName(prefix) {
  return `activklass-${prefix}-${new Date().toISOString().slice(0, 10)}.csv`
}
