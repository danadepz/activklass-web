/**
 * Admin Users table layout (2026-11-17, owner request).
 *
 * 1. A long sign-in email broke mid-address onto two lines
 *    ("johnmichaelmendoza1234@gmai" / "l.com"). It now stays on one line,
 *    cut with an ellipsis, with the full value in a hover title.
 * 2. Status was a fixed 240px column, leaving a wide empty band on every
 *    row that shows only "Active". It is 210px: just "Active" plus
 *    "Default password" side by side (T-233 keeps them on one line).
 * 3. The admin page widened from 1100px to 1440px, so the seven columns fit
 *    without scrolling sideways on a typical desktop.
 *
 * Layout, so read from the source rather than measured.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const users = readFileSync(fileURLToPath(new URL('./UsersTab.jsx', import.meta.url)), 'utf8')
const page = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')

describe('Users table: sign-in stays on one line', () => {
  // The cell's text node: `>` then whitespace then the expression (CRLF-safe).
  const at = users.search(/>\s*\{user\.login_id \?\? user\.email\}\s*<\/span>/)
  const cell = users.slice(users.lastIndexOf('<span', at), at + 1)

  it('no longer breaks the address anywhere', () => {
    expect(users).not.toMatch(/overflowWrap:\s*'anywhere'/)
  })

  it('is nowrap with an ellipsis, and hovering shows the full value at once', () => {
    expect(cell).toContain("whiteSpace: 'nowrap'")
    expect(cell).toContain("textOverflow: 'ellipsis'")
    expect(cell).toContain("overflow: 'hidden'")
    expect(cell).toContain('onMouseEnter={showLoginTip}')
    // Our own tooltip, not the slow native `title` one the owner could not trigger.
    expect(cell).not.toContain('title=')
    expect(users).toMatch(/role="tooltip"[\s\S]{0,400}position: 'fixed'/)
  })

  it('only offers the tooltip when the value is actually cut off', () => {
    expect(users).toContain('if (el.scrollWidth <= el.clientWidth) return')
  })
})

describe('Users table: column widths', () => {
  const cols = [...users.matchAll(/<col(?: style=\{\{ width: (\d+) \}\})? \/>/g)].map((m) => (m[1] ? Number(m[1]) : null))

  it('keeps seven columns, Name taking the remaining width', () => {
    expect(cols).toHaveLength(7)
    expect(cols[0]).toBeNull()
  })

  it('sizes Sign-in, Status, Last Active and actions to their content', () => {
    // Name, Sign-in, ID / LRN, Role, Status, Last Active, actions
    expect(cols.slice(1)).toEqual([290, 140, 120, 210, 160, 240])
  })
})

describe('Admin page width', () => {
  it('header and main share a 1440px column (was 1100)', () => {
    expect(page.match(/maxWidth: 1440, margin: '0 auto'/g)).toHaveLength(2)
    expect(page).not.toMatch(/maxWidth: 1100/)
  })
})
