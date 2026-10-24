/**
 * T-184 (andecobs-293, 2026-10-24): the admin header is navy edge-to-edge,
 * but its own width is narrowed by the scrollbar-gutter index.css reserves
 * on <html>, leaving a pale strip beside it where html's own background
 * shows instead -- the pale strip reported on Class Overview.
 *
 * Unlike the teacher nav (position: sticky), this header scrolls away with
 * the page, so a viewport-fixed filler (right for the sticky case) would be
 * wrong here -- it would keep painting navy at the top of the viewport even
 * after the header had scrolled out of view. The fix instead gives the
 * header position: 'relative' and an absolutely-positioned child pinned to
 * its own box (top:0, bottom:0, right:-24) -- that tracks the header's
 * exact height and scroll position automatically, because it is laid out
 * relative to the header itself, not the viewport.
 *
 * Static source read, the house pattern this repo uses for a shell that
 * would otherwise need its Firestore-backed hooks stubbed just to render
 * (see teacher/_layout.test.jsx, student/_layout.test.jsx).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')

describe('T-184 — the scrollbar gutter beside the navy admin header is filled, not left pale', () => {
  it('the header is a positioned element, so an absolute child can anchor to its own box rather than the page', () => {
    const headerAt = src.indexOf('<header style={{ background: navy')
    expect(headerAt).toBeGreaterThan(-1)
    const headerTag = src.slice(headerAt, src.indexOf('>', headerAt) + 1)
    expect(headerTag).toMatch(/position:\s*'relative'/)
  })

  it('renders a navy filler, absolutely positioned to the header\'s own full height, bleeding into the gutter', () => {
    expect(src).toMatch(/position:\s*'absolute',\s*top:\s*0,\s*bottom:\s*0,\s*right:\s*-24,\s*width:\s*24,\s*background:\s*navy,\s*pointerEvents:\s*'none'/)
  })

  it('the filler is INSIDE the header (a sibling of its own content), not a page-level fixed element -- it must scroll away with the header, not stay pinned once the header has scrolled out of view', () => {
    const headerAt = src.indexOf('<header style={{ background: navy')
    const headerCloseAt = src.indexOf('</header>', headerAt)
    const fillerAt = src.indexOf("right: -24, width: 24, background: navy, pointerEvents: 'none' }} />", headerAt)
    expect(fillerAt).toBeGreaterThan(headerAt)
    expect(fillerAt).toBeLessThan(headerCloseAt)
  })
})
