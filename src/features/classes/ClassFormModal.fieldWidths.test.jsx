/**
 * T-158 (maykel_64440-232): "Grade / Year Level" is the longest label in the
 * row and gets the narrowest column in an even 4-column grid.
 *
 * Pins the proportional grid layout in ClassFormModal:
 * - sm:grid-cols-6 with Grade / Year Level getting sm:col-span-2 (33.3%)
 * - Max Students getting sm:col-span-1 (16.7%)
 * - School Year getting sm:col-span-3 (50%)
 * - Phone layout stacks via grid-cols-1
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('./ClassFormModal.jsx', import.meta.url)),
  'utf8'
)

describe('T-158 — proportional column widths for Row 4 (Grade Level / Max Students / School Year)', () => {
  it('uses a 6-column grid on desktop rather than equal 4 columns', () => {
    expect(source).toContain('grid-cols-1 sm:grid-cols-6 gap-3')
    expect(source).not.toContain('grid-cols-1 sm:grid-cols-4 gap-3')
  })

  it('allocates sm:col-span-2 to Grade / Year Level so options are not clipped', () => {
    expect(source).toMatch(/<label[^>]*col-span-1\s+sm:col-span-2[^>]*>[\s\S]*?Grade \/ Year Level/)
  })

  it('allocates sm:col-span-1 to Max Students', () => {
    expect(source).toMatch(/<label[^>]*col-span-1\s+sm:col-span-1[^>]*>[\s\S]*?Max Students/)
  })

  it('allocates sm:col-span-3 to School Year', () => {
    expect(source).toMatch(/<div[^>]*col-span-1\s+sm:col-span-3[^>]*>[\s\S]*?School Year/)
  })

  it('preserves min-h-[2.5rem] label reservation so inputs remain bottom-aligned across the row', () => {
    expect(source).toContain('min-h-0 sm:min-h-[2.5rem]')
  })
})
