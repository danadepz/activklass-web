import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const layoutSource = readFileSync(fileURLToPath(new URL('./_layout.jsx', import.meta.url)), 'utf8')
const appSource = readFileSync(fileURLToPath(new URL('../../App.jsx', import.meta.url)), 'utf8')

describe('Superadmin Layout Navigation — Consolidated Approvals Tab', () => {
  it('defines top-level tabs for Subscribers and Approvals', () => {
    expect(layoutSource).toMatch(/label:\s*'Subscribers'/)
    expect(layoutSource).toMatch(/label:\s*'Approvals'/)
    expect(layoutSource).toMatch(/waiting:\s*totalPending/)
  })

  it('aggregates pending teachers and school requests for the Approvals badge', () => {
    expect(layoutSource).toMatch(/const totalPending = \(pendingRequests\?\.length \|\| 0\) \+ \(pendingTeachers\?\.length \|\| 0\)/)
  })

  it('provides sub-navigation for Schools and Solo teachers when in Approvals', () => {
    expect(layoutSource).toMatch(/const isApprovals =/)
    expect(layoutSource).toMatch(/label:\s*'Schools'/)
    expect(layoutSource).toMatch(/label:\s*'Solo teachers'/)
    expect(layoutSource).toMatch(/aria-label="Approvals Queues"/)
  })

  it('provides route redirect for /superadmin/approvals in App.jsx', () => {
    expect(appSource).toMatch(/<Route path="approvals" element={<Navigate to="\/superadmin\/requests" replace \/>} \/>/)
  })
})
