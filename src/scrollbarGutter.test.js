/**
 * The navbar's bell + avatar cluster jumps sideways between pages
 * (andecobs-209 / T-145).
 *
 * Nothing in the app reserved the scrollbar's gutter, so a page tall enough
 * to scroll (a visible scrollbar) had a viewport ~15px narrower than a short
 * page (no scrollbar). The navbar is full-width, so its right-hand cluster
 * landed 15px further right on the short page -- the navbar's own flex
 * layout never changed; the viewport under it did. `scrollbar-gutter:
 * stable` on html reserves that space on every page, scrolling or not, so
 * the viewport width never moves.
 *
 * There is no DOM here to actually scroll, so this pins the one fact the
 * fix rests on: the rule is present on `html`. Deleting it reintroduces the
 * rock with no error anywhere -- it only shows up as pixels moving between
 * two real pages.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/** Every declaration inside every top-level `selector { ... }` block, joined.
 *  index.css declares `html` twice (font smoothing, then overflow), so reading
 *  only the first block would miss the rule this file exists to check. */
function ruleBody(css, selector) {
  const re = new RegExp(`(^|[\\s}])${selector}\\s*\\{([^}]*)\\}`, 'gm')
  const bodies = [...css.matchAll(re)].map((m) => m[2])
  return bodies.length ? bodies.join('\n') : null
}

describe('the navbar cluster stays put between scrolling and non-scrolling pages (T-145)', () => {
  const css = read('./index.css')

  it('html reserves the scrollbar gutter, scrolling or not', () => {
    const html = ruleBody(css, 'html')
    expect(html, 'no `html { }` rule found in index.css').not.toBeNull()
    expect(html).toMatch(/scrollbar-gutter\s*:\s*stable/)
  })

  it('html still clips sideways scroll -- the fix must not have replaced that rule', () => {
    const html = ruleBody(css, 'html')
    expect(html).toMatch(/overflow-x\s*:\s*hidden/)
  })
})
