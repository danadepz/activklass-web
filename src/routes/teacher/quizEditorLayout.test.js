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

/* 2026-11-15, owner request: the column widened from max-w-3xl to max-w-5xl.
   T-35 had kept it at 3xl on purpose (long question text reads better
   narrow), but at that width the results table squeezed until a score like
   "6 / 14" wrapped onto two lines. 5xl matches the Quizzes list page. What
   T-35 actually guarded still holds: one centred wrapper sets the width. */
describe('quiz editor centring (T-35)', () => {
  it('centres the whole editor from a single wrapper, at the Quizzes page width', () => {
    expect(src).toMatch(/className="mx-auto max-w-5xl"/)
  })

  it('leaves no second width block to float out of line with it', () => {
    // Four containers each carried a max-w before; centring a subset is the
    // failure the card called out. One is the wrapper; there must be no other.
    const widthBlocks = src.match(/max-w-(3xl|4xl|5xl|6xl|7xl)/g) ?? []
    expect(widthBlocks).toHaveLength(1)
  })

  it('the one that remains is the centred one', () => {
    const only = src.match(/[^\n]*max-w-5xl[^\n]*/)[0]
    expect(only).toContain('mx-auto')
  })

  it('no longer uses the narrow max-w-3xl column', () => {
    expect(src).not.toMatch(/max-w-3xl/)
  })

  it('leaves the modals alone — they already centre themselves as overlays', () => {
    expect(src).toMatch(/maxWidth:\s*500/)
    expect(src).toMatch(/maxWidth:\s*760/)
  })
})

/**
 * A score reads as one figure (2026-11-15, owner request). In the results
 * table the Best Score column was squeezed until "6 / 14" broke at its spaces
 * into "6 /" over "14". The cells that print a score now never wrap; the
 * values themselves are unchanged.
 */
describe('scores stay on one line', () => {
  it('Best Score cell does not wrap, and still shows best / totalPoints', () => {
    const cell = src.match(/<td style=\{\{[^}]*\}\}>\s*\{best !== null \? `\$\{best\} \/ \$\{totalPoints\}` : '—'\}/)
    expect(cell, 'Best Score cell').not.toBeNull()
    expect(cell[0]).toContain("whiteSpace: 'nowrap'")
  })

  it('Attempts cell ("1 / 1") does not wrap', () => {
    const cell = src.match(/<td style=\{\{[^}]*\}\}>\s*\{finished\.length \|\| '—'\}/)
    expect(cell, 'Attempts cell').not.toBeNull()
    expect(cell[0]).toContain("whiteSpace: 'nowrap'")
  })

  it('each attempt score in the student pop-up does not wrap, value unchanged', () => {
    const at = src.indexOf('{a.total_score != null ? `${a.total_score} / ${a.total_possible ?? totalPoints}` : a.status}')
    expect(at).toBeGreaterThan(-1)
    const span = src.slice(src.lastIndexOf('<span', at), at)
    expect(span).toContain("whiteSpace: 'nowrap'")
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
 * must top-align, and the live "Quiz Settings" strip (named "Change while it
 * is live" until T-200), whose cells are the same height because its
 * Unlimited tick is a sibling of them rather than a passenger inside the
 * Allowed Attempts cell.
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
    const tick = src.slice(from).search(/Unlimited [Uu]ntil [Ii]t [Cc]loses|Unlimited until it closes/)
    const span = src.slice(from, from + tick)
    expect(span).not.toContain('</div>')
  })

  it('leaves the live strip bottom-aligned, where its two cells are the same height', () => {
    // "Quiz Settings" (T-200 renamed it from "Change while it is live") shows
    // Allowed Attempts and Closing Date and Time only, each a label plus one
    // input, so items-end and items-start put them on the same line.
    expect(liveSrc).toMatch(/<div className="mt-4 flex flex-wrap items-end gap-3">/)
  })

  it('keeps that strip’s Unlimited tick a sibling of its cells, not inside Allowed Attempts', () => {
    // The moment the tick moves into the Allowed Attempts cell, this row grows
    // the same uneven-height problem the draft row had, and items-end re-breaks it.
    const from = liveSrc.indexOf('<label style={labelStyle}>Allowed Attempts</label>')
    const span = liveSrc.slice(from, liveSrc.indexOf('Unlimited attempts until it closes', from))
    expect(span).toContain('</div>')
  })
})
