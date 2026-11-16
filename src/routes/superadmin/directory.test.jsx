import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  fetchSchoolDirectoryAdmin,
  fetchDirectoryEntryAdmin,
  retireDirectoryEntryAdmin,
} from '@/lib/superadmin'

const directorySource = readFileSync(fileURLToPath(new URL('./directory.jsx', import.meta.url)), 'utf8')
const dialogSource = readFileSync(fileURLToPath(new URL('./RetireDirectoryDialog.jsx', import.meta.url)), 'utf8')
const superadminSource = readFileSync(fileURLToPath(new URL('../../lib/superadmin.js', import.meta.url)), 'utf8')

describe('Option B — School Directory Management for Super Admin', () => {
  it('exports API functions for admin directory review and retirement', () => {
    expect(typeof fetchSchoolDirectoryAdmin).toBe('function')
    expect(typeof fetchDirectoryEntryAdmin).toBe('function')
    expect(typeof retireDirectoryEntryAdmin).toBe('function')

    expect(superadminSource).toContain("api('/api/superadmin/directory')")
    expect(superadminSource).toContain("api(`/api/superadmin/directory/${directoryId}`)")
    expect(superadminSource).toContain("api(`/api/superadmin/directory/${directoryId}/retire`")
  })

  it('implements Option B policy distinction between Registered Institutions and School Directory', () => {
    expect(directorySource).toContain('Option B')
    expect(directorySource).toContain('Registered Institutions')
    expect(directorySource).toContain('School Directory')
    expect(directorySource).toMatch(/individual teachers may self-register under legitimate schools/i)
  })

  it('invalidates both admin and public registration queries upon retirement', () => {
    expect(directorySource).toContain("queryClient.invalidateQueries({ queryKey: ['superadmin-directory'] })")
    expect(directorySource).toContain("queryClient.invalidateQueries({ queryKey: ['school-directory'] })")
  })

  it('provides search and category filtering in directory.jsx', () => {
    expect(directorySource).toContain('search')
    expect(directorySource).toContain('filter')
    expect(directorySource).toContain("'all'")
    expect(directorySource).toContain("'active'")
    expect(directorySource).toContain("'retired'")
    expect(directorySource).toContain("'linked'")
    expect(directorySource).toContain("'independent'")
    expect(directorySource).toContain("'eligible'")
    expect(directorySource).toContain("'needs_review'")
  })

  it('disables retirement button when entry is linked to active institution or has affiliations', () => {
    expect(directorySource).toMatch(/disabled=\{hasLinkedSchool \|\| hasAffiliations \|\| isRetiring\}/)
  })

  it('RetireDirectoryDialog enforces explicit reason and confirmation before submit', () => {
    expect(dialogSource).toContain('Retirement Reason')
    expect(dialogSource).toContain('confirm-retire-checkbox')
    expect(dialogSource).toMatch(/canSubmit = reason\.trim\(\)\.length > 0/)
    expect(dialogSource).toContain('Option B Safe Retirement')
    expect(dialogSource).toContain('Preserves existing teacher profiles')
  })
})
