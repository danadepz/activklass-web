/**
 * T-154 (andecobs-220): the Dashboard's "Your classes" table is one of the
 * four screens the ticket named as degraded by an unbounded class field --
 * `classTitle(c)` and `c.subject` rendered with no overflow styling at all.
 *
 * Source-text pinning (the house pattern for this file -- see
 * `index.test.js`'s T-111 note on why: the dashboard pulls in several
 * Firestore-backed hooks a full render would need to stub just to reach one
 * line). Pins that both cells carry the clamp styling and a `title` holding
 * the un-clamped value.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')

describe('Dashboard "Your classes" table clamps a long class name/description (T-154)', () => {
  it('the class-name cell carries a title and an ellipsis clamp', () => {
    expect(src).toMatch(/title=\{classTitle\(c\)\}/)
    expect(src).toMatch(/overflow:\s*'hidden',\s*textOverflow:\s*'ellipsis',\s*whiteSpace:\s*'nowrap'/)
  })

  it('the Subject cell carries a title and an ellipsis clamp', () => {
    expect(src).toMatch(/title=\{c\.subject \|\| undefined\}/)
  })
})
