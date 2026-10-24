/**
 * T-192 (andecobs-296): the navy-square-with-gold-icon badge beside
 * "New Assessment · Prelim" in the class record's New Assessment modal,
 * reported as "misplaced and inconsistent with standard modal header
 * designs." Not a defect -- the same badge is the house pattern on the
 * New Class button and the admin stat cards -- so this was a suggestion,
 * and the owner's decision (ledger, 2026-10-24) was option (c): remove the
 * badge from every modal header, not just this one.
 *
 * The scope is `iconSquare`, used in exactly two modal headers, both in
 * record.jsx: the New Assessment dialog (the one reported) and the
 * grade-contest review dialog (a ◆ in the same style and position).
 * `iconSquare` was also declared a second time in index.jsx, dead -- never
 * used there -- and is removed too, so the next pass doesn't find a
 * dangling constant.
 *
 * Source-text test, the pattern this directory already uses
 * (classDetailIconsSweep.test.js): a full render needs a heavy
 * Firebase/dialog-behavior mock for a claim that's really about which
 * elements the JSX renders.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const recordSrc = readFileSync(fileURLToPath(new URL('./record.jsx', import.meta.url)), 'utf8')
const indexSrc = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')

describe('T-192 — the badge is gone from both modal headers in record.jsx', () => {
  it('iconSquare is not declared or used anywhere in record.jsx any more', () => {
    expect(recordSrc).not.toMatch(/iconSquare/)
  })

  it('the New Assessment modal header no longer renders the Plus badge', () => {
    expect(recordSrc).not.toMatch(/<Plus className="h-\[18px\] w-\[18px\]" \/>/)
    expect(recordSrc).toMatch(/<h2 style=\{\{ \.\.\.serif, fontSize: 22, margin: 0, color: ink \}\}>New Assessment/)
  })

  it('Plus is no longer imported in record.jsx -- its only use was the badge', () => {
    expect(recordSrc).not.toMatch(/\bPlus\b/)
  })

  it('the grade-contest modal header no longer renders the ◆ badge', () => {
    expect(recordSrc).not.toMatch(/aria-hidden="true">◆<\/span>/)
  })

  it('neither modal header lost its title text -- this was a removal, not a rewrite', () => {
    expect(recordSrc).toMatch(/New Assessment · \{record\.period\.name\}/)
    expect(recordSrc).toMatch(/\{contest\.student_name\}/)
  })
})

describe('T-192 — the duplicate, unused iconSquare in index.jsx is gone', () => {
  it('index.jsx has no iconSquare left', () => {
    expect(indexSrc).not.toMatch(/iconSquare/)
  })
})
