/**
 * T-61 (maykel_64440-82): every Institution registration ended on "Your account
 * was created, but we could not finish setting it up." The cause was the rules
 * (T-51 changed the gender values; firestoreRules.test.js locks that end). This
 * locks the web half of the same fix — the part that decides how BADLY a refusal
 * lands.
 *
 * `createAccount` writes the subscription request BEFORE the users profile. Put
 * the profile first again and a refused request strands the account exactly as
 * maykel's did: a profile that says "request pending" with nothing in the queue,
 * and no way back in from the sign-in page. The order is the fix, so the order
 * is what is pinned — read from source, as historyWiring.test.js does, because
 * this is one async handler deep inside a six-step form.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./register.jsx', import.meta.url)), 'utf8')
const at = src.indexOf('async function createAccount(')
const body = at < 0 ? '' : src.slice(at, src.indexOf('\n  }\n', at))

describe('T-61 — an Institution request is written before the profile', () => {
  it('has the account-creating handler at all', () => {
    expect(at, 'createAccount is gone or renamed in register.jsx').toBeGreaterThan(-1)
  })

  it('writes subscription_requests first, and the users profile after it', () => {
    const request = body.indexOf("addDoc(collection(db, 'subscription_requests')")
    const profile = body.indexOf("setDoc(doc(db, 'users', uid)")
    expect(request, 'the institution request write is gone').toBeGreaterThan(-1)
    expect(profile, 'the profile write is gone').toBeGreaterThan(-1)
    expect(request, 'a refused request must not land after a profile that already says pending')
      .toBeLessThan(profile)
  })

  it('only files a request on the institution path', () => {
    const guard = body.indexOf("if (kind === 'institution')")
    const request = body.indexOf("addDoc(collection(db, 'subscription_requests')")
    expect(guard).toBeGreaterThan(-1)
    expect(request).toBeGreaterThan(guard)
  })

  it('sends the gender shape the rules now accept, not the old pronouns', () => {
    expect(src).not.toMatch(/['"](he|she|others)['"]\s*[,\]]/)
  })
})
