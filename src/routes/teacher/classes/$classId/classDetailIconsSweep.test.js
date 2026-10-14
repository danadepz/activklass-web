/**
 * T-149 (maykel_64440-235, andecobs via record.jsx): "Removal of the symbols
 * for consistency" on a class Overview, and the three locks in Class Record.
 *
 * _layout.jsx's three header MetaChips (subject, academic term, schedule)
 * carried emoji (📘 🗓 🕑) as the only thing distinguishing three otherwise
 * identical grey pills — those are real information, not decoration, so they
 * are replaced with real icons (BookOpen, CalendarCheck, Clock), never just
 * deleted. Edit Class / Delete Class (✏️ 🗑) are decorative and swap for
 * Edit / Trash. record.jsx's three 🔒 mark a real locked-grading-period
 * state (one even carried title="Locked") and are replaced with the shared
 * Lock icon, never removed.
 *
 * Source-text test, the pattern recordToolbarAndTitles.test.jsx (same
 * directory) uses: a full render needs a heavy dependency mock for a claim
 * that's really about what the JSX contains.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const layoutSrc = readFileSync(fileURLToPath(new URL('./_layout.jsx', import.meta.url)), 'utf8')
const recordSrc = readFileSync(fileURLToPath(new URL('./record.jsx', import.meta.url)), 'utf8')

describe('T-149 — class header chips keep real icons, not emoji', () => {
  it('_layout.jsx has no emoji left', () => {
    expect(layoutSrc).not.toMatch(/📘|🗓|🕑|✏️|🗑|🔒/)
  })

  it('MetaChip renders an icon component, not a text glyph', () => {
    expect(layoutSrc).toMatch(/function MetaChip\(\{ icon: Icon, children, monoFace \}\)/)
    expect(layoutSrc).toMatch(/\{Icon && <Icon className=/)
  })

  it('the three chips still use three different icons -- still distinguishable', () => {
    expect(layoutSrc).toMatch(/icon=\{BookOpen\}/)
    expect(layoutSrc).toMatch(/icon=\{CalendarCheck\}/)
    expect(layoutSrc).toMatch(/icon=\{Clock\}/)
  })

  it('Edit Class and Delete Class use Edit / Trash, not emoji', () => {
    expect(layoutSrc).toMatch(/<Edit className="[^"]*" \/> Edit Class/)
    expect(layoutSrc).toMatch(/<Trash className="[^"]*" \/> Delete Class/)
  })
})

describe('T-149 — Class Record keeps the locked-period state visible', () => {
  it('record.jsx has no 🔒 left', () => {
    expect(recordSrc).not.toMatch(/🔒/)
  })

  it('all three locked-period sites render the shared Lock icon', () => {
    expect(recordSrc.match(/<Lock\b/g)?.length).toBe(3)
  })

  it('the Summary table header still marks a locked period, title included', () => {
    expect(recordSrc).toMatch(/p\.locked && <Lock title="Locked"/)
  })

  it('Unlock period keeps its label text -- T-149 must not reword it', () => {
    expect(recordSrc).toMatch(/Unlock [Pp]eriod/)
    expect(recordSrc).toMatch(/Lock [Pp]eriod/)
  })
})
