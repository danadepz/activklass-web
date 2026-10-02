/**
 * T-111 (triplecookiemonster-142 item 4, Kristine 2026-10-01; owner in-thread:
 * "the institution plan should be only visible when the profile is clicked"):
 * pins that the dashboard header no longer shows the subscription plan at
 * all -- that moved to the Account page, which the profile card already
 * links to. Source-text pinning (the house pattern -- see
 * student/_layout.test.jsx), since the dashboard page pulls in several
 * Firestore-backed hooks a full render would need to stub just to reach the
 * one header line being tested.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')

describe('T-111 — the dashboard header no longer renders the subscription plan', () => {
  it('no longer imports or renders SubscriptionBox', () => {
    expect(src).not.toMatch(/SubscriptionBox/)
  })

  it('names neither of the two old inconsistent labels', () => {
    expect(src).not.toMatch(/School plan/)
  })
})
