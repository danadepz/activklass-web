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

// register.jsx is CRLF, so a literal '\n  }\n' never matches a line break in
// it and indexOf silently returns -1 — slicing to -1 then grabs nearly the
// whole rest of the file instead of just the block. Find the matching
// closing brace by counting instead, so this holds on either line ending.
// searchFrom lets a caller skip past a brace that isn't the block's own
// (firestore.rules' `match /path/{id}` has one in the path itself).
function blockBody(source, sliceStart, searchFrom = sliceStart) {
  if (sliceStart < 0) return ''
  const open = source.indexOf('{', searchFrom)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(sliceStart, i + 1)
    }
  }
  return source.slice(sliceStart)
}

const src = readFileSync(fileURLToPath(new URL('./register.jsx', import.meta.url)), 'utf8')
const at = src.indexOf('async function createAccount(')
const body = blockBody(src, at)

// T-162: every field the institution path actually puts in the
// subscription_requests document — details()'s own keys, plus the four
// createAccount adds by hand right after spreading it in (uid, email,
// teacher_seats, students_per_teacher, student_seats) and the two literals
// (status, created_at) — read from source rather than re-typed, so this
// drifts with the real payload instead of a copy of it.
const detailsAt = src.indexOf('function details(')
const detailsBody = blockBody(src, detailsAt)
const detailsKeys = [...detailsBody.matchAll(/^\s*(?:\.\.\.\(form\.\w+\.trim\(\) && \{ )?(\w+):/gm)]
  .map((m) => m[1])
const sentKeys = [...new Set([...detailsKeys, 'uid', 'email', 'teacher_seats', 'students_per_teacher', 'student_seats', 'status', 'created_at'])]

const rulesPath = fileURLToPath(new URL('../../../activklass-backend/firestore.rules', import.meta.url))
const rules = readFileSync(rulesPath, 'utf8')
const rulesHeader = 'match /subscription_requests/{requestId}'
const rulesAt = rules.indexOf(rulesHeader)
const rulesBody = blockBody(rules, rulesAt, rulesAt < 0 ? rulesAt : rulesAt + rulesHeader.length)
const hasOnlyAt = rulesBody.indexOf('hasOnly([')
const hasOnlyList = hasOnlyAt < 0 ? '' : rulesBody.slice(hasOnlyAt, rulesBody.indexOf('])', hasOnlyAt))
const hasAllAt = rulesBody.indexOf('hasAll([')
const hasAllList = hasAllAt < 0 ? '' : rulesBody.slice(hasAllAt, rulesBody.indexOf('])', hasAllAt))
const permittedKeys = [...hasOnlyList.matchAll(/'(\w+)'/g)].map((m) => m[1])
const requiredKeys = [...hasAllList.matchAll(/'(\w+)'/g)].map((m) => m[1])

describe('T-162 — the Institution request payload and the rules agree on its shape', () => {
  it('found the subscription_requests create rule at all', () => {
    expect(rulesAt, 'the subscription_requests match block is gone or renamed in firestore.rules').toBeGreaterThan(-1)
    expect(permittedKeys.length, 'the hasOnly key list is gone or renamed').toBeGreaterThan(0)
    expect(requiredKeys.length, 'the hasAll key list is gone or renamed').toBeGreaterThan(0)
  })

  it('every key the form sends is one the rules permit (hasOnly)', () => {
    const missing = sentKeys.filter((key) => !permittedKeys.includes(key))
    expect(missing, `the rules refuse these fields the form still sends: ${missing.join(', ')}`).toEqual([])
  })

  it('every key the rules require (hasAll) is one the form actually sends', () => {
    const missing = requiredKeys.filter((key) => !sentKeys.includes(key))
    expect(missing, `the rules demand these fields but the form no longer sends them: ${missing.join(', ')}`).toEqual([])
  })
})

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
