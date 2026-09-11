/**
 * Step 1 of /register — the two cards a person chooses between (T-32,
 * andecobs-48, and the same root as T-31 / andecobs-47).
 *
 * The tester's complaint was the signpost, not the flow: "Institution — A
 * school and its staff" reads as the card for a faculty member, who is staff
 * of a school, and four steps later they are sizing a subscription they never
 * meant to buy. So what is pinned here is what each card *promises* — that
 * Institution makes you the school's admin and issues its logins, and that
 * Individual covers a teacher whose school is not on ActivKlass yet. Wording
 * a tester read and misread is behaviour; it locks like any other.
 *
 * Static markup, the house pattern (PendingSchoolRequestNotice.test.jsx is
 * the model). Step 1 is the initial state, so no interaction is needed.
 *
 * The Faculty nudge on the school step is the same complaint caught later in
 * the walk, and it is covered below. It used to be unreachable from a test —
 * gated on `step` and `form.position`, three steps in, on a predicate that
 * was module-private — so it was lifted into `WrongPathNudge` and the rule is
 * asserted directly, the way PendingSchoolRequestNotice was lifted out of the
 * teacher dashboard for exactly this reason.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(searchState.current), vi.fn()],
}))
// `?type=institution` opens on step 2, which is the only way a static render
// reaches the form itself (the notice under test sits above it).
const searchState = vi.hoisted(() => ({ current: '' }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
// Mutable so one test can put a finished account on the session (T-56); the
// default is what every other test here assumes — nobody signed in.
const authState = vi.hoisted(() => ({ current: { status: 'signed_out', firebaseUser: null, profile: null, user: null } }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => authState.current }))
vi.mock('@/lib/firebase', () => ({ auth: {}, db: {} }))
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
}))
vi.mock('firebase/firestore', () => ({
  Timestamp: { fromDate: (d) => d },
  addDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
}))
vi.mock('@/lib/schoolDirectory', () => ({
  abbrConflictError: () => null,
  addSchoolToDirectory: vi.fn(),
  fetchSchoolDirectory: vi.fn(),
}))

import Register, { WrongPathNudge, signedInAsSomeoneElse } from './register.jsx'

const step1 = () => renderToStaticMarkup(<Register />)

describe('/register step 1 — choosing a path', () => {
  it('says the Institution path makes you the school’s admin and issues its logins', () => {
    const html = step1()
    expect(html).toContain('Set up your school’s subscription')
    expect(html).toContain('you’ll be its admin')
    expect(html).toContain('issue every teacher’s and student’s login')
  })

  /* The card that a faculty member should have picked has to say it covers
     them even when their school has never heard of ActivKlass — that was the
     reason the other card looked like the only fit. */
  it('says the Individual path covers a teacher whose school is not on ActivKlass yet', () => {
    const html = step1()
    expect(html).toContain('A teacher signing up alone')
    expect(html).toContain('isn’t on ActivKlass yet')
  })

  /* The exact sentence the tester read and acted on. If either card ever goes
     back to describing who the account is *for* rather than what it does,
     this is the assertion that should stop it. */
  it('no longer offers the Institution card as the place for a school’s staff', () => {
    expect(step1()).not.toContain('A school and its staff')
  })
})

/* The second half of the same complaint: someone who picked Institution and
   then tells the form they are Faculty is on the wrong path, and step 3 says
   so before they reach the seats. The rule is "not leadership", not "is
   faculty" — a position nobody has thought of yet has to nudge too. */
describe('the Faculty nudge on the school step', () => {
  const nudge = (props) => renderToStaticMarkup(<WrongPathNudge {...props} />)
  const SENTENCE = 'Just here to teach? Individual is the faster path'

  it('tells a faculty member on the institution path that Individual is faster', () => {
    expect(nudge({ kind: 'institution', position: 'faculty' })).toContain(SENTENCE)
  })

  it('nudges any position that is not one of the three leadership ones', () => {
    expect(nudge({ kind: 'institution', position: 'registrar' })).toContain(SENTENCE)
  })

  it('stays quiet for the positions the institution path is actually for', () => {
    for (const position of ['program_chair', 'dean', 'admin']) {
      expect(nudge({ kind: 'institution', position })).toBe('')
    }
  })

  it('stays quiet before a position is chosen', () => {
    expect(nudge({ kind: 'institution', position: '' })).toBe('')
  })

  /* Step 3 renders on both paths, so the kind has to be part of the rule:
     a solo teacher is already where they should be. */
  it('stays quiet on the individual path, faculty or not', () => {
    expect(nudge({ kind: 'individual', position: 'faculty' })).toBe('')
    expect(nudge({ kind: 'individual', position: 'dean' })).toBe('')
  })
})

/* T-56 (maykel_64440-73, -75, -76): registering on a browser still signed in
   as Marites handed the tester HER dashboard — the submit saw a session, took
   it for a registration to resume, found a finished profile and went to the
   portal. Nothing was created, nothing said so. The rule now: a session is
   only ours to finish when it is the same email. */
describe('registering while another account is signed in', () => {
  const MARITES = 'srnhs-260101@activklass.internal'

  it('refuses to finish someone else’s session, naming the account that is signed in', () => {
    const msg = signedInAsSomeoneElse(MARITES, 'new.teacher@school.edu.ph')
    expect(msg).toContain(`signed in as ${MARITES}`)
    expect(msg).toContain('Sign out')
  })

  /* The resume path this branch exists for: a run that died after the login
     was created, retried with the same address — case and whitespace are not
     a different person. */
  it('lets the same email through, however it is typed', () => {
    expect(signedInAsSomeoneElse(MARITES, MARITES)).toBe('')
    expect(signedInAsSomeoneElse(MARITES, `  ${MARITES.toUpperCase()} `)).toBe('')
  })

  it('has nothing to say when nobody is signed in', () => {
    expect(signedInAsSomeoneElse(null, 'new.teacher@school.edu.ph')).toBe('')
    expect(signedInAsSomeoneElse(undefined, '')).toBe('')
  })

  /* Six steps is a long way to walk before hearing it, so the page says so
     from step 2 on, with the way out beside it. Only for a FINISHED account —
     the half-made one keeps its own "just complete your profile" notice. */
  it('tells a signed-in teacher up front, with a Sign out beside it', () => {
    authState.current = { status: 'signed_in', firebaseUser: { email: MARITES }, profile: { role: 'teacher' }, user: null }
    searchState.current = 'type=institution'
    try {
      const html = renderToStaticMarkup(<Register />)
      expect(html).toContain(`signed in as <strong>${MARITES}</strong>`)
      expect(html).toContain('Sign out to create a')
      expect(html).toMatch(/<button[^>]*>Sign out<\/button>/)
    } finally {
      authState.current = { status: 'signed_out', firebaseUser: null, profile: null, user: null }
      searchState.current = ''
    }
  })

  it('says nothing of the sort when nobody is signed in', () => {
    searchState.current = 'type=institution'
    try {
      expect(renderToStaticMarkup(<Register />)).not.toContain('Sign out to create a')
    } finally {
      searchState.current = ''
    }
  })
})

/* T-51 (maykel_64440-65): step 2 asks for a middle name (optional, like every
   student form does) and lists genders, not pronouns. Rendered through the
   institution preset because that is the one static route to step 2; the
   fields are the same on both paths. */
describe('/register step 2 — about you', () => {
  const step2 = () => {
    searchState.current = 'type=institution'
    try { return renderToStaticMarkup(<Register />) } finally { searchState.current = '' }
  }

  it('asks for an optional middle name between first and last', () => {
    const html = step2()
    expect(html).toContain('Middle name')
    expect(html).toMatch(/Middle name<span[^>]*> \(optional\)/)
    expect(html.indexOf('reg-first')).toBeLessThan(html.indexOf('reg-middle'))
    expect(html.indexOf('reg-middle')).toBeLessThan(html.indexOf('reg-last'))
  })

  it('offers Female / Male / Custom, not pronouns', () => {
    const html = step2()
    for (const label of ['Female', 'Male', 'Custom']) expect(html).toContain(`>${label}</option>`)
    for (const label of ['He', 'She', 'Others']) expect(html).not.toContain(`>${label}</option>`)
  })

  /* The Custom text box is revealed on choosing Custom, which a static render
     cannot do; what it can pin is that the box is not shown before then. */
  it('keeps the custom gender box hidden until Custom is chosen', () => {
    expect(step2()).not.toContain('reg-gender-custom')
  })
})
