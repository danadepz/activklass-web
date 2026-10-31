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
 * 2. The placeholder "defaults to pass1234" is gone, and so, since audit
 *    F-03, is the shared fallback it described: `_prepare_user` in
 *    `app/api/admin.py` now reads
 *    `password = typed_password or generate_initial_password()`, so a blank
 *    submit mints a password for that account alone and returns it once as
 *    `initial_password`. The helper line under the field says that instead of
 *    naming a value, because naming one is how the old literal reached the
 *    production bundle.
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

  /* Audit F-03 changed what a blank submit DOES, so this pair changed with it.
     It used to assert the helper line named the shared value ("Leave blank and
     they start on pass1234") -- true at the time: api/admin.py really did fall
     back to one literal for every account. It no longer does; a blank field
     mints a password for that account alone, which no screen can know ahead of
     time. The helper line now promises where the admin will see it, and the
     literal must not reappear anywhere in this form -- it was published in the
     web production bundle precisely because screens like this one printed it. */
  it('tells the admin a password will be generated and shown to them once', () => {
    const html = render('teacher')
    expect(html).toMatch(/Leave blank and we generate a password for this account/)
    expect(html).toMatch(/shown to you once/)
  })

  it('never names a starting password anywhere in the form', () => {
    expect(render('teacher')).not.toMatch(/pass1234/)
    expect(render('student')).not.toMatch(/pass1234/)
  })

  it('holds for the student form too', () => {
    const html = render('student')
    expect(html).not.toMatch(/placeholder="defaults to pass1234"/)
    expect(html).toMatch(/Leave blank and we generate a password for this account/)
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
