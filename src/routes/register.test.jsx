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
   promises it: the wording the person reads; and that the yes/no comes from
   OUR backend and not from a Firestore query in the browser (the rules would
   allow that one, and it would hand any signed-in account a phone-number
   enumeration oracle over every teacher on the platform).

   The decision itself lives in an async submit handler six steps in, which no
   static render can drive and this repo has no DOM library to drive it with,
   so the wiring is read off the source the way forgot-password.test.jsx's
   T-79 block reads its own. Delete the call, swap it for a client-side
   `where('phone', ...)`, or reword the message, and one of these fails.

   Where the call sits moved under T-94, below: it no longer runs before the
   Firebase account exists (that used to strand a genuinely new registration
   on a taken number less often, at the cost of refusing a RETURNING person
   their own number before the code that would have recognised them ever
   ran). */
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

  it('never looks the number up from the browser', () => {
    expect(registerSource).not.toMatch(/where\(\s*'phone'/)
    expect(registerSource).not.toMatch(/getDocs|query\(/)
  })
})

/* T-94 (andecobs-117, found by /verify while checking T-88): the phone check
   above used to run before `createUserWithEmailAndPassword` and therefore
   before the `getDoc(users/uid) -> navigate('/portal')` branch that
   recognises a FINISHED account resubmitting its own details. The check
   cannot tell whose number it matched — that yes/no shape is the whole point
   of T-88 — so a returning person hit the refusal meant for a stranger,
   instead of being sent to their portal the way they were before T-88.
   Reordering, not loosening, is the fix: settle whether this browser already
   holds the account (a different one still signed in, or this person's own,
   finished or half-made) before ever asking about the phone. Read off the
   source for the same reason the T-88 block above does. Move the phone check
   back above `signedInAsSomeoneElse` or above the `getDoc` branch and either
   of these goes red. */
describe('T-94 — the existing-account branch is settled before the phone check runs', () => {
  const phoneCheckAt = registerSource.indexOf("'/api/auth/register/phone-in-use'")
  const signedInGuardAt = registerSource.indexOf('signedInAsSomeoneElse(auth.currentUser?.email, form.email)')
  const existingProfileAt = registerSource.indexOf("getDoc(doc(db, 'users', auth.currentUser.uid))")

  it('checks for a different signed-in session before asking about the phone', () => {
    expect(signedInGuardAt).toBeGreaterThan(-1)
    expect(phoneCheckAt).toBeGreaterThan(-1)
    expect(signedInGuardAt).toBeLessThan(phoneCheckAt)
  })

  /* This is the exact branch a returning person needs: the one that finds
     their finished profile and sends them to /portal. It has to run, and
     return, before the phone check gets a chance to refuse them their own
     number. */
  it('checks for a finished profile to resume before asking about the phone', () => {
    expect(existingProfileAt).toBeGreaterThan(-1)
    expect(existingProfileAt).toBeLessThan(phoneCheckAt)
  })

  /* The reorder must not turn into a skip: a genuinely new registration —
     nothing in `users` yet — still reaches the check, and it still runs
     before anything that would be harder to walk back (the school directory
     write, the institution request, the profile write itself). */
  it('still runs the check for a genuinely new registration, before anything else gets written', () => {
    const schoolWriteAt = registerSource.indexOf('addSchoolToDirectory(')
    const profileWriteAt = registerSource.indexOf("setDoc(doc(db, 'users', uid)")
    expect(schoolWriteAt).toBeGreaterThan(-1)
    expect(profileWriteAt).toBeGreaterThan(-1)
    expect(phoneCheckAt).toBeLessThan(schoolWriteAt)
    expect(phoneCheckAt).toBeLessThan(profileWriteAt)
  })

  it('still refuses with the same wording — the endpoint answers yes/no only, so a stranger’s number is caught the same as before', () => {
    expect(registerSource).toMatch(/if \(in_use\) \{ setError\(PHONE_IN_USE_ERROR\); return \}/)
  })
})

/* T-82 (triplecookiemonster-107, owner reversed Option A to Option B on
   2026-09-26): an Institution sign-up now pays for its seats before a
   superadmin ever reviews the request, instead of after approval. Read off
   the source for the same reason the T-88/T-94 blocks above do — this is an
   async submit handler this repo has no DOM library to drive.

   What has to be true, in order: the pending school is created right after
   the request it belongs to, and before the profile write (the backend
   endpoint needs the request's own id, and setInstitutionSchoolId must be
   set before any later step could fail); nobody is signed out before the
   trip to PayMongo, unlike every institution sign-up before this ticket
   (the return trip needs this same session to confirm the payment); and a
   checkout that fails to START retries on its own next submit, rather than
   re-running account creation into the "existing profile" branch's
   navigate-to-portal. */
describe('T-82 — an Institution sign-up pays before a superadmin reviews it', () => {
  const requestWriteAt = registerSource.indexOf("addDoc(collection(db, 'subscription_requests')")
  const pendingSchoolAt = registerSource.indexOf('createPendingSchool(reqRef.id)')
  const profileWriteAt = registerSource.indexOf("setDoc(doc(db, 'users', uid)")
  const payAt = registerSource.indexOf('await payForInstitution(pendingSchoolId)')

  it('creates the pending school right after the request, before the profile is written', () => {
    expect(requestWriteAt).toBeGreaterThan(-1)
    expect(pendingSchoolAt).toBeGreaterThan(-1)
    expect(profileWriteAt).toBeGreaterThan(-1)
    expect(requestWriteAt).toBeLessThan(pendingSchoolAt)
    expect(pendingSchoolAt).toBeLessThan(profileWriteAt)
  })

  it('sends the browser to PayMongo as the last step, not "sent" directly', () => {
    expect(payAt).toBeGreaterThan(-1)
    expect(profileWriteAt).toBeLessThan(payAt)
    // The pre-T-82 ending — signed out, straight to the confirmation screen
    // with no payment involved — must be gone, not just reordered.
    expect(registerSource).not.toMatch(/await logout\(\)\s*\n\s*setStep\('sent'\)/)
  })

  it('starts checkout with flow: institution_signup, so the return trip goes to /register, not /teacher/account', () => {
    expect(registerSource).toMatch(/startCheckout\(schoolId, \{ flow: 'institution_signup' \}\)/)
  })

  it('a checkout that failed to start retries on its own, without re-running account creation', () => {
    const retryCheckAt = registerSource.indexOf('if (institutionSchoolId) {')
    const createAccountCallAt = registerSource.indexOf('await createAccount()')
    expect(retryCheckAt).toBeGreaterThan(-1)
    expect(createAccountCallAt).toBeGreaterThan(-1)
    expect(retryCheckAt).toBeLessThan(createAccountCallAt)
  })

  it('the seat-picker no longer promises "nothing to pay today" or a quote for later — it charges now', () => {
    expect(registerSource).not.toMatch(/Nothing to pay today/)
    expect(registerSource).not.toMatch(/Your final quote follows/)
    expect(registerSource).toMatch(/Due today/)
    expect(registerSource).toMatch(/Refunded in full if we decline your request/)
  })

  it('the "request sent" screen no longer depends on form state the PayMongo round trip does not preserve', () => {
    // A full-page redirect to PayMongo and back remounts the page, so `form`
    // is back to its empty defaults — a screen built from it would read
    // "Thanks, ." Confirmed generically instead.
    const sentScreenAt = registerSource.indexOf('Thanks — your payment for the school year is on file')
    expect(sentScreenAt).toBeGreaterThan(-1)
    expect(registerSource).not.toMatch(/Thanks, \{form\.firstName\.trim\(\)\}/)
  })
})

describe('T-82 — the trip back from PayMongo', () => {
  const checkoutReturn = (qs) => {
    searchState.current = qs
    try { return renderToStaticMarkup(<Register />) } finally { searchState.current = '' }
  }

  it('shows a confirming screen when the return carries a reference and the school it belongs to', () => {
    const html = checkoutReturn('checkout_ref=ref1&checkout_school=school1')
    expect(html).toMatch(/Confirming your payment/)
    expect(html).not.toMatch(/Payment not completed/)
  })

  it('shows a cancelled screen with a way to pay again when the return says cancelled', () => {
    const html = checkoutReturn('checkout_cancelled=1&checkout_school=school1')
    expect(html).toMatch(/Payment not completed/)
    expect(html).toMatch(/Payment was cancelled — nothing was charged/)
    expect(html).toMatch(/Pay now/)
  })

  it('shows neither screen on an ordinary visit with no checkout params', () => {
    const html = checkoutReturn('')
    expect(html).not.toMatch(/Confirming your payment/)
    expect(html).not.toMatch(/Payment not completed/)
  })
})
