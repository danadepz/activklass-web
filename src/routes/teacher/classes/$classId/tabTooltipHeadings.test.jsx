/**
 * T-177 (maykel_64440-253): maykel's two screenshots -- same class, same
 * session -- showed "Performance ⓘ" but "Class Record" with nothing after
 * it. His class had no grading configured, which put Class Record into its
 * empty state; record.jsx's tooltip was gated behind `bundle.configured &&`
 * on top of its own content check, so the marker never appeared there no
 * matter what, while Performance's sits unconditionally on the heading
 * (performance.jsx:149-151) and always shows.
 *
 * Owner decided option (a) 2026-10-12: the marker goes on every tab heading,
 * performance.jsx as the reference. Tracing the other three: modules.jsx and
 * scaffolds.jsx were already moved onto their headings by T-140 (04d4446),
 * in every render path each page has (including the empty-state ones) -- so
 * record.jsx's extra `bundle.configured &&` gate was the one real gap.
 *
 * Source-text test, the house pattern for these four files (see
 * recordWeightsAndAutoPost.test.js, performanceRiskTooltip.test.jsx): a full
 * render needs a heavy dependency mock for a claim that's really about where
 * the JSX puts the tooltip.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const recordSrc = readFileSync(fileURLToPath(new URL('./record.jsx', import.meta.url)), 'utf8')
const performanceSrc = readFileSync(fileURLToPath(new URL('./performance.jsx', import.meta.url)), 'utf8')
const modulesSrc = readFileSync(fileURLToPath(new URL('./modules.jsx', import.meta.url)), 'utf8')
const scaffoldsSrc = readFileSync(fileURLToPath(new URL('./scaffolds.jsx', import.meta.url)), 'utf8')

describe('T-177 — Class Record\'s heading tooltip is no longer gated behind `configured`', () => {
  it('does not require bundle.configured to show the marker (the maykel repro: no grading set up)', () => {
    // This is the exact gate that hid the marker on his class.
    expect(recordSrc).not.toMatch(/bundle\.configured && transmutationNote &&/)
  })

  it('still shows the marker only when there is a note to show, same content as before', () => {
    const at = recordSrc.indexOf('Class Record')
    const h1Close = recordSrc.indexOf('</h1>', at)
    const heading = recordSrc.slice(at, h1Close)
    expect(heading).toMatch(/\{transmutationNote && \(/)
    expect(heading).toContain('<InfoTooltip label="How this record is graded">{transmutationNote}</InfoTooltip>')
  })

  it('transmutationNote itself still depends only on grading mode, not on whether grading is configured', () => {
    // bundle.mode defaults to 'deped_k12' (lib/gradebook.js) whether or not a
    // gradebook has been configured, so a brand-new class still gets the note.
    expect(recordSrc).toMatch(/const transmutationNote = bundle\.mode === 'deped_k12'/)
  })
})

describe('T-177 — all four class tabs put the ⓘ on the <h1>, unconditionally', () => {
  it('Performance (the reference, T-137): unconditional, defined before the unconfigured branch', () => {
    const headerAt = performanceSrc.indexOf('const header = (')
    const unconfiguredAt = performanceSrc.indexOf('if (!bundle.configured)')
    expect(headerAt).toBeGreaterThan(-1)
    expect(unconfiguredAt).toBeGreaterThan(headerAt)
    const header = performanceSrc.slice(headerAt, unconfiguredAt)
    expect(header).toContain('Performance')
    expect(header).toContain('<InfoTooltip label="How Performance and Risk are calculated">')
    expect(header).not.toMatch(/bundle\.configured &&/)
  })

  it('Modules (T-140): the one header block is reused by both the empty and populated states', () => {
    const headerAt = modulesSrc.indexOf('const header = (')
    const emptyAt = modulesSrc.indexOf('if (modules.length === 0)')
    expect(headerAt).toBeGreaterThan(-1)
    expect(emptyAt).toBeGreaterThan(headerAt)
    const header = modulesSrc.slice(headerAt, emptyAt)
    expect(header).toContain('Modules')
    expect(header).toContain('<InfoTooltip label="What this tab is for">')
    expect(header).not.toMatch(/\.configured/)
    // Both the empty-state return and the populated return render it.
    const afterHeader = modulesSrc.slice(headerAt)
    const headerUses = afterHeader.match(/\{header\}/g) ?? []
    expect(headerUses.length).toBeGreaterThanOrEqual(2)
  })

  it('Scaffold Topics (T-140): every real render path (not loading/error) carries the marker on the h1', () => {
    const matches = [...scaffoldsSrc.matchAll(/<h1[^>]*>[\s\S]*?<\/h1>/g)]
    expect(matches.length).toBeGreaterThanOrEqual(2)
    for (const [heading] of matches) {
      expect(heading).toContain('Scaffold Topics')
      expect(heading).toContain('<InfoTooltip label="What this tab is for">')
    }
  })
})
