/**
 * T-142 (triplecookiemonster-192, -193, -194): three findings on one screen.
 *
 * 192.1 — an assessment title truncated at ~8 characters ("Quiz 1 - Biol…")
 * while the Student column sat mostly empty a few pixels away. The column
 * header title now wraps instead of cutting off, and the column itself has
 * the room to show it.
 * 192.2 — the delete "×" was faint grey with no box, easy to miss and easy
 * to misclick. It is red and boxed now. (What it does was already checked:
 * `deleteAssessment` in record.jsx asks the teacher to type DELETE before it
 * runs — a visibility problem, not a missing-confirmation one.)
 * 193 — Export CSV and Lock period used to sit in RecordGrid's own toolbar,
 * crowded beside + Add assessment and Save. They now sit on the row that
 * holds Summary, hidden on the Summary tab itself (same as before — neither
 * ever rendered while viewing Summary, since RecordGrid didn't render then
 * either).
 * 194 — Summary and Lock period read muted grey in their default state while
 * Export CSV and + Add assessment read navy — inconsistent, not a disabled
 * state. All three default to the same navy "ghost" look now; the real
 * disabled state (All saved, nothing to save) is untouched.
 *
 * Source-text test, the pattern recordManualStamp.test.js and
 * recordWeightsAndAutoPost.test.js use for this file: a full render needs a
 * heavy dependency mock for a claim that's really about what the JSX
 * contains.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./record.jsx', import.meta.url)), 'utf8')

describe('T-142.1 — the assessment title wraps instead of truncating', () => {
  it('no longer clips the title to one line with an ellipsis', () => {
    // The exact old style this replaces.
    expect(src).not.toMatch(/maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'/)
  })

  it('wraps across lines, with room for a full title', () => {
    expect(src).toMatch(/maxWidth: 108, whiteSpace: 'normal', wordBreak: 'break-word'/)
  })

  it('gives the assessment column more room than before', () => {
    const before = src.match(/minWidth: 84\b/)
    expect(before).toBeNull()
    expect(src).toContain('minWidth: 128')
  })

  it('does not touch the Student column width', () => {
    // Still the original 176 -- "no student name truncated by the new widths".
    expect(src).toContain('minWidth: 176')
  })
})

describe('T-142.2 — the delete control is red, boxed, and unchanged in what it does', () => {
  it('no longer renders as a bare, faint, borderless ×', () => {
    expect(src).not.toMatch(/color: faint, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 \}\}\s*>\s*×/)
  })

  it('is red with a real border, sized as an obvious button', () => {
    const at = src.indexOf('aria-label={`Delete ${a.title}`}')
    expect(at).toBeGreaterThan(-1)
    const button = src.slice(at, src.indexOf('</button>', at))
    expect(button).toMatch(/color: red/)
    expect(button).toMatch(/border: '1\.5px solid rgba\(192,57,43/)
    expect(button).toMatch(/width: 20, height: 20/)
  })

  it('still confirms before deleting -- typing DELETE, not a bare click', () => {
    const at = src.indexOf('async function deleteAssessment(')
    expect(at).toBeGreaterThan(-1)
    const body = src.slice(at, src.indexOf('\n  }\n', at))
    expect(body).toMatch(/typeToConfirm: 'DELETE'/)
  })
})

describe('T-142.3 — Export CSV and Lock period moved to the Summary row', () => {
  it('RecordGrid\'s own toolbar no longer offers Export CSV or Lock period', () => {
    const gridAt = src.indexOf('function RecordGrid(')
    const gridEnd = src.indexOf('\nfunction SummaryView(')
    expect(gridAt).toBeGreaterThan(-1)
    expect(gridEnd).toBeGreaterThan(gridAt)
    const gridBody = src.slice(gridAt, gridEnd)
    expect(gridBody).not.toContain('Export CSV')
    expect(gridBody).not.toContain('Lock period')
    // + Add assessment and the save button are still there, where the work happens.
    expect(gridBody).toContain('Add assessment')
    expect(gridBody).toMatch(/All saved/)
  })

  it('the Summary row (ClassRecordPage) now offers both, only off the Summary tab', () => {
    const pageAt = src.indexOf('export default function ClassRecordPage(')
    expect(pageAt).toBeGreaterThan(-1)
    const pageBody = src.slice(pageAt)
    expect(pageBody).toContain('Export CSV')
    expect(pageBody).toContain('Lock period')
    expect(pageBody).toMatch(/tab !== 'summary' &&/)
  })
})

describe('T-142.4 — Summary and Lock period match Export CSV\'s colour when not active', () => {
  it('Lock period no longer overrides to muted when unlocked', () => {
    expect(src).not.toMatch(/locked \? lockBtnActive : \{ \.\.\.btnGhostSm, color: muted \}/)
    expect(src).toMatch(/locked \? lockBtnActive : btnGhostSm/)
  })

  it('Summary uses the navy ghost look when it is not the active tab', () => {
    expect(src).toMatch(/tab === 'summary' \? pillStyle\(true\) : \{ \.\.\.btnGhostSm, borderRadius: 999 \}/)
  })

  it('All saved is left alone -- still a real disabled state', () => {
    expect(src).toMatch(/disabled=\{dirtyCount === 0 \|\| saving\}/)
    expect(src).toContain('disabled:opacity-40 disabled:cursor-not-allowed')
  })
})
