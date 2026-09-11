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

import StudentAccounts, { AccountRow, BulkCreate, signInConfirm, resetCopy, rowProblem, REQUIRED } from './StudentAccounts.jsx'
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

/* T-48: Deactivate is the whole-account switch, and the row has to say so.
   A tester read the old confirm ("hidden from your rosters") as "this class
   goes away" and was surprised the student could not sign in anywhere. */
describe('Deactivate / Reactivate on an account row', () => {
  const skittle = { id: 's9', first_name: 'Skittle', last_name: 'Reyes', login_id: 'slcsflu-231525' }
  const renderRow = (user) => render(<table><tbody><AccountRow user={user} classes={[HS]} onChanged={() => {}} /></tbody></table>)

  it('an active account shows "active" and offers Deactivate', () => {
    const html = renderRow({ ...skittle, status: 'active' })
    expect(html).toContain('>active<')
    expect(html).toContain('Deactivate')
    expect(html).not.toContain('inactive')
  })

  it('a deactivated account reads "sign-in off", never "inactive", and offers Reactivate', () => {
    const html = renderRow({ ...skittle, status: 'inactive' })
    expect(html).toContain('>sign-in off<')
    expect(html).not.toContain('>inactive<')
    expect(html).toContain('Reactivate')
  })

  it('the Deactivate confirm names the consequence and the per-class alternative', () => {
    const spec = signInConfirm.off('Skittle Reyes')
    expect(spec.message).toMatch(/stops Skittle Reyes signing in to ActivKlass at all/)
    expect(spec.message).toMatch(/stay on your rosters/)
    expect(spec.message).toMatch(/remove them from that class's roster/)
    expect(spec.message).not.toMatch(/hidden from your rosters/)
    expect(spec.tone).toBe('danger')
  })

  it('the Reactivate confirm says they can sign in again', () => {
    const spec = signInConfirm.on('Skittle Reyes')
    expect(spec.message).toMatch(/Skittle Reyes can sign in again/)
    expect(spec.confirmLabel).toBe('Turn sign-in on')
  })
})

/* T-46: a teacher-set password is a starting password again (the endpoint
   stamps is_temp_password on every reset), and the teacher has to hear that
   before handing it over -- "should change it" read as optional. */
describe('Reset password copy', () => {
  it('the dialog says the student will be asked to choose a new password, not that they should', () => {
    const msg = resetCopy.prompt('slcsflu-231525')
    expect(msg).toContain('replaces the password for slcsflu-231525 immediately')
    expect(msg).toMatch(/will be asked to choose a new password the next time they sign in/)
    expect(msg).not.toMatch(/should change/)
  })

  it('the toast repeats it after the reset', () => {
    const msg = resetCopy.done('slcsflu-231525')
    expect(msg).toContain('Password set for slcsflu-231525')
    expect(msg).toContain('nothing is emailed')
    expect(msg).toMatch(/pick their own the next time they sign in/)
  })
})

/* T-55: the file picker is a button bound to a hidden input, not the
   browser's bare "Choose File  No file chosen" text. */
describe('Create accounts from a file', () => {
  it('shows a Choose a file… button whose label opens the (still real) file input', () => {
    const html = render(<BulkCreate classes={[HS]} prefix="ucb" onDone={() => {}} />)
    expect(html).toContain('Choose a file…')
    expect(html).toContain('for="student-accounts-file"')
    expect(html).toMatch(/<input[^>]*id="student-accounts-file"[^>]*type="file"[^>]*accept=".csv,.xlsx"/)
    expect(html).toMatch(/<input[^>]*class="peer sr-only"/)
    expect(html).toContain('No file chosen')
    expect(html).toContain('Create accounts')
  })
})

describe('Birthdate is required to create a student (T-50)', () => {
  /* The guardian-access gate on the student's profile reads the birthdate
     and the student cannot set it themselves, so every creation path asks
     for it and says why. The endpoint refuses the row too (smoke_classes.py). */
  const row = { first_name: 'Ana', last_name: 'Cruz', student_number: '24231525', birthdate: '2008-03-14' }

  it('the Add-one form says under Birthdate what it is needed for', () => {
    state.classes = [HS]
    const html = render(<StudentAccounts classes={[HS]} rows={[]} />)
    expect(html).toContain('Needed before the student can set up guardian access.')
  })
  it('a file must carry the birthdate column, and the Columns line says so', () => {
    expect(REQUIRED).toContain('birthdate')
    const html = render(<BulkCreate classes={[HS]} prefix="ucb" onDone={() => {}} />)
    expect(html).toMatch(/first_name, last_name, student_number, birthdate/)
    expect(html).toContain('needed for guardian access')
  })
  it('a row without a birthdate is not ready; one with a bad or future date is told why', () => {
    expect(rowProblem(row, 'ucb')).toBe('')
    expect(rowProblem({ ...row, birthdate: '' }, 'ucb')).toMatch(/missing birthdate/)
    expect(rowProblem({ ...row, birthdate: undefined }, 'ucb')).toMatch(/missing birthdate/)
    expect(rowProblem({ ...row, birthdate: '14/03/2008' }, 'ucb')).toMatch(/YYYY-MM-DD/)
    expect(rowProblem({ ...row, birthdate: '2999-01-01' }, 'ucb')).toMatch(/future/)
  })
  it('an account made before the rule shows a "no birthdate" pill that points at its class', () => {
    const user = { id: 's1', first_name: 'Ana', last_name: 'Cruz', login_id: 'ucb-231525', status: 'active' }
    const without = render(<table><tbody><AccountRow user={user} classes={[HS]} onChanged={() => {}} /></tbody></table>)
    expect(without).toContain('no birthdate')
    expect(without).toContain('/teacher/classes/c-hs')
    const withOne = render(<table><tbody><AccountRow user={{ ...user, birthdate: '2008-03-14' }} classes={[HS]} onChanged={() => {}} /></tbody></table>)
    expect(withOne).not.toContain('no birthdate')
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
