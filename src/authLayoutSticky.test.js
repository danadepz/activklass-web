/**
 * The login page's navy panel stays pinned while the form column scrolls
 * (andecobs-44 / T-28).
 *
 * The brand <aside> in AuthLayout is `lg:sticky lg:top-0 lg:h-screen` on
 * purpose -- one viewport of navy that holds still while a tall right column
 * (the register walk, or the login page on a short window) scrolls past it.
 * It silently stopped working because index.css set `overflow-x: hidden` on
 * BODY as well as on html: any ancestor with a non-visible overflow becomes a
 * sticky element's scroll container, and position: sticky stops tracking the
 * viewport. The comment above the html rule even said so, and the body rule
 * beneath it undid it. A tester scrolled, the navy scrolled off, cream showed.
 *
 * There is no DOM here to scroll, so this pins the two facts the fix rests
 * on: the sticky ancestry is clean (body has no overflow rule; html keeps the
 * one that clips sideways scroll and still propagates to the viewport), and
 * the aside still asks to be sticky. Either drifting back reintroduces the
 * bug with no error anywhere.
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

describe('the auth shell can be sticky (T-28)', () => {
  const css = read('./index.css')

  it('body carries no overflow rule -- it would become the sticky scroll container', () => {
    const body = ruleBody(css, 'body')
    expect(body, 'no `body { }` rule found in index.css').not.toBeNull()
    expect(body).not.toMatch(/overflow(-x|-y)?\s*:/)
  })

  it('html still clips sideways scroll, which is where that rule belongs', () => {
    // Removing it from body must not have been "fixed" by removing it everywhere:
    // the phone-width clip the comment describes is still wanted.
    const html = ruleBody(css, 'html')
    expect(html, 'no `html { }` rule found in index.css').not.toBeNull()
    expect(html).toMatch(/overflow-x\s*:\s*hidden/)
  })

  it('the brand aside still asks to be pinned one viewport tall', () => {
    const layout = read('./components/AuthLayout.jsx')
    const aside = layout.match(/<aside[\s\S]*?className="([^"]*)"/)
    expect(aside, 'no <aside className=...> in AuthLayout').toBeTruthy()
    for (const cls of ['lg:sticky', 'lg:top-0', 'lg:h-screen']) {
      expect(aside[1], `aside lost ${cls}`).toContain(cls)
    }
  })
})
