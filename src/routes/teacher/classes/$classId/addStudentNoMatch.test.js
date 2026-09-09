/**
 * A six-digit login tail no longer reads as "that student does not exist"
 * (T-44, triplecookiemonster-59).
 *
 * Kristine, on a solo teacher's account, searched Add Student for `231525` —
 * a student another teacher already had enrolled — and was told "No student
 * account matches that ID. Use 'Create New Manually' to add them yourself."
 * She was one click from creating a second copy of a real student.
 *
 * The search was right and the message was wrong. The student's number is
 * `24231525`; `231525` is its last six digits, which is the half of the issued
 * login `slcsflu-231525` that a person actually reads and types. This app shows
 * a teacher two different numbers for one student and said nothing about which
 * one this box wants.
 *
 * What is pinned here is the message, because a message is exactly what rots:
 * nothing else in the system fails if it goes back to claiming the account does
 * not exist. Three things are load-bearing and would each fail quietly.
 *
 *   1. The two branches must stay two. A school-issued teacher cannot create
 *      accounts, so telling them to "Create New Manually" is advice they cannot
 *      take; a solo subscriber has no admin to ask. Both messages changed, so
 *      both branches had to be carried through the new one — the easy mistake
 *      is to write one message for the case you were testing.
 *   2. The escape hatch must survive. The new message replaces the sentence
 *      that told them what to do when there really is no account, so it has to
 *      say that too, or a genuine "no such student" becomes a dead end.
 *   3. Anything that is not 4-8 bare digits must keep the message it had, word
 *      for word. That is what stops this from becoming advice about login tails
 *      shown to someone who typed an email or a student number.
 *
 * `noMatchMessage` is module-private inside a 1300-line route component, so it
 * is lifted out of the source and run on its own rather than rendering that
 * page or asking its lane to export a helper for a test. The browser pass drove
 * both accounts.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { isIssuedLoginId, issuedLoginId } from '@/lib/logins'

const src = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')

/** A named function declaration lifted out of the source and made callable. */
function lift(name, args, scope = {}) {
  const at = src.indexOf(`function ${name}(`)
  if (at === -1) return null
  let depth = 0
  const start = src.indexOf('{', src.indexOf(')', at))
  for (let j = start; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1
    else if (src[j] === '}') {
      depth -= 1
      if (depth === 0) {
        const names = Object.keys(scope)
        // eslint-disable-next-line no-new-func
        const make = new Function(...names, `return (function ${name}(${args}) ${src.slice(start, j + 1)})`)
        return make(...names.map((n) => scope[n]))
      }
    }
  }
  return null
}

const adminSuffix = lift('adminSuffix', 'school')
const noMatchMessage = lift('noMatchMessage', 'needle, { schoolIssued, school, loginExample }', {
  BARE_ID_DIGITS: /^\d{4,8}$/,
  adminSuffix,
})

const SCHOOL = { contact_email: 'registrar@sanroque.edu.ph' }
const solo = (needle, loginExample = '') =>
  noMatchMessage(needle, { schoolIssued: false, school: null, loginExample })
const issued = (needle, loginExample = '') =>
  noMatchMessage(needle, { schoolIssued: true, school: SCHOOL, loginExample })

/* The two sentences that shipped before this fix. Reproduced verbatim on
   purpose: they must still be reachable, unchanged, for every other input. */
const OLD_SOLO = 'No student account matches that ID. Use "Create New Manually" to add them yourself.'
const OLD_ISSUED =
  'No student account matches that ID. Ask your school admin (registrar@sanroque.edu.ph) ' +
  'to create the account, then add the student here.'

describe('the message a login tail gets (T-44)', () => {
  it('the helpers are still there to be called', () => {
    expect(noMatchMessage, 'no noMatchMessage in the class detail route').toBeTypeOf('function')
    expect(adminSuffix, 'no adminSuffix in the class detail route').toBeTypeOf('function')
  })

  it('stops claiming the account does not exist', () => {
    // The sentence that sent her towards a duplicate student.
    expect(solo('231525')).not.toContain('No student account matches that ID')
  })

  it('names the digits she typed rather than calling them "that ID"', () => {
    expect(solo('231525')).toContain('231525')
  })

  it('says the search was exact, and that those digits are only part of a number', () => {
    const msg = solo('231525')
    expect(msg).toMatch(/exactly/)
    expect(msg).toMatch(/tail of their ID number/)
  })

  it('says where the full number is shown, and offers email as well', () => {
    const msg = solo('231525')
    expect(msg).toMatch(/Students list/)
    expect(msg).toMatch(/by email/)
  })

  it('shows the teacher their own school prefix in the example when there is one', () => {
    expect(issued('200017', 'srnhs-200017')).toContain('a login like srnhs-200017')
  })

  it('stays generic rather than inventing a prefix when the teacher has none', () => {
    // A solo subscriber has no school, so there is no login to name. Naming a
    // made-up one would send them looking for a login that does not exist.
    const msg = solo('200017')
    expect(msg).toContain('a login ID')
    expect(msg).not.toMatch(/-\d{6}/)
  })
})

describe('both kinds of teacher keep advice they can act on (T-44)', () => {
  it('a solo subscriber is still offered Create New Manually', () => {
    // Without this the new message is a dead end for a student who genuinely
    // has no account yet.
    expect(solo('231525')).toContain('Create New Manually')
  })

  it('a school-issued teacher is sent to their admin, never told to create it', () => {
    // They cannot create accounts. This is the branch that must not be lost
    // when one message is rewritten and the other is forgotten.
    const msg = issued('231525', 'srnhs-231525')
    expect(msg).toContain('ask your school admin')
    expect(msg).toContain('registrar@sanroque.edu.ph')
    expect(msg, 'a school-issued teacher was told to create the account').not.toContain('Create New Manually')
  })

  it('names no admin address when the school has not published one', () => {
    expect(noMatchMessage('231525', { schoolIssued: true, school: {}, loginExample: '' }))
      .toContain('ask your school admin to create')
  })
})

describe('every other input keeps the message it had (T-44)', () => {
  it('a student number is answered exactly as before, word for word', () => {
    expect(solo('S2026-9999')).toBe(OLD_SOLO)
    expect(issued('S2026-9999')).toBe(OLD_ISSUED)
  })

  it('an email address is answered exactly as before', () => {
    expect(solo('nobody@example.com')).toBe(OLD_SOLO)
  })

  it('a full 12-digit LRN is not treated as a login tail', () => {
    // The real shape of an LRN. Advice about tails would be wrong here.
    expect(solo('136428200017')).toBe(OLD_SOLO)
  })

  it('only 4 to 8 bare digits get the new message', () => {
    expect(solo('123')).toBe(OLD_SOLO)
    expect(solo('123456789')).toBe(OLD_SOLO)
    for (const n of ['1234', '231525', '24231525']) {
      expect(solo(n), `${n} should get the tail message`).not.toBe(OLD_SOLO)
    }
  })
})

describe('the message stays sayable to a teacher (T-44)', () => {
  it('names no vendor, no exception and no raw error text', () => {
    for (const msg of [solo('231525'), issued('231525', 'srnhs-231525'), solo('S2026-9999')]) {
      expect(msg).not.toMatch(/Firebase|Firestore|Failed to fetch|undefined|null|NaN/)
    }
  })
})

describe('the example login is built from the teacher, not from the needle (T-44)', () => {
  it('the call site drops a prefix that could never have been issued', () => {
    // issuedLoginId('', n) is '', and isIssuedLoginId rejects it, so a teacher
    // with no school gets the generic wording rather than "-231525".
    expect(isIssuedLoginId(issuedLoginId('', '231525'))).toBe(false)
    expect(src).toMatch(/loginExample: isIssuedLoginId\(preview\) \? preview : ''/)
  })

  it('the example uses the school prefix, falling back to the teacher\'s own school id', () => {
    expect(src).toMatch(/issuedLoginId\(String\(school\?\.login_prefix \|\| profile\?\.teaching_school_id/)
    expect(issuedLoginId('srnhs', '136428200017')).toBe('srnhs-200017')
  })

  it('returns nothing to show for a needle too short to be a login tail', () => {
    expect(issuedLoginId('srnhs', '2015')).toBe('')
  })
})

describe('the fix did not disturb what already ran first (T-44)', () => {
  it('a search that matched a teacher is still answered before "not found"', () => {
    // A tester once typed her own teacher ID here and got a Grade 7 form back.
    // That guard sits in the same block this fix edited.
    const at = src.indexOf('if (teacherMatch)')
    const notFound = src.indexOf('} else if (!found)')
    expect(at, 'the teacher-account guard is gone').toBeGreaterThan(-1)
    expect(at).toBeLessThan(notFound)
  })

  it('the lookup itself is untouched — still exact, still one read', () => {
    expect(src).not.toMatch(/startsWith|includes\(needle\)|prefix.*search/i)
  })
})
