/**
 * T-97 (andecobs-124): the Logs tab's timeline grew the page instead of
 * scrolling inside its own card as events accumulated. `history.jsx` renders
 * through async Firestore reads at module scope (same reason
 * `historyWiring.test.js` reads it as source rather than mounting it), so
 * this pins the scroll region the same way: present, bounded, and wrapping
 * the actual event groups rather than sitting beside them.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./history.jsx', import.meta.url)), 'utf8')

describe('T-97 — the Logs page scrolls its timeline instead of growing the page', () => {
  it('wraps the day groups in a bounded, scrollable region', () => {
    const marker = src.indexOf('data-scroll-region="class-logs"')
    expect(marker, 'no scroll region found in history.jsx').toBeGreaterThan(-1)

    const regionOpen = src.slice(0, marker).lastIndexOf('<div')
    const regionTag = src.slice(regionOpen, src.indexOf('>', marker) + 1)
    expect(regionTag).toMatch(/maxHeight:\s*560/)
    expect(regionTag).toMatch(/overflowY:\s*'auto'/)
    expect(regionTag).toMatch(/tabIndex=\{0\}/)

    // The region must wrap groups.map, not merely precede it -- otherwise the
    // page still grows with every day of activity.
    const mapCall = src.indexOf('groups.map(')
    expect(mapCall).toBeGreaterThan(marker)
    const regionCloseSearch = src.slice(mapCall)
    // The next sibling after the mapped groups (the empty-filter message)
    // must still be inside the region for it to be the real scroll container.
    expect(regionCloseSearch.indexOf('shown.length === 0')).toBeGreaterThan(-1)
  })
})
