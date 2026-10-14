/**
 * T-179 (andecobs-271): "The information tooltip icon next to the section
 * heading Modules appears pixelated and low-resolution."
 *
 * InfoTooltip.jsx previously rendered the Unicode text character U+24D8 (ⓘ)
 * which fell back to jagged system fonts. It now renders a scalable vector
 * icon from src/components/icons.jsx.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import InfoTooltip from './InfoTooltip.jsx'

const src = readFileSync(fileURLToPath(new URL('./InfoTooltip.jsx', import.meta.url)), 'utf8')

describe('T-179 — InfoTooltip renders a vector icon, not a text character', () => {
  it('has no ⓘ unicode character anywhere in InfoTooltip.jsx', () => {
    // Unicode U+24D8 CIRCLED LATIN SMALL LETTER I must not be present
    expect(src).not.toContain('ⓘ')
    expect(src).not.toMatch(/\u24d8/)
  })

  it('imports the shared Info vector icon from components/icons', () => {
    expect(src).toMatch(/import\s*\{[^}]*Info[^}]*\}\s*from\s*['"]@\/components\/icons['"]/)
  })

  it('mounts the Info icon component inside the button', () => {
    expect(src).toMatch(/<button[\s\S]*?<Info\b[\s\S]*?<\/button>/)
  })

  it('renders an inline SVG icon inside the button', () => {
    const html = renderToStaticMarkup(<InfoTooltip label="Test tooltip">Explanation text</InfoTooltip>)
    expect(html).toContain('<button')
    expect(html).toContain('<svg')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('ⓘ')
  })
})
