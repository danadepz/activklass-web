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
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

import { PHONE_IN_USE_ERROR, phoneError } from '@/lib/validation'
import Register, { WrongPathNudge, positionsFor, signedInAsSomeoneElse } from './register.jsx'

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

/* T-52 (maykel_64440-66): "Admin" was offered as a Position on the individual
   path, where a self-registered account can only ever be a teacher. The list
   is now per path; the institution path keeps all four because the Faculty
   nudge above is decided against them. */
describe('the Position list, per path', () => {
  const labels = (kind) => positionsFor(kind).map((p) => p.label)

  it('offers Faculty, Program chair / head and Dean on the individual path — no Admin', () => {
    expect(labels('individual')).toEqual(['Faculty', 'Program chair / head', 'Dean'])
  })

  it('keeps all four on the institution path', () => {
    expect(labels('institution')).toEqual(['Faculty', 'Program chair / head', 'Dean', 'Admin'])
  })

  /* The chooser is the first state, before a kind exists; whatever renders
     there must not offer Admin either. */
  it('treats no path yet like the individual one', () => {
    expect(labels(null)).not.toContain('Admin')
  })

  it('leaves the stored values alone', () => {
    expect(positionsFor('institution').map((p) => p.value)).toEqual(['faculty', 'program_chair', 'dean', 'admin'])
  })
})

/* T-88 (andecobs-117): Derick filed this with "Issue: Nothing" — nothing was
   broken, it was an ask. "I suggest to have a validation to check if the
   number is already taken." Two accounts could register the same phone number
   and nothing, on either form or in the review queue, ever said so:
   `phoneError` judged the shape of the number and nothing anywhere, client or
   server, compared one against another. Live data still carries the proof —
   `09434969549`, the number in his screenshot, sits on six accounts.

   What is pinned here is the whole of what the fix promises, in the order it
   promises it: the wording the person reads; that the yes/no comes from OUR
   backend and not from a Firestore query in the browser (the rules would
   allow that one, and it would hand any signed-in account a phone-number
   enumeration oracle over every teacher on the platform); and that it is
   asked BEFORE the Firebase account exists, so a predictable rejection cannot
   strand anyone half-registered — the same position, for the same reason, as
   the school-abbreviation clash beside it.

   The decision itself lives in an async submit handler six steps in, which no
   static render can drive and this repo has no DOM library to drive it with,
   so the wiring is read off the source the way forgot-password.test.jsx's
   T-79 block reads its own. Delete the call, move it after account creation,
   swap it for a client-side `where('phone', ...)`, or reword the message, and
   one of these fails. */
const registerSource = readFileSync(fileURLToPath(new URL('./register.jsx', import.meta.url)), 'utf8')

describe('T-88 — a phone number another account already uses', () => {
  it('tells the person it is on another account, in words with no vendor or raw error in them', () => {
    expect(PHONE_IN_USE_ERROR).toMatch(/already on another account/i)
    expect(PHONE_IN_USE_ERROR).toMatch(/Double-check what you typed, or use a different number/)
    expect(PHONE_IN_USE_ERROR).not.toMatch(/firebase|firestore|flask|admin sdk|error|exception/i)
    // Says nothing about WHOSE account it is — the endpoint answers yes/no only.
    expect(PHONE_IN_USE_ERROR).not.toMatch(/account of|belongs to|owned by/i)
  })

  it('asks our own backend for the yes/no, signed out', () => {
    expect(registerSource).toMatch(/api\('\/api\/auth\/register\/phone-in-use', \{\s*method: 'POST'/)
    expect(registerSource).toMatch(/body: \{ phone: form\.phone\.trim\(\) \}/)
    expect(registerSource).toMatch(/requireAuth: false/)
  })

  it('stops the submit on a yes, with that message and nothing else', () => {
    expect(registerSource).toMatch(/if \(in_use\) \{ setError\(PHONE_IN_USE_ERROR\); return \}/)
  })

  /* The neighbour that matters: a number nobody uses must still sail through.
     Only a `yes` from the server blocks — the message is set in exactly one
     place, behind that one guard, so a `no` (and an unreachable server) leaves
     the walk exactly as it was. */
  it('lets a number nobody uses through — only a yes blocks', () => {
    expect(registerSource.match(/setError\(PHONE_IN_USE_ERROR\)/g)).toHaveLength(1)
    expect(registerSource).not.toMatch(/if \(!in_use\)/)
    // and the shape rule, which every number still passes through first, has
    // no opinion about who else holds it
    expect(phoneError('09338887766')).toBe('')
    expect(phoneError('09434969549')).toBe('')
  })

  it('asks before the Firebase account is created, not after', () => {
    const asked = registerSource.indexOf("'/api/auth/register/phone-in-use'")
    const created = registerSource.indexOf('await createUserWithEmailAndPassword(')
    expect(asked).toBeGreaterThan(-1)
    expect(created).toBeGreaterThan(-1)
    expect(asked).toBeLessThan(created)
  })

  it('never looks the number up from the browser', () => {
    expect(registerSource).not.toMatch(/where\(\s*'phone'/)
    expect(registerSource).not.toMatch(/getDocs|query\(/)
  })
})
