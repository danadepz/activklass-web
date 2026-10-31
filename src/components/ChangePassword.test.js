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

/**
 * The first-login password flow (2026-10-31).
 *
 * Provisioned accounts start on one shared password, so the forced change is
 * the only thing bounding it -- and the change has to be something the SERVER
 * observed. This screen used to call Firebase's client `updatePassword()` and
 * then write `is_temp_password: false` into Firestore itself, which meant the
 * backend never learned a password had changed, and firestore.rules let a
 * student write that very field. Both halves are closed; these pin the client
 * half, in the same source-text style as the rest of this file.
 */
describe('first-login password change goes through the server', () => {
  it('posts the new password to the backend endpoint', () => {
    expect(src).toMatch(/\/api\/auth\/initial-password/)
  })

  it('sends the confirmation field too, so the server can re-check the match', () => {
    expect(src).toMatch(/confirm_password/)
  })

  it('no longer changes the password with the Firebase client SDK', () => {
    expect(src).not.toMatch(/\bupdatePassword\s*\(/)
  })

  it('no longer writes the first-login flag from the client', () => {
    // The rules now refuse this for a student anyway; the screen must not try.
    expect(src).not.toMatch(/is_temp_password:\s*false/)
    expect(src).not.toMatch(/updateDoc\s*\(/)
  })

  it('still reauthenticates with the current password before changing it', () => {
    // Proof of possession: on the first-login path it is the one moment that
    // distinguishes the intended holder from someone who merely knows the
    // shared starting password.
    expect(src).toMatch(/reauthenticateWithCredential/)
  })

  it('forces an ID-token refresh so the lifted claim is in hand', () => {
    // must_change_password rides in the token; without this the next request
    // still presents a restricted token and 403s.
    expect(src).toMatch(/getIdToken\(true\)/)
  })

  it('still collects a new password and a confirmation, with a submit button', () => {
    expect(src).toMatch(/New Password/)
    expect(src).toMatch(/Confirm New Password/)
    expect(src).toMatch(/type="submit"/)
  })
})
