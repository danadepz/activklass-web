/**
 * T-112 (triplecookiemonster-141 item 9, Kristine 2026-10-01): "Remove Icon
 * for Change Password for consistency" -- it was the only card on the
 * Account page with an icon, and the comment above it claimed an app-wide
 * pattern that doesn't exist. Source-text pinning (the house pattern -- see
 * student/_layout.test.jsx), since this component is shared across four
 * screens (teacher/account.jsx, student/profile.jsx,
 * admin/SubscriptionTab.jsx, change-password.jsx) and a single source pin
 * covers all four without mocking Firebase auth to render each one.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./ChangePassword.jsx', import.meta.url)), 'utf8')

describe('T-112 — no lock icon on the Change password card, on any of the four screens', () => {
  it('no longer renders the 🔒 chip', () => {
    expect(src).not.toMatch(/🔒/)
  })

  it('the stale "app-wide card language" comment is gone with it', () => {
    expect(src).not.toMatch(/Icon-chip heading/)
  })

  it('the heading and the password rule subtitle are still there', () => {
    expect(src).toMatch(/Change password/)
    expect(src).toMatch(/\{PASSWORD_RULE\}/)
  })
})
