/**
 * T-267 revision (owner, 2026-11-15): new accounts start on the school's ONE
 * standard temporary password. The screens that create accounts and show their
 * credentials must say so, must not promise a per-account generated password,
 * and must never carry the value itself (audit F-03: the bundle is public).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SCREENS = [
  './admin/BulkUpload.jsx',
  './admin/UsersTab.jsx',
  './teacher/StudentAccounts.jsx',
  './teacher/classes/$classId/index.jsx',
]
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const STALE = [
  /each with its own starting password/i,
  /different password for each account/i,
  /own generated starting password/i,
  /password is generated for them/i,
  /we generate a password/i,
]

describe('temporary-password copy on the account screens', () => {
  for (const rel of SCREENS) {
    it(`${rel} names the standard temporary password and no per-account generation`, () => {
      const src = read(rel)
      expect(src).toMatch(/standard temporary password/)
      for (const stale of STALE) expect(src).not.toMatch(stale)
      expect(src).not.toContain('pass1234')
    })
  }
})
