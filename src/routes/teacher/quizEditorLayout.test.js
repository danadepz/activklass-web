/**
 * The quiz editor is one centred column (T-35, andecobs-51).
 *
 * The tester filed no defect — he photographed a 1920-wide screen with the
 * editor hugging the left edge and roughly 900px of empty page beside it, and
 * asked for it to be centred, since nothing is ever going to fill that side.
 *
 * The card's warning is the thing worth pinning: the width was set in four
 * separate places, and centring some but not all of them is worse than
 * centring none — the header floats left while the body centres, and the page
 * looks broken rather than merely unbalanced. The fix collapsed all four into
 * one wrapper, so what this guards is that it stays one: a centred root, and
 * no orphaned width block left behind to drift out of line with it.
 *
 * Layout, so it is read from the source rather than measured — the browser
 * pass covered the actual pixels at 1920 and at 1280.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./quizzes.$quizId.jsx', import.meta.url)), 'utf8')

describe('quiz editor centring (T-35)', () => {
  it('centres the whole editor from a single wrapper', () => {
    expect(src).toMatch(/className="mx-auto max-w-3xl"/)
  })

  it('leaves no second width block to float out of line with it', () => {
    // Four containers each carried max-w-3xl before; centring a subset is the
    // failure the card called out. One is the wrapper; there must be no other.
    const widthBlocks = src.match(/max-w-3xl/g) ?? []
    expect(widthBlocks).toHaveLength(1)
  })

  it('the one that remains is the centred one', () => {
    const only = src.match(/[^\n]*max-w-3xl[^\n]*/)[0]
    expect(only).toContain('mx-auto')
  })

  it('does not centre by widening the column instead', () => {
    // The alternative the card said to offer rather than assume. Long question
    // text reads worse at max-w-5xl, and it is not what he asked for.
    expect(src).not.toMatch(/max-w-5xl|max-w-4xl/)
  })

  it('leaves the modals alone — they already centre themselves as overlays', () => {
    expect(src).toMatch(/maxWidth:\s*500/)
    expect(src).toMatch(/maxWidth:\s*760/)
  })
})

/**
 * Attempts, Opens and Closes share one line (T-86, andecobs-112).
 *
 * Derickk photographed the settings block under "Instructions (optional)" and
 * wrote only "Issue: Input box alignment." The picture is the report: the
 * Attempts label and its box sit about 30px above the Opens and Closes labels
 * and boxes on the same row, and the "Unlimited until it closes" tick lines up
 * with the *bottom* of the two date boxes.
 *
 * The cause is that the row's three cells are not the same height -- Attempts
 * carries the Unlimited tick under its input, the other two are label and
 * input only -- so a bottom-aligning row (`items-end`) pushes the two short
 * cells down until their bottoms meet the tall one's. Top-aligning is what
 * makes the three labels, and therefore the three boxes, share a line.
 *
 * There is no DOM library here, so the geometry cannot be measured in a test;
 * the browser pass did that (all three labels top 404.9, all three inputs top
 * 429.64, at 2133px wide and again at 377px where the row folds to two
 * columns). What is pinned here is the markup contract that produces it, for
 * both states the row has: the draft row, whose cells differ in height and so
 * must top-align, and the live "Change while it is live" strip, whose cells
 * are the same height because its Unlimited tick is a sibling of them rather
 * than a passenger inside the Attempts cell.
 */
describe('the quiz settings row lines up (T-86)', () => {
  /** The draft row: the grid whose first cell opens with the Attempts label. */
  const draftRow = src.match(
    /<div className="([^"]+)">\s*<div>\s*<label style=\{labelStyle\}>Attempts<\/label>/,
  )

  const liveSrc = src.slice(src.indexOf('function LiveSettings('), src.indexOf('function PostScoresButton('))

  it('still has the settings row the tester photographed', () => {
    expect(draftRow, 'no Attempts row in quizzes.$quizId.jsx').not.toBeNull()
    const row = src.slice(draftRow.index, src.indexOf('Students will read this as', draftRow.index))
    expect(row).toContain('>Opens<')
    expect(row).toContain('>Closes<')
  })

  it('top-aligns that row, so the three labels and the three boxes share a line', () => {
    expect(draftRow[1].split(/\s+/)).toContain('items-start')
  })

  it('never bottom-aligns it — that is the bug, and it looks like a 30px step', () => {
    expect(draftRow[1]).not.toMatch(/\bitems-(end|baseline)\b/)
  })

  it('keeps the Unlimited tick inside the Attempts cell, which is why the row is uneven', () => {
    // Between the Attempts label and the tick there is no `</div>`: the tick is
    // still a passenger in that cell, so the cell is taller than Opens and
    // Closes and the row's alignment rule is what decides the line.
    const from = src.indexOf('<label style={labelStyle}>Attempts</label>', draftRow.index)
    const span = src.slice(from, src.indexOf('Unlimited until it closes', from))
    expect(span).not.toContain('</div>')
  })

  it('leaves the live strip bottom-aligned, where its two cells are the same height', () => {
    // "Change while it is live" shows Attempts and Closes only, each a label
    // plus one input, so items-end and items-start put them on the same line.
    expect(liveSrc).toMatch(/<div className="mt-4 flex flex-wrap items-end gap-3">/)
  })

  it('keeps that strip’s Unlimited tick a sibling of its cells, not inside Attempts', () => {
    // The moment the tick moves into the Attempts cell, this row grows the
    // same uneven-height problem the draft row had, and items-end re-breaks it.
    const from = liveSrc.indexOf('<label style={labelStyle}>Attempts</label>')
    const span = liveSrc.slice(from, liveSrc.indexOf('Unlimited attempts until it closes', from))
    expect(span).toContain('</div>')
  })
})
