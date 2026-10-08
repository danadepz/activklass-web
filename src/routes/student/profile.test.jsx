/**
 * T-67 (triplecookiemonster-86): a solo teacher's student opened Profile and
 * read, twice, that their details and guardian access were "managed by your
 * school" -- they have no school on ActivKlass; their teacher made the account.
 * The same plan mismatch T-38 fixed on the sign-in page, one screen over.
 *
 * Pinned: neither sentence names a school, for either kind of student, and the
 * two neighbouring guardian-access states keep saying what they said -- no
 * birthdate still points at the teacher, and an adult still manages it.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

let profile
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile, refreshProfile: vi.fn() }) }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn() }))
vi.mock('@/hooks/useGuardianAccess', () => ({ useGuardianAccess: () => ({}) }))
vi.mock('@/components/ChangePassword', () => ({ default: () => null }))
// The panel is where the locked reason is shown; render just that sentence.
vi.mock('@/components/ParentalAccessPanel', () => ({
  default: ({ lockedReason }) => <p data-locked>{lockedReason ?? 'MANAGED BY THE STUDENT'}</p>,
}))

import StudentProfile from './profile.jsx'

const base = { id: 'S1', role: 'student', first_name: 'Skittle', last_name: 'Chan' }
function page(p) {
  profile = { ...base, ...p }
  return renderToStaticMarkup(<StudentProfile />).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

describe('T-67 — the student Profile does not say a school manages the account', () => {
  it("a minor's guardian-access sentence names the teacher, not a school", () => {
    const text = page({ birthdate: '2012-05-01' })
    expect(text).toMatch(/your parent or guardian has guardian access to your academic records under RA 10173\. It was set up for you by your teacher and cannot be changed here\./)
    expect(text).not.toMatch(/managed by your school/i)
  })

  it('the details footnote says they were set up for you and to ask the teacher', () => {
    const text = page({ birthdate: '2012-05-01' })
    expect(text).toMatch(/Your name and these details were set up for you\. Ask your teacher to correct anything that is wrong\./)
    expect(text).not.toMatch(/school/i)
  })

  it('no school anywhere for an adult either, who manages access themselves', () => {
    const text = page({ birthdate: '1990-01-01' })
    expect(text).toContain('MANAGED BY THE STUDENT')
    expect(text).not.toMatch(/managed by your school/i)
  })

  it('a student with no birthdate on file is still told to ask their teacher', () => {
    const text = page({ birthdate: null })
    expect(text).toMatch(/Your birthdate is not on file[^.]*\. Ask your teacher to add it to your record\./)
  })
})

describe('T-139 — student profile recovery email', () => {
  it('renders a recovery email field clearly labelled for recovery, not sign-in', () => {
    profile = { ...base, login_id: 'snhs-123456' }
    const markup = renderToStaticMarkup(<StudentProfile />)
    expect(markup).toContain('Password recovery email')
    expect(markup).toContain('Used to reset your password if you ever forget it')
    expect(markup).toContain('You will still sign in with your login ID')
    expect(markup).toContain('snhs-123456')
  })

  it('renders with existing personal_email value from profile', () => {
    profile = { ...base, personal_email: 'student@example.com' }
    const markup = renderToStaticMarkup(<StudentProfile />)
    expect(markup).toContain('value="student@example.com"')
  })
})
