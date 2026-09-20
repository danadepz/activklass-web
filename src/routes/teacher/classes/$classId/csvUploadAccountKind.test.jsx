/**
 * Bulk Upload's two "ask your school admin" sentences named an admin a solo
 * teacher does not have (T-91, triplecookiemonster-118). Kristine, signed in
 * as a solo trial teacher, uploaded a 40-row roster where every row came
 * back "no student account" -- and both the grey note above the file input
 * and the amber summary under the preview told her to go ask a school admin
 * who does not exist for her account. She creates those accounts herself,
 * on her own Student accounts page.
 *
 * Both sentences now branch on `accountKind(profile)`, the same signal
 * AddStudentModal already uses for its solo-only 'create' tab. Pinned here
 * with the house static-render pattern, varying the stubbed profile rather
 * than typing into the form: `preview` is CsvUploadModal's own first
 * `useState(null)` call, seeded the same way rosterView.test.jsx seeds
 * ClassDetailPage's `modal` -- the mock only needs to catch the first
 * null-initialised useState because CsvUploadModal is rendered on its own
 * here, not through the whole page.
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

const unmatchedPreview = {
  matched: [],
  already: [],
  unmatched: [{ label: 'Dela Cruz, Juan', id: '2024-0001', reason: 'no student account' }],
}

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

function render() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <CsvUploadModal classId="C1" enrolledIds={[]} maxStudents={0} onClose={() => {}} onDone={() => {}} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.preview = unmatchedPreview
  state.seeded = false
})

describe('T-91 — a school-issued teacher reads the unchanged wording', () => {
  beforeEach(() => { profile = { id: 'T1', role: 'teacher', school_id: 'S1' } })

  it('keeps "ask your school admin" in the grey note and the amber summary, with no account-creation link', () => {
    const html = render()
    expect(html).toContain('ask your school admin to add them')
    expect(html).toContain('Ask your school admin to create or re-enable')
    expect(html).not.toContain('Create student accounts')
    expect(html).not.toMatch(/Create those students' accounts/)
  })
})

describe('T-91 — a solo teacher is told to create the accounts herself', () => {
  beforeEach(() => { profile = { id: 'T2', role: 'teacher', subscription_status: 'trial', trial_ends_at: '2027-01-01' } })

  it('never mentions a school admin, and offers a way through to Student accounts', () => {
    const html = render()
    expect(html).not.toMatch(/school admin/)
    // renderToStaticMarkup HTML-escapes the apostrophe as &#x27;.
    expect(html).toMatch(/Rows with no matching account are listed below\. Create those students&#x27; accounts first/)
    expect(html).toMatch(/Create those students&#x27; accounts first, then upload this file again\./)
    expect(html).toMatch(/<a[^>]*href="\/teacher\/students"[^>]*>Create student accounts/)
  })
})
