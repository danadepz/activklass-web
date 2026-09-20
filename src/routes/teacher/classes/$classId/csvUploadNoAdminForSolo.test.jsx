/**
 * T-91 (triplecookiemonster-118) — verification lock, beside the fix's own
 * csvUploadAccountKind.test.jsx.
 *
 * Kristine, on an individual teacher account, read "…so you can ask your
 * school admin to add them" and "Ask your school admin to create or re-enable
 * those accounts" over 40 unmatched rows. She has no admin; she creates those
 * accounts herself. The fix branches both sentences on `accountKind(profile)`
 * and hangs a link to the Student accounts page off the amber summary.
 *
 * What the fix's own test does not pin, and this one does: `accountKind`
 * returns THREE values, not two — a self-registered teacher who was approved
 * but never subscribed is `'none'`, not `'solo'` (see lib/subscription.js).
 * That teacher has no admin above her either, so she must read the same
 * admin-free copy. The branch therefore has to ask for `'school'` by name;
 * rewriting it as `accountKind(profile) !== 'solo'` would silently push every
 * 'none' teacher back into Kristine's bug, and this test is what stops that.
 *
 * House pattern: renderToStaticMarkup with the profile varied through the
 * stubbed auth hook (no DOM library in this repo). `preview` is
 * CsvUploadModal's own first `useState(null)`, seeded the way
 * rosterView.test.jsx seeds ClassDetailPage's `modal`, so the amber summary
 * under the preview renders without typing or a file.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ preview: null, seeded: false }))

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useState: (init) => {
      if (init === null && state.preview && !state.seeded) {
        state.seeded = true
        return real.useState(state.preview)
      }
      return real.useState(init)
    },
  }
})

let profile
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile, school: null }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }))
vi.mock('@/lib/roster', async (importOriginal) => ({
  ...(await importOriginal()),
  findStudentsByNumber: vi.fn(),
  findStudentByEmail: vi.fn(),
  addToRoster: vi.fn(),
}))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { CsvUploadModal } from './index.jsx'

/** Two unmatched rows and nothing matched — exactly Kristine's preview. */
const ALL_UNMATCHED = {
  matched: [],
  already: [],
  unmatched: [
    { label: 'Dela Cruz, Juan', id: '2024-90001', reason: 'no student account' },
    { label: 'Santos, Maria', id: '2024-90002', reason: 'no student account' },
  ],
}

function renderAs(p) {
  profile = p
  state.preview = ALL_UNMATCHED
  state.seeded = false
  return renderToStaticMarkup(
    <MemoryRouter>
      <CsvUploadModal classId="C1" enrolledIds={[]} maxStudents={0} onClose={() => {}} onDone={() => {}} />
    </MemoryRouter>,
  )
}

/** The phrase the ticket is about, in any casing. */
const ADMIN_CLAIM = /school admin/i
/** The link Kristine asked for, as a real anchor to the Student accounts page. */
const ACCOUNTS_LINK = /<a[^>]*href="\/teacher\/students"[^>]*>\s*Create student accounts/

describe('T-91 · Bulk Upload names the person who can actually create the accounts', () => {
  beforeEach(() => { state.preview = null; state.seeded = false })

  it('a solo subscriber is told to create the accounts and given the way through', () => {
    const html = renderAs({ id: 'T-solo', role: 'teacher', subscription_status: 'active' })
    expect(html).not.toMatch(ADMIN_CLAIM)
    expect(html).toMatch(/Create those students&#x27; accounts first, then upload this file again\./)
    expect(html).toMatch(ACCOUNTS_LINK)
  })

  it('a teacher with no school and no subscription yet reads the same admin-free copy', () => {
    // accountKind() === 'none' — approved, never subscribed. She has no admin
    // above her either, so the branch must test for 'school' by name.
    const html = renderAs({ id: 'T-none', role: 'teacher' })
    expect(html).not.toMatch(ADMIN_CLAIM)
    expect(html).toMatch(/Rows with no matching account are listed below\./)
    expect(html).toMatch(ACCOUNTS_LINK)
  })

  it('a school-issued teacher still reads the original wording, with no link', () => {
    const html = renderAs({ id: 'T-school', role: 'teacher', school_id: 'srnhs' })
    expect(html).toContain('ask your school admin to add them')
    expect(html).toContain('Ask your school admin to create or re-enable those accounts, then upload this file again.')
    expect(html).not.toMatch(ACCOUNTS_LINK)
    expect(html).not.toMatch(/Create those students&#x27; accounts first/)
  })
})
