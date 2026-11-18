/**
 * The admin console is a slim navy title bar over a separate sub navbar.
 * The account menu (avatar, name, role, chevron) sits at the right of the
 * title bar's single row, level with the title -- it is no longer lifted out
 * and centred across a two-row header, because the tabs moved into the sub
 * navbar below.
 *
 * Static source read, the house pattern for this shell (see navyGutterBleed.test.js).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')

describe('admin header: slim title bar with the account menu, tabs in a sub navbar', () => {
  it('puts the title and the account menu in one row of the navy bar', () => {
    const header = src.slice(src.indexOf('<header'), src.indexOf('</header>'))
    expect(header).toContain('ActivKlass')
    expect(header).toContain('<AccountMenu')
    expect(header).not.toContain('md:absolute')
  })

  it('keeps the title bar slim: a 12px vertical pad and a 32px title', () => {
    expect(src).toMatch(/padding: '12px 28px', position: 'relative'/)
    expect(src).toMatch(/fontSize: 32/)
  })

  it('renders the tabs in a sub navbar outside the navy header, not inside it', () => {
    const headerEnd = src.indexOf('</header>')
    const navAt = src.indexOf('<nav aria-label="Admin sections"')
    expect(navAt).toBeGreaterThan(headerEnd)
    expect(src.slice(src.indexOf('<header'), headerEnd)).not.toContain('TABS.map')
  })
})
