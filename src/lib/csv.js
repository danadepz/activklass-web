/**
 * CSV building and download.
 *
 * Owned by the Admin pane (see OWNERSHIP.md -- this file used to claim the
 * logic lane in a comment the table never backed up, so it had no owner at
 * all). reports.jsx grew its own copy of this; anything new should import
 * from here rather than add a third.
 *
 * `saveBlob` is the one place a file leaves the app. Both download helpers
 * here and in lib/xlsx.js go through it, because they previously carried the
 * same eight lines and therefore the same bug twice.
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

/**
 * Hand a blob to the browser as a download.
 *
 * The anchor MUST be in the document when it is clicked. Chrome fires a
 * download from a detached anchor; Firefox, Safari and several download
 * blockers silently ignore it -- which is how "Export CSV not functioning"
 * (tester ticket T-03) looked intermittent for weeks. Revoking is deferred
 * to a macrotask for the same reason: Firefox resolves the object URL after
 * the click returns, so revoking inline can cancel the download it started.
 */
export function saveBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Triggers a browser download. Returns nothing; failures are browser-level. */
export function downloadCsv(filename, rows) {
  // A BOM so Excel opens UTF-8 correctly -- without it Filipino names with
  // accents render as mojibake, which looks like data corruption to a user.
  saveBlob(filename, new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
}

/** `activklass-users-2026-08-18.csv` */
export function stampedName(prefix) {
  return `activklass-${prefix}-${new Date().toISOString().slice(0, 10)}.csv`
}
