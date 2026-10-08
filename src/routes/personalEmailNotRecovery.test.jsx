/**
 * T-90 (triplecookiemonster-119) — "Personal email" must never again claim to
 * be a password recovery address.
 *
 * Kristine read "(optional — their password recovery)" on Add student and
 * concluded the field should be mandatory. The label was the wrong half: an
 * issued student signs in behind `<prefix>-<6 digits>@activklass.internal`,
 * and POST /api/auth/forgot-password resolves the *sign-in* address only, so
 * no link is ever generated for a personal inbox. Nothing reads
 * `personal_email` for recovery anywhere in the app.
 *
 * The same false claim lived on three screens, and one branch had to survive
 * untouched: a solo teacher with NO school prefix really does sign their
 * students in with the personal address, so "(becomes their login)" is true
 * there and a reset link genuinely works. This pins all four facts.
 *
 * Static markup, the house pattern (no DOM library in this repo): the teacher
 * screen is rendered with the prefix varied through the stubbed auth hook.
 * The two admin call sites sit behind a role-picker that only a click opens,
 * so they are pinned by reading their source — the same trick
 * StudentAccounts.test.jsx already uses for the reset copy.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const state = vi.hoisted(() => ({
  profile: { id: 'T1', role: 'teacher', teaching_school_id: 'ucb', first_name: 'Maria' },
}))

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: state.profile }) }))
vi.mock('@/hooks/useMySubscription', () => ({
  useMySubscription: () => ({ kind: 'active', label: 'Subscribed', detail: 'Plus plan', isSolo: true, isLoading: false, locks: { quizBank: false, teacherGroups: false } }),
}))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [], isLoading: false }) }))
vi.mock('@/hooks/useTeacherStudents', () => ({ useTeacherStudents: () => ({ data: { rows: [], failed: [] }, isLoading: false, isError: false }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/api', () => ({ api: vi.fn() }))
vi.mock('@/lib/admin', () => ({ resetPassword: vi.fn(), setAccountDisabled: vi.fn() }))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn(async () => []), parseCsv: vi.fn() }))
vi.mock('@/lib/xlsx', () => ({ downloadXlsx: vi.fn(), readXlsxRows: vi.fn() }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(), promptDialog: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { AddStudentModal } from './teacher/StudentAccounts.jsx'

const HS = { id: 'c-hs', education_level: 'High School', grade_level: 'Grade 10', section: 'Rizal', subject_code: 'MATH10', student_ids: [] }

/* T-136 moved the Individual form (and the Personal email field this ticket
   is about) off the always-open card and into Add Student's modal -- same
   markup, now reached through AddStudentModal instead of the card directly. */
function renderWithPrefix(prefix) {
  state.profile = { ...state.profile, teaching_school_id: prefix }
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><AddStudentModal classes={[HS]} prefix={prefix} onClose={() => {}} onDone={() => {}} /></MemoryRouter>
      </QueryClientProvider>,
    )
  } finally {
    state.profile = { ...state.profile, teaching_school_id: 'ucb' }
  }
}

/** The one phrase the whole ticket is about, in either spelling. */
const RECOVERY_CLAIM = /password recovery|their recovery|recover their (password|account)/i

describe('T-90 · Add student: Personal email is a contact address, not a recovery inbox', () => {
  it('with a school prefix the label calls it a contact address and never promises recovery', () => {
    const html = renderWithPrefix('ucb')
    expect(html).toContain('Personal email')
    expect(html).toContain('a contact address, not their sign-in')
    expect(html).not.toMatch(RECOVERY_CLAIM)
  })

  it('and the row points the teacher at the reset that actually exists', () => {
    const html = renderWithPrefix('ucb')
    expect(html).toContain('They sign in with the issued login, not this address')
    expect(html).toContain('Reset password below is how they get back in')
  })

  it('MUST NOT CHANGE: with no prefix the address really is the login, and still says so', () => {
    const html = renderWithPrefix('')
    expect(html).toContain('becomes their login')
    expect(html).toContain('No school abbreviation is on your account')
    // the prefix-branch correction must not leak onto the branch where the
    // address genuinely is the sign-in -- a reset link does reach it there.
    expect(html).not.toContain('a contact address, not their sign-in')
    expect(html).not.toContain('Reset password below is how they get back in')
  })
})

describe('T-90 · the admin call sites carry the same correction', () => {
  const usersTab = readFileSync(fileURLToPath(new URL('./admin/UsersTab.jsx', import.meta.url)), 'utf8')
  const bulkUpload = readFileSync(fileURLToPath(new URL('./admin/BulkUpload.jsx', import.meta.url)), 'utf8')

  it("Add-user's Personal email label is a contact address, with no recovery claim beside it", () => {
    expect(usersTab).toContain('recommended — a contact address, not their sign-in')
    // the label and the tooltip that sits on the same <label>; the only other
    // "password recovery" left in this file is a code comment about an ADMIN
    // account, whose email really is the sign-in and really does get the link.
    const at = usersTab.indexOf('Personal email <span')
    expect(at, 'the Personal email label moved — re-point this slice').toBeGreaterThan(-1)
    expect(usersTab.slice(at - 600, at + 300)).not.toMatch(RECOVERY_CLAIM)
  })

  it('both Bulk upload row hints name the staff reset instead of a recovery inbox', () => {
    const hints = bulkUpload.match(/'Recommended — their own inbox[^']*'/g) ?? []
    expect(hints).toHaveLength(2) // one per role: student, teacher
    for (const hint of hints) {
      expect(hint).toContain('as a contact on file')
      expect(hint).toContain('Never the sign-in')
      expect(hint).toContain('a staff reset from this console is how they get back in')
    }
    expect(bulkUpload).not.toMatch(RECOVERY_CLAIM)
  })
})
