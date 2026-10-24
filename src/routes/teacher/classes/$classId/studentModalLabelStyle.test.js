/**
 * T-191 (andecobs-295): the Student details modal (EditStudentModal) mixed
 * two label systems. First Name / Last Name used Tailwind
 * `text-sm font-medium text-slate-700` (14px, weight 500, slate-700); every
 * other field in the same modal (ID Number, Middle Name, Program, Year, ...)
 * uses `labelStyle` (13px, weight 600, ink). The tester read that as First/
 * Last being the BOLD pair and asked for their bold removed -- backwards:
 * they are the lighter pair, a point larger. Following the ticket as filed
 * would have widened the gap it meant to close, so the card pins the actual
 * cause instead.
 *
 * Source-text test, the pattern this directory already uses
 * (classDetailIconsSweep.test.js, recordToolbarAndTitles.test.jsx): a full
 * render needs a heavy Firebase/dialog-behavior mock for a claim that's
 * really about which style object the JSX points at.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')

describe('T-191 — the Student details modal uses one label style throughout', () => {
  it('First Name and Last Name no longer carry the old Tailwind label classes', () => {
    expect(src).not.toMatch(/text-sm font-medium text-slate-700">First Name/)
    expect(src).not.toMatch(/text-sm font-medium text-slate-700">Last Name/)
  })

  it('First Name and Last Name render with labelStyle, like every other field in the modal', () => {
    expect(src).toMatch(/<span style=\{labelStyle\}>First Name/)
    expect(src).toMatch(/<span style=\{labelStyle\}>Last Name/)
  })

  it('the create-student form is untouched -- it already used labelStyle and is not this ticket', () => {
    expect(src).toMatch(/<label style=\{labelStyle\}>First Name/)
    expect(src).toMatch(/<label style=\{labelStyle\}>Last Name/)
  })
})
