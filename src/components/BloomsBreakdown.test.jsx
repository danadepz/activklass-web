/**
 * Feature 4: the Bloom's Taxonomy breakdown on Scaffold Topics.
 *
 * The component computes nothing. These pin that (a) with no data -- which is
 * every real class today, since no question records a Bloom's level -- it
 * shows no numbers, no gaps and no recommendations, only the not-connected
 * notice and the static taxonomy order, labelled as a reference; and (b) when
 * handed data, it draws exactly that data. The numbers below are test inputs
 * passed to the component, never rendered on a real screen.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import BloomsBreakdown, { BLOOMS_LEVELS, bandOf, prerequisiteOf, levelName } from './BloomsBreakdown.jsx'

const render = (props) => renderToStaticMarkup(<BloomsBreakdown {...props} />)
const rows = (html) => [...html.matchAll(/data-level="(\w+)" data-band="(\w+)"/g)].map((m) => [m[1], m[2]])

describe('levels and helpers', () => {
  it('lists the six levels, lowest first, as "Level n – Name"', () => {
    expect(BLOOMS_LEVELS.map(levelName)).toEqual([
      'Level 1 – Remember', 'Level 2 – Understand', 'Level 3 – Apply',
      'Level 4 – Analyze', 'Level 5 – Evaluate', 'Level 6 – Create',
    ])
  })

  it('bands match Scaffold Topics: <60 needs, 60–80 developing, ≥80 mastered', () => {
    expect(bandOf(59.9)).toBe('needs')
    expect(bandOf(60)).toBe('developing')
    expect(bandOf(79)).toBe('developing')
    expect(bandOf(80)).toBe('mastered')
    expect(bandOf(null)).toBeNull()
    expect(bandOf(undefined)).toBeNull()
  })

  it('each level builds on the one below; Remember has none', () => {
    expect(prerequisiteOf('remember')).toBeNull()
    expect(prerequisiteOf('apply').key).toBe('understand')
    expect(prerequisiteOf('create').key).toBe('evaluate')
  })
})

describe('not connected (every class today)', () => {
  const html = render({ levels: null, recommendations: null })

  it('says plainly that results by level are not recorded yet', () => {
    expect(html).toContain('data-state="not-connected"')
    expect(html).toContain('Not connected yet')
    expect(html).toContain('not tagged with a Bloom’s level yet')
  })

  it('is one compact card: no bars, no level rows, no percentages', () => {
    expect(rows(html)).toEqual([])
    expect(html).not.toContain('role="img"')
    expect(html).not.toMatch(/\d+%/)
    expect(html).not.toContain('No data yet')
  })

  it('shows no gaps and no recommendations', () => {
    expect(html).not.toContain('data-gap=')
    expect(html).not.toContain('data-rec=')
    expect(html).not.toContain('Learning Gaps')
  })

  it('lists the six levels in order, labelled as reference, not student results', () => {
    expect(html).toContain('data-reference="blooms-order"')
    for (const b of BLOOMS_LEVELS) expect(html).toContain(b.label)
    expect(html).toContain('Reference only, not student results.')
  })

  it('uses no monospace face and nothing under 11px', () => {
    const all = html + render({ levels: { remember: 50 } })
    expect(all).not.toMatch(/JetBrains|monospace/)
    for (const [, px] of all.matchAll(/font-size:\s*([\d.]+)px/g)) expect(Number(px)).toBeGreaterThanOrEqual(11)
  })
})

describe('with data handed in', () => {
  const levels = { remember: 88, understand: 52, apply: 41, analyze: 70 } // evaluate/create absent
  const html = render({
    levels,
    recommendations: [
      { id: 'r2', level: 'apply', title: 'Worked examples' },
      { id: 'r1', level: 'understand', title: 'Explain-it-back cards', detail: 'Pairs explain each term.' },
    ],
  })

  it('bands each level from its own value, and leaves missing levels as no data', () => {
    expect(html).toContain('data-state="connected"')
    expect(rows(html)).toEqual([
      ['remember', 'mastered'], ['understand', 'needs'], ['apply', 'needs'],
      ['analyze', 'developing'], ['evaluate', 'none'], ['create', 'none'],
    ])
    expect(html).not.toContain('Not connected yet')
  })

  it('lists only the weak levels as gaps, and flags a weak prerequisite', () => {
    expect([...html.matchAll(/data-gap="(\w+)"/g)].map((m) => m[1])).toEqual(['understand', 'apply'])
    expect(html).toContain('Builds on Level 2 – Understand — also below 60%, so review it first.')
    expect(html).toContain('Builds on Level 1 – Remember.')
  })

  it('orders recommendations foundations-first and names each prerequisite', () => {
    expect([...html.matchAll(/data-rec="(\w+)"/g)].map((m) => m[1])).toEqual(['understand', 'apply'])
    expect(html).toContain('Prerequisite: Level 1 – Remember')
    expect(html).toContain('Prerequisite: Level 2 – Understand')
  })

  it('says nothing needs improvement when no level is below 60%', () => {
    expect(render({ levels: { remember: 90, understand: 81 } })).toContain('Nothing needs improvement right now.')
  })
})

describe('Scaffold Topics wiring', () => {
  const src = readFileSync(fileURLToPath(new URL('../routes/teacher/classes/$classId/scaffolds.jsx', import.meta.url)), 'utf8')

  it('renders the breakdown with no data -- nothing invented for the demo', () => {
    expect(src).toContain('<BloomsBreakdown levels={null} recommendations={null} />')
  })

  it('sits after the topic groups, so the real topic data comes first', () => {
    const at = src.indexOf('<BloomsBreakdown')
    for (const marker of ['{/* needs scaffolding */}', '<RemediationPanel', '{/* mastered */}']) {
      expect(src.indexOf(marker), marker).toBeGreaterThan(-1)
      expect(src.indexOf(marker), marker).toBeLessThan(at)
    }
  })
})
