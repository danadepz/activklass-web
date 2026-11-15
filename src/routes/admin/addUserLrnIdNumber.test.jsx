/**
 * Add User → Individual → Student: one "LRN/ID Number" field (owner request,
 * 2026-11-15) replaces the separate Student Number and LRN fields. UI only:
 *
 * - Grade 12 & below: the value must be a 12-digit LRN and is sent as both
 *   `lrn` and `student_number` (the server requires a student number on every
 *   student, so the payload keys are unchanged).
 * - College: the value needs 6+ digits and is sent as `student_number` only.
 * - The issued-login preview reads the same field.
 *
 * Render harness as in addUser.test.jsx: the first two useState('') calls are
 * AddUserSection's mode and role, seeded so CreateUserForm mounts.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const seed = vi.hoisted(() => ({ mode: '', role: '', calls: 0 }))

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useState: (init) => {
      if (init === '') {
        seed.calls += 1
        if (seed.calls === 1) return real.useState(seed.mode)
        if (seed.calls === 2) return real.useState(seed.role)
      }
      return real.useState(init)
    },
  }
})

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/admin', () => ({
  createUser: vi.fn(), bulkCreateUsers: vi.fn(),
  adminSchoolKey: ['fs-admin-school'], fetchSchoolSettings: vi.fn(), saveSchoolSettings: vi.fn(),
}))
vi.mock('@/lib/roster', () => ({ parseCsv: vi.fn() }))
vi.mock('@/lib/xlsx', () => ({ downloadXlsx: vi.fn(), readXlsxRows: vi.fn() }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true), promptDialog: vi.fn() }))

import { AddUserSection } from './UsersTab.jsx'

const SETTINGS = { school: { name: 'Tabor Hill College', login_prefix: 'thc' } }

function render(role) {
  seed.mode = 'individual'
  seed.role = role
  seed.calls = 0
  return renderToStaticMarkup(<AddUserSection onCreated={() => {}} settings={SETTINGS} users={[]} />)
}

beforeEach(() => { seed.mode = ''; seed.role = ''; seed.calls = 0 })

const src = readFileSync(fileURLToPath(new URL('./UsersTab.jsx', import.meta.url)), 'utf8')

describe('Add student: one LRN/ID Number field', () => {
  it('shows one LRN/ID Number field and no separate Student Number or LRN field', () => {
    const html = render('student')
    expect(html.match(/LRN\/ID Number/g)).toHaveLength(1)
    expect(html).not.toMatch(/>\s*Student Number\s*</)
    expect(html).not.toMatch(/<label[^>]*>\s*LRN\s*<input/)
  })

  it('defaults to Grade 12 & below: 12-digit LRN placeholder, numeric, capped at 12', () => {
    const html = render('student')
    expect(html).toContain('placeholder="12-digit LRN"')
    expect(html).toContain('inputMode="numeric"')
    expect(html).toContain('maxLength="12"')
    expect(html).toContain('DepEd LRN, 12 digits. College students have none — choose College above.')
  })

  it('teacher form is unchanged (Employee Number, no LRN/ID Number)', () => {
    const html = render('teacher')
    expect(html).toContain('Employee Number')
    expect(html).not.toContain('LRN/ID Number')
  })
})

describe('Add student: same rules and same payload keys, from one field', () => {
  it('binds the one input to form.studentNumber; the old LRN input is gone', () => {
    expect(src).toContain("onChange={set('studentNumber')}")
    expect(src).not.toContain("set('lrn')")
    expect(src).not.toContain('form.lrn')
  })

  it('validates Grade 12 & below as a 12-digit LRN and College as 6+ digits', () => {
    expect(src).toContain("idNumberError(form.studentNumber, { label: 'LRN/ID number' })")
    expect(src).toContain("lrnError(form.studentNumber, { collegePath: 'set Level to College' })")
    expect(src).toContain('The LRN/ID number needs at least 6 digits')
  })

  it('sends student_number always and lrn for Grade 12 & below, both from the one field', () => {
    expect(src).toContain('student_number: form.studentNumber.trim(),')
    expect(src).toContain('...(isG12 ? { lrn: form.studentNumber.trim() } : {}),')
  })

  it('issues the login preview from the same field', () => {
    expect(src).toContain("const idSource = role === 'student' ? form.studentNumber : form.employeeNumber")
  })
})
