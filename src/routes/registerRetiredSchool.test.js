/**
 * T-272: a school purged while /register sat open must not be submitted from
 * the stale dropdown. The order is the fix, so it is read from source — the
 * house pattern for this one async handler (registerInstitutionOrder.test.js):
 * the picked entry is re-read with findActiveSchoolById BEFORE any Firebase
 * account exists, and THAT fresh entry — not the cached list — is what lands
 * in teaching_school_id and the request's school_abbr. firestore.rules refuses
 * a retired id regardless (firestoreRules.test.js).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./register.jsx', import.meta.url)), 'utf8')
const start = src.indexOf('async function createAccount()')
const body = src.slice(start) // createAccount and what follows it; every check is an order within it

describe('register.jsx · a stale school choice (T-272)', () => {
  it('re-reads the picked school before the account is created', () => {
    const recheck = body.indexOf('await findActiveSchoolById(form.schoolId)')
    const create = body.indexOf('createUserWithEmailAndPassword(')
    expect(start).toBeGreaterThan(-1)
    expect(recheck).toBeGreaterThan(-1)
    expect(recheck).toBeLessThan(create)
  })

  it('stops, refreshes the list and sends the person back to the school step', () => {
    const guard = body.slice(body.indexOf('if (!addingSchool && !picked)'))
    expect(guard).toMatch(/invalidateQueries\(\{ queryKey: \['school-directory'\] \}\)/)
    expect(guard).toMatch(/setStep\(3\)/)
    expect(guard.indexOf('return')).toBeLessThan(guard.indexOf('createUserWithEmailAndPassword('))
  })

  it('writes the freshly read entry, not the cached list item', () => {
    expect(body).toMatch(/: picked\b/)
    expect(body).not.toMatch(/: \(schools\.find\(\(s\) => s\.id === form\.schoolId\) \?\? null\)/)
  })

  it('does not hold the directory list fresh for a minute any more', () => {
    const query = src.slice(src.indexOf("queryKey: ['school-directory']"), src.indexOf("queryKey: ['school-directory']") + 120)
    expect(query).toMatch(/staleTime: 0/)
  })
})
