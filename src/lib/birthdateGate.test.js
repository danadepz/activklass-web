/**
 * A student cannot be created without a birthdate, on any path
 * (T-50, triplecookiemonster-64).
 *
 * Kristine found a real dependency: the student's Profile refuses to let them
 * manage guardian access until a birthdate is on file — and the student
 * cannot enter it themselves, by design — while Add Student took the field as
 * optional. The owner chose option 1: required on every creation path, and
 * refused by the endpoint.
 *
 * A gate is only as good as its flag. CLAUDE.md records the forced password
 * change shipping on five of six creation paths, the missed one being the
 * account that mattered most. So beyond the rule itself, this test is the
 * audit: **every file in src that posts to a student-creation endpoint must
 * reach for the one birthdate rule**, and the solo file upload must list the
 * column as required. A new creation path that skips the rule fails here the
 * day it is written; a path that quietly drops the call fails here too.
 *
 * The endpoint half (roster_utils.py REQUIRED_COLUMNS) is in the backend repo
 * and was proven live during verification — a row without a birthdate came
 * back in `failed` with the guardian sentence and nothing was created — but
 * cannot be pinned from this repo. smoke_classes.py over there does that.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { BIRTHDATE_HINT, birthdateError } from './validation.js'
import { REQUIRED as SOLO_UPLOAD_REQUIRED } from '../routes/teacher/StudentAccounts.jsx'

const SRC = fileURLToPath(new URL('..', import.meta.url))

/** Every .js/.jsx under src that is not a test. */
function sourceFiles(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sourceFiles(p, out)
    else if (/\.(jsx?|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

/* The ways this client creates a student account. Anything that calls one of
   these is a creation path and must validate the birthdate first. */
const CREATION_CALLS = [
  /students\/provision/,          // POST /api/classes/{id}/students/provision
  /\bcreateUser\b/,               // lib/admin.js → POST /api/admin/users (used as a mutationFn)
  /\bbulkCreateUsers\b/,          // lib/admin.js → POST /api/admin/users/bulk
]

describe('the rule itself (T-50)', () => {
  it('a missing birthdate is refused with the reason a teacher can act on', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(birthdateError(v)).toMatch(/Birthdate is required/)
      expect(birthdateError(v)).toMatch(/guardian access/)
    }
  })

  it('a real date passes, a rolled-over or future one does not', () => {
    expect(birthdateError('2010-03-14')).toBeFalsy()
    expect(birthdateError('2010-02-30')).toBeTruthy()   // February has no 30th
    expect(birthdateError('14/03/2010')).toBeTruthy()
    const next = new Date(); next.setFullYear(next.getFullYear() + 1)
    expect(birthdateError(next.toISOString().slice(0, 10))).toBeTruthy()
  })

  it('an edit screen may leave it blank but still checks a value when given', () => {
    expect(birthdateError('', { required: false })).toBeFalsy()
    expect(birthdateError('2010-02-30', { required: false })).toBeTruthy()
  })

  it('the hint says what the field is for, in one sentence, naming no vendor', () => {
    expect(BIRTHDATE_HINT).toMatch(/guardian access/)
    expect(BIRTHDATE_HINT).not.toMatch(/Firebase|Firestore|Flask/)
  })
})

describe('every creation path reaches for the rule (T-50 — the audit)', () => {
  const files = sourceFiles()
  const creators = files.filter((p) => {
    const s = readFileSync(p, 'utf8')
    return CREATION_CALLS.some((re) => re.test(s))
  }).filter((p) => !/[\\/]lib[\\/]admin\.js$/.test(p))   // the client wrapper, not a form

  it('finds the creation paths at all (guards against the audit going blind)', () => {
    const rel = creators.map((p) => relative(SRC, p).replace(/\\/g, '/'))
    expect(rel).toEqual(expect.arrayContaining([
      'routes/teacher/classes/$classId/index.jsx',
      'routes/teacher/StudentAccounts.jsx',
      'routes/admin/UsersTab.jsx',
      'routes/admin/BulkUpload.jsx',
    ]))
  })

  it.each(creators.map((p) => [relative(SRC, p).replace(/\\/g, '/'), p]))(
    '%s validates the birthdate before it creates anyone',
    (_rel, p) => {
      const s = readFileSync(p, 'utf8')
      // Either the shared rule called as REQUIRED — an Edit screen's
      // `{ required: false }` call does not count, or a file could keep that
      // one and drop the creation check unnoticed — or (the admin bulk upload,
      // which predates the rule) its own explicit missing-birthdate refusal.
      const required = (s.match(/birthdateError\([^)]*\)/g) ?? []).filter((c) => !/required:\s*false/.test(c))
      expect(required.length > 0 || /missing birthdate/.test(s), `${_rel} creates students without requiring the birthdate`).toBe(true)
    },
  )

  it('the class page checks it on both tabs of Add Student, and only optionally on Edit', () => {
    const s = readFileSync(join(SRC, 'routes/teacher/classes/$classId/index.jsx'), 'utf8')
    const calls = s.match(/birthdateError\([^)]*\)/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(3)
    expect(calls.filter((c) => /required:\s*false/.test(c))).toHaveLength(1)   // Edit, and only Edit
  })

  it('the solo file upload lists birthdate as a required column', () => {
    expect(SOLO_UPLOAD_REQUIRED).toContain('birthdate')
  })
})
