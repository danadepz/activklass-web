/**
 * T-108 (triplecookiemonster-141 items 1 & 4, triplecookiemonster-142 items
 * 2 & 3, Kristine, 2026-10-01): four small things on the login screen and
 * the brand panel it shares with register/reset.
 *
 * Item 4 is the one that reads oddly until you look at the markup: both
 * headings wrote `don't just <em style={{color: gold}}>record</em>.` with
 * the full stop OUTSIDE the <em>, so "record" rendered gold and the period
 * rendered in the heading's own ink -- a stray-coloured period is exactly
 * what "use the same color for the word 'record.'" is pointing at.
 * AuthLayout renders the heading TWICE (the dark default panel and the
 * light variant="card" panel used on register/reset), so both copies have
 * to move, or the one a fix misses stays wrong.
 *
 * Same doubling for item 1: the three PERKS bullets render once per
 * variant, at two different font sizes (18 dark, 16 light), and both drop a
 * step while the light variant stays the smaller of the two.
 *
 * There is no DOM here (this repo runs vitest under Node, not jsdom), so
 * this reads the source the same way authLayoutSticky.test.js does for the
 * same reason -- a static render could show one variant but not prove the
 * other was touched too.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('T-108 — the "record." period, smaller bullets, and two login labels', () => {
  const layout = read('./components/AuthLayout.jsx')
  const loginSource = read('./routes/login.jsx')

  it('colors the period the same as "record" in BOTH AuthLayout variants', () => {
    // The period INSIDE the <em> close tag, not after it -- in both copies.
    expect(layout.match(/record\.<\/em>/g)).toHaveLength(2)
    // And nowhere does the old, stray-coloured shape survive.
    expect(layout).not.toMatch(/record<\/em>\./)
  })

  it('drops both bullet spans a step, keeping the dark panel the larger of the two', () => {
    const light = layout.match(/<span style=\{\{ fontSize: (\d+), color: inkMuted, lineHeight: 1\.45 \}\}>\{perk\}<\/span>/)
    const dark = layout.match(/<span style=\{\{ fontSize: (\d+), color: 'rgba\(250,250,246,0\.88\)', lineHeight: 1\.45 \}\}>\{perk\}<\/span>/)
    expect(light, 'light-variant perk span not found').toBeTruthy()
    expect(dark, 'dark-variant perk span not found').toBeTruthy()
    const lightSize = Number(light[1])
    const darkSize = Number(dark[1])
    // The pre-fix sizes were 16 (light) and 18 (dark) -- both must shrink.
    expect(lightSize).toBeLessThan(16)
    expect(darkSize).toBeLessThan(18)
    // The light card variant stays the smaller of the two, as it was before.
    expect(lightSize).toBeLessThan(darkSize)
  })

  it('the PERKS strings themselves are untouched -- only the font size changed', () => {
    expect(layout).toMatch(/const PERKS = \[/)
  })

  it('login reads "Welcome!" and "Email\\/Login ID"', () => {
    expect(loginSource).toMatch(/<AuthLayout title="Welcome!"/)
    expect(loginSource).toMatch(/>Email\/Login ID<\/label>/)
    expect(loginSource).not.toMatch(/Welcome back/)
    expect(loginSource).not.toMatch(/Email or login ID/)
  })

  /* T-130 (andecobs-173, updated 2026-10-08): the long sample placeholder
     ("you@school.edu.ph or snhs-123456") that T-108 preserved was overridden
     by the owner in favor of a clean, generic placeholder matching the password
     field ("Enter your email or login ID"). */
  it('carries a clean, generic placeholder without sample credentials (T-130)', () => {
    expect(loginSource).not.toContain('you@school.edu.ph or snhs-123456')
    expect(loginSource).toContain('placeholder="Enter your email or login ID"')
  })
})
