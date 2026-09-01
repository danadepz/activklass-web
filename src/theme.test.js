/**
 * One typeface, and a heading you can still find without it.
 *
 * Tester ticket T-15 (andecobs-24, andecobs-28): "Font style should also remain
 * consistent throughout the system, with a sans-serif typeface recommended."
 * The owner took the suggestion, so the serif/sans pairing is gone.
 *
 * Two things have to hold together, and the second is the one that bites. Type
 * was carrying the heading hierarchy -- a serif face is what said "this is a
 * heading" -- and Tailwind's preflight resets h1-h6 to `font-weight: inherit`.
 * Drop the serif without putting weight in its place and every heading in the
 * app silently becomes body copy. So this file pins BOTH: one family
 * everywhere, and a heading that is still bold.
 *
 * The families are also asserted against index.css and index.html rather than
 * theme.js alone, because that is where this drifted before: --font-display
 * said Lexend while theme.js's heading token said DM Serif Display, so which
 * face a heading rendered in depended on which of the two a component happened
 * to read.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  heading,
  headingFamily,
  monoFamily,
  sansFamily,
  serif,
  serifAlt,
  serifAltFamily,
  serifFamily,
  sansUiFamily,
} from './theme'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/** Faces the app deliberately stopped loading when T-15 was taken. */
const RETIRED_FACES = ['DM Serif Display', 'Lexend', 'Inter']

describe('one typeface throughout (T-15)', () => {
  it('every family token is the same sans stack', () => {
    // The legacy names survive as aliases so other lanes did not all have to
    // change at once -- but none of them may resolve to a different face.
    for (const [name, family] of Object.entries({
      headingFamily, serifFamily, serifAltFamily, sansUiFamily,
    })) {
      expect(family, `${name} drifted from sansFamily`).toBe(sansFamily)
    }
  })

  it('names no serif face, in the token or the stack', () => {
    expect(sansFamily).toMatch(/sans-serif$/)
    for (const face of RETIRED_FACES) {
      expect(sansFamily).not.toContain(face)
      expect(headingFamily).not.toContain(face)
    }
    // 'serif' as a bare CSS generic would send every heading back to Georgia.
    expect(sansFamily.split(',').map((s) => s.trim())).not.toContain('serif')
  })

  it('the stylesheet and the token cannot disagree about a heading', () => {
    // The exact drift this file exists to catch: two sources, two faces.
    const css = read('./index.css')
    const display = css.match(/--font-display:\s*([^;]+);/)?.[1]?.trim()
    const sans = css.match(/--font-sans:\s*([^;]+);/)?.[1]?.trim()
    expect(display).toBeTruthy()
    expect(display).toBe(sans)
    expect(display.replace(/"/g, "'")).toBe(sansFamily.replace(/"/g, "'"))
  })

  it('does not load a face nothing renders in', () => {
    // Only the stylesheet request counts. index.html explains in a comment
    // which faces were dropped and why, and that prose naming them is the
    // point of it -- scanning the whole file would fail on its own changelog.
    const hrefs = [...read('../index.html').matchAll(/<link\b[^>]*href="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((href) => href.includes('fonts.googleapis.com'))
    expect(hrefs.length, 'no webfont request found at all').toBeGreaterThan(0)
    const requested = hrefs.join(' ')
    for (const face of RETIRED_FACES) {
      expect(requested, `${face} is still being fetched`).not.toContain(face.replace(/ /g, '+'))
    }
    expect(requested).toContain('Plus+Jakarta+Sans')
  })

  it('mono stays its own face — it was never what the tester meant', () => {
    // IDs, login codes and logs read as mono on purpose; "one sans-serif
    // typeface" was about the serif/sans body pairing, not about this.
    expect(monoFamily).toContain('JetBrains Mono')
    expect(monoFamily).not.toBe(sansFamily)
  })
})

describe('the heading still reads as a heading (T-15)', () => {
  it('carries its own weight, because the typeface no longer does', () => {
    // Tailwind preflight sets h1-h6 to font-weight: inherit. Without this the
    // headings verified in the browser at 700 would render at 400.
    expect(Number(heading.fontWeight)).toBeGreaterThanOrEqual(600)
    expect(heading.fontFamily).toBe(headingFamily)
  })

  it('the legacy heading objects are the heading, not a bare family', () => {
    // `serif` and `serifAlt` are spread into style={{ ...serif }} in pages that
    // have not been renamed; if they lost the weight those pages go flat.
    for (const [name, token] of Object.entries({ serif, serifAlt })) {
      expect(Number(token.fontWeight), `${name} lost its weight`).toBeGreaterThanOrEqual(600)
      expect(token.fontFamily, `${name} drifted`).toBe(headingFamily)
    }
  })
})
