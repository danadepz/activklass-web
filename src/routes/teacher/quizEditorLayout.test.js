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
