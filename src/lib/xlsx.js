/**
 * XLSX download and reading, for the admin bulk-upload round trip.
 *
 * CSV stays the wire format everywhere else (lib/csv.js); this exists because
 * the upload template needs what CSV cannot carry — bold UPPERCASE headers
 * with columns sized to their text — and whoever downloads an .xlsx template
 * will hand back an .xlsx file, so the uploader must read one too. exceljs is
 * ~1 MB, so it is imported lazily on the first download or .xlsx upload.
 *
 * Owned by the Admin pane (see OWNERSHIP.md). The download itself is
 * `saveBlob` in lib/csv.js -- one implementation, so the detached-anchor bug
 * cannot be fixed in one file and left standing in the other.
 */
import { saveBlob } from './csv'

async function excel() {
  const mod = await import('exceljs')
  return mod.default ?? mod
}

/**
 * Download a spreadsheet: bold UPPERCASE headers, each column auto-sized to
 * its longest text. `columns` are the lowercase keys the uploader parses; the
 * uppercasing is presentation only (the parser lowercases headers anyway).
 * `rows` is optional — the upload templates ship headers only.
 */
export async function downloadXlsx(filename, columns, rows = []) {
  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Template')
  ws.columns = columns.map((c, i) => ({
    header: c.toUpperCase(),
    width: Math.max(c.length, ...rows.map((r) => String(r[i] ?? '').length)) + 4,
  }))
  ws.getRow(1).font = { bold: true }
  rows.forEach((r) => ws.addRow(r))

  const buffer = await wb.xlsx.writeBuffer()
  saveBlob(filename, new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }))
}

/* One cell to a plain trimmed string. Excel hands back typed values: dates
   for anything date-formatted (birthdate), numbers for digit runs (LRN),
   rich text and formula objects for the rest — all of which must come out as
   the text a CSV would have carried. */
function cellText(value) {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map((part) => part.text).join('').trim()
    return String(value.text ?? value.result ?? '').trim()
  }
  return String(value).trim()
}

/** The first sheet of an .xlsx file as an array of arrays of strings. */
export async function readXlsxRows(file) {
  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) return []

  const rows = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells = []
    for (let i = 1; i <= row.cellCount; i++) cells.push(cellText(row.getCell(i).value))
    rows.push(cells)
  })
  return rows
}
