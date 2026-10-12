/**
 * Add User's Temporary Password field (T-173, andecobs-250): a label that
 * wrapped onto two lines, a placeholder that read as a suggested password,
 * and a redundant clause on the sign-in callout.
 *
 * Three things pinned here, all confirmed against the actual code first:
 *
 * 1. "Temporary Password (Optional)" now spans two grid columns instead of
 *    one, so it has room not to wrap -- "Middle Name (Optional)" and
 *    "Department (optional)" fit their single column; "Temporary Password
 *    (Optional)" is longer and did not.
 * 2. The placeholder "defaults to pass1234" is gone. It is NOT simply
 *    deleted: `app/api/admin.py:267`, read directly for this card, shows
 *    `password = data.get("password") or DEFAULT_PASSWORD` -- a blank
 *    submit really does create the account on pass1234, so that fact now
 *    lives as a helper line under the field instead of a placeholder that
 *    looked like a value to type.
 * 3. The sign-in callout drops "— this exact form, not the full employee
 *    number / LRN / student number", leaving just "They will sign in as
 *    <login>".
 *
 * Same render-gating pattern as addUser.test.jsx: `useState('')` is
 * intercepted so AddUserSection's `mode`/`role` controls seed straight to
 * the individual form without a click, since there is no DOM library here.
 */
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
      // CreateUserForm's own `blank` form object -- seeded with a valid
      // employee number (teacher) and LRN (student, the g12 default level)
      // so `loginPreview` is truthy and the sign-in callout actually renders,
      // instead of the "Their login will be <prefix>-<...>" fallback that an
      // untouched blank form always falls through to.
      if (init && typeof init === 'object' && 'employeeNumber' in init) {
        return real.useState({ ...init, employeeNumber: 'T-2024-018', lrn: '123456789012' })
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

const SETTINGS = { school: { name: 'San Roque National High School', login_prefix: 'srnhs' } }

function render(role) {
  seed.mode = 'individual'
  seed.role = role
  seed.calls = 0
  return renderToStaticMarkup(
    <AddUserSection onCreated={() => {}} settings={SETTINGS} users={[]} />,
  )
}

beforeEach(() => { seed.mode = ''; seed.role = ''; seed.calls = 0 })

describe('T-173 — Temporary Password label does not wrap', () => {
  it('spans two grid columns, so it has room for the whole phrase on one line', () => {
    const html = render('teacher')
    expect(html).toMatch(/<label style="[^"]*grid-column:span 2[^"]*">Temporary Password/)
  })
})

describe('T-173 — the placeholder is gone, the fact survives as a helper line', () => {
  it('no longer puts "defaults to pass1234" in the input as a placeholder', () => {
    const html = render('teacher')
    expect(html).not.toMatch(/placeholder="defaults to pass1234"/)
  })

  it('still tells the admin what a blank submit does, as text under the field', () => {
    const html = render('teacher')
    expect(html).toMatch(/Leave blank and they start on pass1234/)
  })

  it('holds for the student form too', () => {
    const html = render('student')
    expect(html).not.toMatch(/placeholder="defaults to pass1234"/)
    expect(html).toMatch(/Leave blank and they start on pass1234/)
  })
})

describe('T-173 — the sign-in callout drops the redundant clause', () => {
  it('reads "They will sign in as <login>" with nothing trailing it', () => {
    const html = render('teacher')
    expect(html).toMatch(/They will sign in as<\/span><strong[^>]*>srnhs-024018<\/strong>/)
    expect(html).not.toMatch(/this exact form, not the full/)
  })

  it('holds for the student form too', () => {
    const html = render('student')
    expect(html).toMatch(/They will sign in as<\/span><strong[^>]*>srnhs-789012<\/strong>/)
    expect(html).not.toMatch(/this exact form, not the full/)
  })
})
