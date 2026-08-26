import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { readXlsxRows } from './xlsx'

/** Build an in-memory .xlsx and wrap it like the File the uploader receives. */
async function fakeXlsxFile(rows) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Template')
  rows.forEach((r) => ws.addRow(r))
  const buffer = await wb.xlsx.writeBuffer()
  return { name: 'upload.xlsx', arrayBuffer: async () => buffer }
}

describe('readXlsxRows', () => {
  it('returns the sheet as trimmed strings', async () => {
    const file = await fakeXlsxFile([
      ['FIRST_NAME', 'LAST_NAME', 'STUDENT_NUMBER'],
      [' Ana ', 'Bautista', '2024-00123'],
    ])
    expect(await readXlsxRows(file)).toEqual([
      ['FIRST_NAME', 'LAST_NAME', 'STUDENT_NUMBER'],
      ['Ana', 'Bautista', '2024-00123'],
    ])
  })

  it('stringifies the typed values Excel hands back', async () => {
    // Excel types what people enter: an LRN becomes a number, a birthdate a
    // date. The uploader needs the text a CSV would have carried.
    const file = await fakeXlsxFile([
      ['LRN', 'BIRTHDATE'],
      [136728190501, new Date(Date.UTC(2010, 2, 14))],
    ])
    expect(await readXlsxRows(file)).toEqual([
      ['LRN', 'BIRTHDATE'],
      ['136728190501', '2010-03-14'],
    ])
  })
})
