/**
 * Render smoke tests for the analytics band.
 *
 * The band's bar geometry is arithmetic on live data, and the failure mode is
 * not a crash — it is `width: NaN%` or `height: Infinitypx`, which React writes
 * into the DOM without complaint and which renders as a bar of zero or of the
 * whole card. These assert the markup that comes out, so a divide-by-zero in a
 * scale cannot ship looking like an empty chart.
 *
 * Static markup only — no DOM environment needed, so the suite stays fast.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AnalyticsBand from './AnalyticsBand.jsx'
import { analyticsFor } from '@/lib/superadminAnalytics'

const slot = (used, seats) => ({
  used,
  seats,
  pct: seats ? Math.round((used / seats) * 100) : null,
  over: Boolean(seats && used > seats),
})

const row = ({
  id = 's1',
  type = 'institution',
  plan = 'standard',
  status = 'active',
  createdAt = null,
  students = slot(0, 500),
  teachers = slot(0, 10),
} = {}) => ({
  subscription: { id, type, plan, status, created_at: createdAt },
  owner: { kind: type, name: id },
  usage: { teachers, students },
})

const NOW = new Date(2026, 7, 19)

const render = (rows) =>
  renderToStaticMarkup(
    <AnalyticsBand
      analytics={analyticsFor(rows, { now: NOW })}
      total={rows.length}
      stale={false}
    />,
  )

/** Every numeric value the markup sets in an inline style. */
const styleNumbers = (html) =>
  [...html.matchAll(/(?:width|height):\s*([^;"]+)/g)].map((m) => m[1].trim())

const populated = [
  row({ id: 'i1', type: 'institution', plan: 'standard', createdAt: new Date(2026, 7, 2), students: slot(300, 500) }),
  row({ id: 'i2', type: 'institution', plan: 'pilot', status: 'trial', createdAt: new Date(2026, 6, 11), students: slot(120, 500) }),
  row({ id: 't1', type: 'teacher', plan: 'plus', status: 'active', createdAt: new Date(2026, 7, 14), students: slot(80, 400) }),
  row({ id: 't2', type: 'teacher', plan: 'standard', status: 'suspended', createdAt: new Date(2026, 5, 30), students: slot(200, 150) }),
]

describe('AnalyticsBand — geometry', () => {
  it('emits no NaN, Infinity or negative dimension on a populated slice', () => {
    const html = render(populated)
    const values = styleNumbers(html)
    expect(values.length).toBeGreaterThan(0)
    for (const value of values) {
      expect(value).not.toMatch(/NaN|Infinity|undefined|null/)
      expect(parseFloat(value)).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps every bar width within 0–100%', () => {
    const html = render(populated)
    const widths = [...html.matchAll(/width:\s*([\d.]+)%/g)].map((m) => parseFloat(m[1]))
    expect(widths.length).toBeGreaterThan(0)
    for (const width of widths) {
      expect(width).toBeGreaterThanOrEqual(0)
      expect(width).toBeLessThanOrEqual(100)
    }
  })

  it('does not divide by zero when every month is empty', () => {
    // peak 0 would make the column scale 0/0 without the clamp.
    const html = render([row({ createdAt: null })])
    expect(styleNumbers(html).every((v) => !/NaN/.test(v))).toBe(true)
  })

  it('renders an empty slice without throwing', () => {
    const html = render([])
    expect(html).toContain('No subscribers in this slice')
    expect(styleNumbers(html).every((v) => !/NaN/.test(v))).toBe(true)
  })
})

describe('AnalyticsBand — content', () => {
  it('shows the headline counts', () => {
    const html = render(populated)
    expect(html).toContain('Subscribers')
    expect(html).toContain('2 institutions · 2 solo')
    expect(html).toContain('Student seats')
  })

  it('reports aggregate utilisation over capped seats only', () => {
    // 300 + 120 + 80 + 200 = 700 used of 500 + 500 + 400 + 150 = 1550 -> 45%
    const html = render(populated)
    expect(html).toContain('45%')
    expect(html).toContain('700 of 1,550 student seats')
  })

  it('flags over-seat subscribers with the critical tone, not the good one', () => {
    const html = render(populated)
    expect(html).toContain('text-red-400')
    expect(html).toContain('Past a seat cap')
  })

  it('uses the good tone when nobody is over cap', () => {
    const html = render([row({ students: slot(10, 500) })])
    expect(html).toContain('Every subscriber within cap')
    expect(html).toContain('text-emerald-400')
  })

  it('degrades a single-plan mix to a sentence instead of a one-bar chart', () => {
    const html = render([row({ plan: 'pilot' }), row({ id: 's2', plan: 'pilot' })])
    expect(html).toContain('All')
    expect(html).toContain('Institution · pilot')
    // A single bar carries no comparison, so the plot is not drawn at all —
    // asserted on the plot's own aria-label rather than on the absence of the
    // series hue, which the signups columns also use.
    expect(html).not.toMatch(/aria-label="Plan mix:/)
  })

  it('draws bars in the validated series hue once there is a comparison', () => {
    const html = render(populated)
    expect(html).toMatch(/background-color:\s*#7c6ce4/)
  })

  it('surfaces undated rows in the subtitle rather than hiding them', () => {
    const html = render([row({ createdAt: null }), row({ id: 's2', createdAt: 'garbage' })])
    expect(html).toContain('2 undated')
  })

  it('omits the undated note when every row is dated', () => {
    const html = render([row({ createdAt: new Date(2026, 7, 2) })])
    expect(html).toContain('last 6 months')
    expect(html).not.toContain('undated')
  })

  it('labels the seat tile as no-data when every plan is uncapped', () => {
    const html = render([row({ students: { used: 40, seats: null, pct: null, over: false } })])
    expect(html).toContain('1 uncapped · 40 students')
    expect(html).toContain('—')
  })

  it('carries an accessible summary on each chart', () => {
    const html = render(populated)
    expect(html).toMatch(/aria-label="Signups per month:/)
    expect(html).toMatch(/aria-label="Plan mix:/)
  })

  it('dims rather than unmounts while refetching', () => {
    const html = renderToStaticMarkup(
      <AnalyticsBand analytics={analyticsFor(populated, { now: NOW })} total={4} stale />,
    )
    expect(html).toContain('opacity-60')
    expect(html).toContain('aria-busy="true"')
    // The numbers stay on screen — no skeleton swap, so nothing jumps.
    expect(html).toContain('45%')
  })
})
