/**
 * Render tests for the solo teacher's Students page and its Student accounts
 * tab, with every hook hard-coded. Static markup only (the house pattern,
 * see components/AnalyticsBand.test.jsx) — there is no DOM library in this
 * repo — so these pin what the screen shows for each account shape, not what
 * a click does. The submit path is exercised against the real endpoint by
 * the backend script instead.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  profile: { id: 'T1', role: 'teacher', teaching_school_id: 'ucb', first_name: 'Maria' },
  sub: { kind: 'active', label: 'Subscribed', detail: 'Plus plan', isSolo: true, isLoading: false, locks: { quizBank: false, teacherGroups: false } },
  classes: [],
  rows: [],
}))

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: state.profile }) }))
vi.mock('@/hooks/useMySubscription', () => ({ useMySubscription: () => state.sub }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: state.classes, isLoading: false }) }))
vi.mock('@/hooks/useTeacherStudents', () => ({ useTeacherStudents: () => ({ data: { rows: state.rows, failed: [] }, isLoading: false, isError: false }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/api', () => ({ api: vi.fn() }))
vi.mock('@/lib/admin', () => ({ resetPassword: vi.fn(), setAccountDisabled: vi.fn() }))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn(async () => []), parseCsv: vi.fn() }))
vi.mock('@/lib/xlsx', () => ({ downloadXlsx: vi.fn(), readXlsxRows: vi.fn() }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(), promptDialog: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import StudentAccounts from './StudentAccounts.jsx'
import StudentsPage from './students.jsx'
import { SubscriptionChip, SubscriptionBox } from '@/components/SubscriptionBadge.jsx'

const HS = { id: 'c-hs', education_level: 'High School', grade_level: 'Grade 10', section: 'Rizal', subject_code: 'MATH10', student_ids: ['s1'] }
const COLLEGE = { id: 'c-col', education_level: 'College', grade_level: '2nd', section: 'BSIT-2A', subject_code: 'IT201', student_ids: [] }

function render(el) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{el}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Student accounts tab', () => {
  it('always shows the form, with the three buttons, and derives the level from a school class', () => {
    state.classes = [HS]
    const html = render(<StudentAccounts classes={[HS]} rows={[]} />)
    expect(html).toContain('Into class')
    expect(html).toContain('MATH10 · Rizal')
    expect(html).toContain('High School · Grade 10 · Rizal')
    expect(html).toContain('the login comes from the LRN')
    expect(html).toContain('>LRN<')
    expect(html).toContain('Add student')
    expect(html).toContain('Download template')
    expect(html).toContain('Create accounts from a file')
    // the pattern line, before any digits are typed
    expect(html).toContain('ucb-&lt;last 6 digits of their LRN&gt;')
    expect(html).not.toContain('Level') // no level dropdown: the class decides
    expect(html).toContain('0 accounts')
  })

  it('a College class hides the LRN field and takes the login from the student number', () => {
    const html = render(<StudentAccounts classes={[COLLEGE]} rows={[]} />)
    expect(html).toContain('College · 2nd · BSIT-2A')
    expect(html).toContain('no LRN is asked for; the login comes from the student number')
    expect(html).not.toContain('>LRN<')
    expect(html).toContain('ucb-&lt;last 6 digits of their student number&gt;')
  })

  it('with no class yet the form stays on screen and points to My Classes', () => {
    const html = render(<StudentAccounts classes={[]} rows={[]} />)
    expect(html).toContain('No class yet')
    expect(html).toContain('href="/teacher/classes"')
    expect(html).toContain('Add student')
    expect(html).toContain('First name')
    expect(html).toContain('No student accounts yet')
  })

  it('without a school prefix the email becomes the login', () => {
    state.profile = { ...state.profile, teaching_school_id: '' }
    const html = render(<StudentAccounts classes={[HS]} rows={[]} />)
    expect(html).toContain('becomes their login')
    expect(html).toContain('No school abbreviation is on your account')
    state.profile = { ...state.profile, teaching_school_id: 'ucb' }
  })

  it('counts one account per student, not per class row', () => {
    const rows = [{ studentId: 's1', classId: 'c-hs' }, { studentId: 's1', classId: 'c-col' }, { studentId: 's2', classId: 'c-hs' }]
    const html = render(<StudentAccounts classes={[HS, COLLEGE]} rows={rows} />)
    expect(html).toContain('2 accounts')
    expect(html).toContain('Loading accounts')
  })
})

describe('Students page', () => {
  it('a solo subscriber gets the Directory / Student accounts tabs, on the Directory first', () => {
    state.classes = [HS]
    state.rows = [{ studentId: 's1', classId: 'c-hs', firstName: 'Juan', lastName: 'Dela Cruz', classLabel: 'MATH10 · Rizal', configured: false }]
    state.sub = { ...state.sub, isSolo: true }
    const html = render(<StudentsPage />)
    expect(html).toContain('📋 Directory')
    expect(html).toContain('🪪 Student accounts')
    expect(html).toContain('Dela Cruz, Juan')
    expect(html).toContain('Every student across your classes')
  })

  it('a school-issued teacher sees no tabs at all', () => {
    state.sub = { ...state.sub, kind: 'school', isSolo: false }
    const html = render(<StudentsPage />)
    expect(html).not.toContain('Student accounts')
    expect(html).toContain('Dela Cruz, Juan')
    state.sub = { ...state.sub, kind: 'active', isSolo: true }
  })

  it('with no classes a solo teacher still gets the tabs and the empty state', () => {
    state.classes = []
    const html = render(<StudentsPage />)
    expect(html).toContain('🪪 Student accounts')
    expect(html).toContain('No classes yet')
  })
})

describe('Subscription indicator', () => {
  const show = (sub) => { state.sub = { ...state.sub, ...sub }; return render(<><SubscriptionChip /><SubscriptionBox /></>) }

  it('paid solo teacher: Subscribed / Plus plan, linking to the Account page', () => {
    const html = show({ kind: 'active', label: 'Subscribed', detail: 'Plus plan', isLoading: false })
    expect(html).toContain('Subscribed')
    expect(html).toContain('Plus plan')
    expect(html).toContain('href="/teacher/account"')
  })

  it('trial: the chip counts the days', () => {
    const html = show({ kind: 'trial', label: 'Free trial', detail: '12 days left' })
    expect(html).toContain('Trial · 12 days left')
    expect(html).toContain('Free trial')
  })

  it('school-issued: the school plan, with the school named', () => {
    const html = show({ kind: 'school', label: 'School plan', detail: 'San Nicolas High School' })
    expect(html).toContain('School plan')
    expect(html).toContain('San Nicolas High School')
  })

  it('no record, or still loading: nothing at all', () => {
    expect(show({ kind: 'none', label: 'No subscription', detail: 'Individual account' })).toBe('')
    expect(show({ kind: 'active', isLoading: true })).toBe('')
  })
})
