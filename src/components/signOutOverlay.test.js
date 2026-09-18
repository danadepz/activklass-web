/**
 * T-77 (andecobs-97): Derick signed out from "Verifying your account" and the
 * confirmation dimmed only the card column — the navy panel beside it stayed
 * bright, so the dialog read as part of the page rather than over it.
 *
 * The overlay is `position: fixed; inset: 0`, which sounds like enough, but
 * AuthLayout's column creates a containing block, so "the whole screen" was
 * really "the whole column". The fix is the portal: the dialog is rendered into
 * document.body, outside any layout. Render it inline again and the tester's
 * screenshot comes straight back, with these style rules unchanged and nothing
 * else to notice.
 *
 * Read from source because a portal cannot be server-rendered — the house
 * pattern for wiring that renderToStaticMarkup cannot reach
 * (historyWiring.test.js, classTasksGuards.test.js).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./SignOutButton.jsx', import.meta.url)), 'utf8')

describe('T-77 — the sign-out confirmation covers the whole screen', () => {
  it('renders the dialog through a portal into document.body, not inside the layout', () => {
    expect(src).toMatch(/import \{ createPortal \} from 'react-dom'/)
    expect(src).toMatch(/\{asking && createPortal\(/)
    // the portal's second argument — the escape hatch out of AuthLayout's column
    expect(src).toMatch(/document\.body,?\s*\)/)
  })

  it('still covers the viewport and sits above the page', () => {
    const dialog = src.slice(src.indexOf('{asking && createPortal('))
    expect(dialog).toMatch(/position: 'fixed'/)
    expect(dialog).toMatch(/inset: 0/)
    expect(dialog).toMatch(/zIndex: 1000/)
  })

  it('keeps the dialog dismissible — Escape and a click on the backdrop', () => {
    expect(src).toMatch(/role="dialog"/)
    expect(src).toMatch(/aria-modal="true"/)
    expect(src).toMatch(/if \(e\.target === e\.currentTarget\) setAsking\(false\)/)
  })
})
