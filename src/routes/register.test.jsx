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
 * The Faculty nudge that used to live on the school step (`WrongPathNudge`)
 * was retired by T-109: locking Position to Admin on the institution path
 * means the signal it watched for can never fire again, and the owner chose
 * retirement over relocating it to step 1. See the T-109 block below.
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
  deleteUser: vi.fn(),
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
import Register, { Progress, positionsFor, signedInAsSomeoneElse } from './register.jsx'

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
   student form does). Rendered through the institution preset because that
   is the one static route to step 2; the fields are the same on both paths.
   T-109 (triplecookiemonster-141 item 2) removed Gender from this step
   entirely — nothing in the product ever read the stored value. */
describe('/register step 2 — about you', () => {
  const step2 = () => {
    searchState.current = 'type=institution'
    try { return renderToStaticMarkup(<Register />) } finally { searchState.current = '' }
  }

  it('asks for an optional middle name between first and last', () => {
    // T-129 (maykel_64440-158): Title Case landed on this label among others
    // -- "Middle Name", not "Middle name".
    const html = step2()
    expect(html).toContain('Middle Name')
    expect(html).toMatch(/Middle Name<span[^>]*> \(optional\)/)
    expect(html.indexOf('reg-first')).toBeLessThan(html.indexOf('reg-middle'))
    expect(html.indexOf('reg-middle')).toBeLessThan(html.indexOf('reg-last'))
  })

  it('no longer asks for Gender at all', () => {
    const html = step2()
    expect(html).not.toContain('reg-gender')
    expect(html).not.toContain('reg-gender-custom')
    for (const label of ['Female', 'Male', 'Custom']) expect(html).not.toContain(`>${label}</option>`)
  })
})

/* T-52 (maykel_64440-66): "Admin" was offered as a Position on the individual
   path, where a self-registered account can only ever be a teacher. The list
   is per path; the institution path's four values are unchanged even though
   T-109 locks the rendered field there to 'admin' — positionsFor still backs
   the individual path's open select. */
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

/* T-109 (triplecookiemonster-141 items 2 & 3; triplecookiemonster-142 items
   6-8, Kristine, 2026-10-01/02). Gender is removed from sign-up outright —
   nothing in the product ever read the stored value (the comment this card
   found at the old GENDERS declaration said so plainly). Position locks to
   Admin on the institution path: whoever sets a school up is its admin, so
   there is nothing to ask, and the WrongPathNudge signal above is retired
   rather than relocated (owner's call, 2026-10-03) — locking the field is
   itself the signal now; a teacher who picks Institution by mistake sees
   only "Admin" offered and nothing else.

   The Position lock is pinned on its SUBMITTED value, not just that the
   rendered select carries `disabled`: Position is at step 3, and reaching
   step 3 needs two Next clicks this file's static renders cannot simulate
   (the institution preset only reaches step 2, the same limit `WrongPathNudge`
   existed to work around before it was extracted). Read off the source
   instead, the way the T-88/T-94/T-82 blocks below do for the same reason —
   and prove the value, not the attribute: the institution branch has no
   `onChange` at all (nothing could ever change it away from 'admin'), only
   one `<option>` exists to select, and BOTH places that decide `kind` ever
   becomes 'institution' — the initial render from `?type=institution` and
   clicking the Institution card — seed `position` to 'admin' in the same
   motion. Together these leave no path to a submission with a position other
   than 'admin' once the institution card is chosen. */
describe('T-109 — Gender is gone; Position locks to Admin on the institution path', () => {
  it('writes no gender or gender_custom to the profile, and the field is gone from the markup', () => {
    const detailsAt = registerSource.indexOf('function details()')
    const detailsEnd = registerSource.indexOf('\n  }\n', detailsAt)
    const details = registerSource.slice(detailsAt, detailsEnd)
    // The comment above the removed GENDERS list explicitly says existing
    // profiles keep their stored gender/gender_custom untouched -- so the
    // absence is checked in the WRITE (details()) and the MARKUP, not the
    // whole file, which still (rightly) mentions both keys in that comment.
    expect(details).not.toMatch(/\bgender\b\s*:/)
    expect(details).not.toMatch(/gender_custom/)
    expect(registerSource).not.toMatch(/reg-gender/)
    expect(registerSource).not.toMatch(/\bGENDERS\s*=/)
  })

  it('seeds Position to admin the moment the institution path is entered by URL', () => {
    expect(registerSource).toMatch(/position: preset === 'institution' \? 'admin' : ''/)
  })

  it('seeds Position to admin the moment Institution is chosen from the chooser', () => {
    expect(registerSource).toMatch(/position: next === 'institution'\s*\n\s*\?\s*'admin'/)
  })

  /* Superseded 2026-10-08 by T-129 (maykel_64440-158, andecobs-164): the
     owner's decision moved from locking the institution Position field
     (disabled, Admin the only option) to dropping it from the screen
     outright -- the next two tests below this one now pin that removal
     instead of the lock. Kept pinned here: `position` is still seeded to
     'admin' the moment the institution path is entered (by URL or by
     picking the card), which is what actually keeps a bad value out of
     the write -- see the two tests directly above this block. */
  it('the individual path still offers an open Position select, backed by positionsFor(kind)', () => {
    const fieldAt = registerSource.indexOf('<Field id="reg-position"')
    const fieldEnd = registerSource.indexOf('</Field>', fieldAt)
    const field = registerSource.slice(fieldAt, fieldEnd)
    expect(field).toMatch(/value={form\.position} onChange={set\('position'\)}/)
    expect(field).toMatch(/positionsFor\(kind\)/)
  })

  it('T-129: the institution path no longer renders a Position field at all -- not locked, gone', () => {
    // Exactly one <Field id="reg-position"> in the whole file (the
    // individual-path one tested above), and it is guarded so it never
    // renders for kind === 'institution'.
    expect(registerSource.match(/<Field id="reg-position"/g)).toHaveLength(1)
    const fieldAt = registerSource.indexOf('<Field id="reg-position"')
    const calendarFieldEnd = registerSource.indexOf('</Field>', registerSource.indexOf('<Field id="reg-calendar"'))
    const between = registerSource.slice(calendarFieldEnd, fieldAt)
    expect(between).toMatch(/\{kind !== 'institution' && \(/)
    // the disabled, locked-to-Admin select and its helper text are gone
    expect(registerSource).not.toMatch(/<select id="reg-position"[^>]*\bdisabled\b/)
    expect(registerSource).not.toMatch(/Whoever sets up a school.s subscription is its admin\./)
  })

  it('the three wording fixes land exactly where Kristine found them', () => {
    // T-129 (andecobs-165, decided 2026-10-08) replaced "My school isn't
    // listed" with "Others" -- the string this test pinned three days ago.
    expect(registerSource).toContain('<option value={NEW_SCHOOL}>Others</option>')
    expect(registerSource).not.toContain('My school isn’t listed')
    // T-129 Title Case also moved this label from "School type" to
    // "School Type".
    expect(registerSource).toContain('label="School Type"')
    expect(registerSource).not.toContain('label="Private or public"')
    expect(registerSource).toContain('Set up your teacher account and start managing your classes.')
  })

  it('leaves the institution subtitle alone -- only the individual one was reported', () => {
    expect(registerSource).toContain('Create your account, tell us about your school, and we set it up with you.')
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
    expect(registerSource).toMatch(/if \(in_use\) \{[\s\S]*?setError\(PHONE_IN_USE_ERROR\)\s*\n\s*return\s*\n\s*\}/)
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
    expect(registerSource).toMatch(/if \(in_use\) \{[\s\S]*?setError\(PHONE_IN_USE_ERROR\)\s*\n\s*return\s*\n\s*\}/)
  })
})

/* T-82 (triplecookiemonster-107). Option B (2026-09-26, pay at sign-up) shipped
   and then failed /verify the same day — every real Institution sign-up 403'd,
   because this page called the new pending-school endpoint before its own
   profile document existed. The owner reversed to Option C the same day:
   confirm identity first (a superadmin approves, exactly as before), ask for
   money second (the approved-but-unpaid admin pays from their Account page —
   web's Option C half is `schoolStatus.js`, `ProtectedRoute.jsx` and
   `teacher/account.jsx`, not this file).

   This file's whole share of Option C is deletion: go back to writing only
   `subscription_requests` then the profile, the shape this page had before
   T-82 ever touched it. These checks pin that the Option B machinery — the
   pending-school call, the PayMongo redirect, the checkout-return screens,
   the "pay before we review" copy — is actually gone, not just unreachable,
   so nobody re-adds it while "finishing" Option C. */
describe('T-82 — Option C: the pending-school checkout is gone, sign-up is request-then-profile again', () => {
  const requestWriteAt = registerSource.indexOf("addDoc(collection(db, 'subscription_requests')")
  const profileWriteAt = registerSource.indexOf("setDoc(doc(db, 'users', uid)")

  it('writes the request, then the profile, then nothing else — the pre-T-82 ending', () => {
    expect(requestWriteAt).toBeGreaterThan(-1)
    expect(profileWriteAt).toBeGreaterThan(-1)
    expect(requestWriteAt).toBeLessThan(profileWriteAt)
    expect(registerSource).toMatch(/await logout\(\)\s*\n\s*setStep\('sent'\)/)
  })

  it('never calls the pending-school or checkout endpoints Option B added', () => {
    expect(registerSource).not.toMatch(/createPendingSchool/)
    expect(registerSource).not.toMatch(/startCheckout/)
    expect(registerSource).not.toMatch(/confirmCheckout/)
    expect(registerSource).not.toMatch(/institution_signup/)
    expect(registerSource).not.toMatch(/payForInstitution/)
    expect(registerSource).not.toMatch(/institutionSchoolId/)
    expect(registerSource).not.toMatch(/checkoutState/)
  })

  it('the seat-picker is back to "nothing to pay today" and a quote that comes later, not a charge', () => {
    expect(registerSource).toMatch(/Your final quote follows from these numbers/)
    expect(registerSource).not.toMatch(/Due today/)
    expect(registerSource).not.toMatch(/Refunded in full if we decline your request/)
  })

  it('the "request sent" screen is the original, form-derived confirmation — no payment wording', () => {
    expect(registerSource).toMatch(/Nothing to pay today — your quote comes with the setup/)
    expect(registerSource).not.toMatch(/your payment for the school year is on file/)
  })

  it('renders no checkout-return screens for checkout_ref / checkout_cancelled params', () => {
    searchState.current = 'checkout_ref=ref1&checkout_school=school1'
    try {
      const html = renderToStaticMarkup(<Register />)
      expect(html).not.toMatch(/Confirming your payment/)
      expect(html).not.toMatch(/Payment not completed/)
    } finally {
      searchState.current = ''
    }
  })
})

/* T-118 (triplecookiemonster-146, Kristine 2026-10-02): a phone number
   already on another account refused the registration AFTER
   createUserWithEmailAndPassword had already made the Firebase account
   (step 1), so the refusal left her genuinely signed in with no profile and
   no clean way to retry — exactly the "half-registered completing" state
   `:305-306`'s comment says the school-abbreviation check exists to avoid,
   except nothing was undoing it for THIS check. Her suggested fix (drop the
   "Signed in as…" notice and the Sign out link) would have removed the only
   explanation of the state and the only way out of it — the real fix is to
   undo the account this submit itself just created, never one a RETURNING
   person is resuming.

   `created` (set at `:328`, inside the `if (!auth.currentUser)` branch two
   sections above) is already the exact flag that tells the two apart — it
   is false whenever this is a returning person signing back into their own
   half-made or finished account, so gating the delete on it is reusing the
   distinction the file already draws, not inventing a new one.

   Read off the source for the same reason the T-88/T-94 blocks above are:
   this decision lives inside the async `createAccount` closure, six steps
   into a form with no DOM test runner in this repo (vitest runs these files
   under Node, not jsdom — `renderToStaticMarkup` cannot fire a submit
   event). A looser source test (just checking `deleteUser` appears
   somewhere) would not bite: it has to prove the call is gated on `created`
   and runs nowhere a returning person's own session could reach it. */
describe('T-118 — a phone-check refusal undoes the account this submit just created', () => {
  const phoneFailAt = registerSource.indexOf('if (in_use) {')
  const createdGuardAt = registerSource.indexOf('if (created) await deleteUser(auth.currentUser)')
  const deleteAt = registerSource.indexOf('deleteUser(auth.currentUser)')
  const setErrorAt = registerSource.indexOf('setError(PHONE_IN_USE_ERROR)')

  it('deletes the account THIS submit just created before telling the person their number is taken', () => {
    expect(createdGuardAt).toBeGreaterThan(-1)
    expect(createdGuardAt).toBeGreaterThan(phoneFailAt)
    expect(deleteAt).toBeGreaterThan(-1)
    expect(deleteAt).toBeLessThan(setErrorAt)
  })

  /* The guard that keeps a returning person untouched: `deleteUser` appears
     exactly once in the whole file, and only inside the `created` branch of
     the phone-refusal path above — never in the existing-profile branch
     (`:351-358`) that resumes a finished account, and never unconditionally. */
  it('never deletes a returning person finishing their own half-made or finished registration', () => {
    expect(registerSource.match(/deleteUser\(/g)).toHaveLength(1)
    expect(registerSource).not.toMatch(/^\s*await deleteUser\(auth\.currentUser\)/m)
  })

  it('imports deleteUser from firebase/auth, the same module the rest of this file’s auth calls use', () => {
    expect(registerSource).toMatch(/import \{[^}]*deleteUser[^}]*\} from 'firebase\/auth'/)
  })
})

/* T-118's second defect, not reported by the tester: her screenshot read
   "Step 6 of 3". The completing walk slices `steps` down to 3 entries once
   the AuthContext notices the just-created account has no profile and flips
   `completing` true (`:870`), but the local `step` counter was still sitting
   wherever the full (un-sliced) flow had it — up to 6 for the individual
   path — because that state change lands mid-submit, after the account was
   created, independently of this component's own step tracking. `Progress`
   is exported so the clamp is testable directly: no static render reaches
   the auth-state race that produces the mismatch. */
describe('T-118 — the step counter never exceeds its own total', () => {
  const html = (props) => renderToStaticMarkup(<Progress {...props} />)
  const steps = ['Account type', 'About you', 'Your school']

  it('reads "Step 3 of 3", not "Step 6 of 3", when current has outrun a shorter steps array', () => {
    const out = html({ steps, current: 6 })
    expect(out).toContain('Step 3 of 3')
    expect(out).not.toContain('Step 6 of 3')
    // the label line must resolve too -- steps[current - 1] on the
    // unclamped index would be undefined and render nothing
    expect(out).toContain('Your school')
  })

  it('still reads the true step when current is within range -- the clamp must not always force the last step', () => {
    expect(html({ steps, current: 2 })).toContain('Step 2 of 3')
  })
})

/* T-114 (triplecookiemonster-142, Kristine 2026-10-01; unblocked 2026-10-03
   once the owner answered the two questions the card was waiting on — the
   QR points at the GitHub release PAGE, not the raw .apk, and at
   `/releases/latest` rather than a pinned tag; and this stays demo-only, not
   built for real guardians, since a GitHub APK sits behind an
   unknown-sources warning a real parent should never see).

   The old login.jsx disclaimer carried two lines: a teacher invite, and a
   second line routing a parent to the mobile app because there was nowhere
   on the web for them to go. That second line is gone from login.jsx (see
   login.test.jsx) because /register now HAS somewhere for a parent to go —
   a third chooser card that leads straight to an install QR, never into the
   stepped sign-up form a teacher walks. "Never creates a web account" is
   structural, not a validation rule: the Parent card's onClick is a
   different function from chooseKind (which is what feeds the stepped
   form), and ParentAppQr renders no <form>, no Firebase import, nothing an
   account could be made from.

   Read off the source for the same reason every other deep-state block in
   this file is: reaching step 'qr' needs a click this file's static renders
   cannot simulate (no DOM here -- vitest runs under Node, not jsdom). What
   IS reachable by a static render -- the card itself, at step 1 -- is
   checked by render instead of by source, same as the Institution and
   Individual cards above it. */
describe('T-114 — a Parent card leads straight to the mobile-app install QR, never a web account', () => {
  it('the Parent card is offered at step 1, saying the account is made in the app', () => {
    const html = step1()
    expect(html).toContain('Parent')
    expect(html).toMatch(/Get the ActivKlass mobile app/)
    expect(html).toMatch(/your child.s Profile/)
  })

  it('clicking Parent jumps straight to the QR step -- no Continue click needed, no chooseKind call', () => {
    expect(registerSource).toMatch(/onClick=\{\(\) => \{ setKind\('parent'\); setStep\('qr'\) \}\}/)
    // chooseKind is what feeds the stepped teacher form (:next, position
    // seeding, "Continue" to step 2) -- the Parent card must never call it.
    const parentCardAt = registerSource.indexOf("heading=\"Parent\"")
    const cardStart = registerSource.lastIndexOf('<ChoiceCard', parentCardAt)
    const cardEnd = registerSource.indexOf('/>', parentCardAt)
    const parentCard = registerSource.slice(cardStart, cardEnd)
    expect(parentCard).not.toMatch(/chooseKind/)
  })

  it('step "qr" renders the install screen before the stepped form is ever reached', () => {
    const gettingAppAt = registerSource.indexOf('gettingApp ? (')
    const formAt = registerSource.indexOf('<form onSubmit={handleSubmit}')
    expect(gettingAppAt).toBeGreaterThan(-1)
    expect(formAt).toBeGreaterThan(-1)
    expect(gettingAppAt).toBeLessThan(formAt)
    expect(registerSource).toMatch(/const gettingApp = step === 'qr'/)
  })

  it('the install screen writes nothing -- no form, no Firebase call, no input', () => {
    const at = registerSource.indexOf('function ParentAppQr(')
    const end = registerSource.indexOf('\n}\n', at)
    const body = registerSource.slice(at, end)
    expect(body).not.toMatch(/<form/)
    expect(body).not.toMatch(/<input/)
    expect(body).not.toMatch(/createUserWithEmailAndPassword|setDoc|addDoc/)
  })

  it('points at the release PAGE on /releases/latest, per the owner’s decision -- not the raw .apk, not a pinned tag', () => {
    expect(registerSource).toMatch(
      /MOBILE_APP_RELEASE_URL = 'https:\/\/github\.com\/danadepz\/activklass-mobile\/releases\/latest'/,
    )
    expect(registerSource).not.toMatch(/releases\/download/)
    expect(registerSource).not.toMatch(/releases\/tag\/v1\.0\.0-demo/)
  })

  it('prints the URL as readable text, not only as the QR -- a tester mirroring the screen cannot scan it', () => {
    const at = registerSource.indexOf('function ParentAppQr(')
    const end = registerSource.indexOf('\n}\n', at)
    const body = registerSource.slice(at, end)
    expect(body).toMatch(/\{MOBILE_APP_RELEASE_URL\}/)
  })
})

/* T-127 (maykel_64440-162, ticket pane card 2026-10-04): registration that
   failed anywhere after step 1 showed one sentence -- "Your account was
   created, but we could not finish setting it up. Try again with the same
   email address and password." -- for every possible cause, with nothing on
   screen maykel could quote back. console.error already logged the real
   err.code/err pair for a developer (d9bb830), so the gap this card closes
   is narrower than "nothing was logged anywhere": a TESTER had nothing
   readable. `reference` (err.code, or 'unknown' when the thrown value
   carries none -- a plain Error, say) is appended to both generic branches
   so the next report names something instead of nothing, without ever
   putting the exception's own message or stack on screen.

   Read off the source for the same reason every other async-catch block in
   this file is: no DOM test runner here (vitest runs under Node, not
   jsdom), so a thrown error six steps into the form cannot be driven by a
   render. */
describe('T-127 — the catch-all gives a tester something to quote, and keeps logging the rest', () => {
  const tryAt = registerSource.indexOf('await createAccount()')
  const catchAt = registerSource.indexOf('} catch (err) {', tryAt)
  const consoleAt = registerSource.indexOf(
    "console.error('[register] could not finish the account:', err.code ?? '', err)",
    catchAt,
  )
  const referenceAt = registerSource.indexOf("const reference = err.code || 'unknown'", catchAt)
  const setErrorAt = registerSource.indexOf('setError(', referenceAt)
  const finallyAt = registerSource.indexOf('finally', catchAt)

  it('logs the real err.code/err pair before ever building the on-screen message', () => {
    expect(catchAt).toBeGreaterThan(tryAt)
    expect(consoleAt).toBeGreaterThan(catchAt)
    expect(referenceAt).toBeGreaterThan(consoleAt)
    expect(setErrorAt).toBeGreaterThan(referenceAt)
  })

  it('falls back to a plain "unknown" reference when the thrown value carries no .code', () => {
    expect(registerSource).toMatch(/const reference = err\.code \|\| 'unknown'/)
  })

  it('appends that reference to BOTH generic branches, not just one', () => {
    const block = registerSource.slice(referenceAt, finallyAt)
    expect(block).toMatch(
      /Your account was created, but we could not finish setting it up\. Try again with the same email address and password\. \(Reference: \$\{reference\}\)/,
    )
    expect(block).toMatch(
      /We could not create your account\. Check your connection and try again\. \(Reference: \$\{reference\}\)/,
    )
  })

  it('never puts the exception’s own message or stack into that string', () => {
    const block = registerSource.slice(catchAt, finallyAt)
    expect(block).not.toMatch(/err\.message/)
    expect(block).not.toMatch(/err\.stack/)
    expect(block).not.toMatch(/\$\{err\}/)
  })

  it('still lets FRIENDLY_ERRORS short-circuit the generic branches for a mapped code', () => {
    // email-already-in-use, weak-password and invalid-email keep their own
    // specific, already-actionable sentences -- untouched by this card.
    const block = registerSource.slice(catchAt, finallyAt)
    expect(block).toMatch(/FRIENDLY_ERRORS\[err\.code\] \?\?/)
  })
})

/* T-129 (maykel_64440-158 items 1-3, andecobs-163, -164, -165, -166, -168,
   -169, -170, -172, -174; decided 2026-10-08). Ten tester tickets on one
   screen, one file: Title Case on eight labels, three helper paragraphs cut,
   three sample values made generic, Confirm Password gets the eye toggle
   Password already had, the three seat sliders become number inputs with
   the same floor and cap, and the step-to-step height jump (AuthLayout.jsx,
   not this file, verified in the browser) gets a steady minimum instead of
   chasing each step's own content. Position's removal is its own block
   above, next to the T-109 tests it supersedes.

   Steps 3-5 are unreachable by a static render the same way the T-109/T-88
   blocks above found them to be (no DOM test runner, and these steps need
   Next clicks this file cannot simulate) -- those labels are read off the
   source. Step 2 is reachable through the institution preset, so that half
   is driven through an actual render. */
describe('T-129 — Title Case on the field labels', () => {
  const render = () => {
    searchState.current = 'type=institution'
    try { return renderToStaticMarkup(<Register />) } finally { searchState.current = '' }
  }

  it('step 2, reachable by a static render: First Name, Last Name, Phone Number', () => {
    const html = render()
    expect(html).toContain('First Name')
    expect(html).toContain('Last Name')
    expect(html).toContain('Phone Number')
    expect(html).not.toContain('First name')
    expect(html).not.toContain('Last name')
    expect(html).not.toContain('Phone number')
  })

  it('steps 3 and 4, read off the source: School Type, Academic Calendar, Confirm Password', () => {
    expect(registerSource).toContain('label="School Type"')
    expect(registerSource).toContain('label="Academic Calendar"')
    expect(registerSource).toContain('label="Confirm Password"')
    expect(registerSource).not.toContain('label="School type"')
    expect(registerSource).not.toContain('label="Academic calendar"')
    expect(registerSource).not.toContain('label="Confirm password"')
  })

  it('the institution seat field: Students Per Teacher, not "Students per teacher"', () => {
    expect(registerSource).toContain('label="Students Per Teacher"')
    expect(registerSource).not.toContain('label="Students per teacher"')
  })
})

describe('T-129 — three helper paragraphs removed; field-level rule hints kept', () => {
  it('drops "A student? Your account is set up..." from the bottom of the form', () => {
    expect(registerSource).not.toMatch(/A student\? Your account is set up by your school or teacher/)
  })

  it('drops the "write the full official name" paragraph under a new school’s name and abbreviation', () => {
    expect(registerSource).not.toMatch(/Write the full official name without abbreviations/)
  })

  it('keeps the password-rule hint -- the ask was about explanatory prose, not validation help', () => {
    expect(registerSource).toContain('At least 6 characters.')
  })
})

describe('T-129 — generic sample values', () => {
  it('the sign-up email sample reads exactly "Email Address", not a fake address', () => {
    expect(registerSource).toContain('placeholder="Email Address"')
    expect(registerSource).not.toContain('you@school.edu.ph')
  })

  it('the new-school name sample reads "Name of your School", not a real school', () => {
    expect(registerSource).toContain('placeholder="Name of your School"')
    expect(registerSource).not.toContain('University of Cebu')
  })
})

describe('T-129 — Confirm Password gets the eye toggle Password already had', () => {
  it('wraps the confirm input in its own relative container with an EyeToggle sharing showPassword', () => {
    const fieldAt = registerSource.indexOf('<Field id="reg-confirm"')
    const fieldEnd = registerSource.indexOf('</Field>', fieldAt)
    const field = registerSource.slice(fieldAt, fieldEnd)
    expect(field).toMatch(/style=\{\{ position: 'relative' \}\}/)
    expect(field).toMatch(/<EyeToggle shown={showPassword} onToggle={\(\) => setShowPassword\(\(s\) => !s\)} \/>/)
  })
})

describe('T-129 (andecobs-170) — the seat sliders become number inputs, same floor and cap', () => {
  it('replaces every SeatSlider call site with SeatNumberInput, and the slider component is gone', () => {
    expect(registerSource).not.toMatch(/<SeatSlider\b/)
    expect(registerSource).not.toMatch(/function SeatSlider\(/)
    expect(registerSource.match(/<SeatNumberInput\b/g)).toHaveLength(3)
  })

  it('SeatNumberInput is a real number input carrying the min/max/step the slider took', () => {
    const at = registerSource.indexOf('function SeatNumberInput(')
    const end = registerSource.indexOf('\n}\n', at)
    const body = registerSource.slice(at, end)
    expect(body).toMatch(/type="number"/)
    expect(body).toMatch(/min=\{min\}/)
    expect(body).toMatch(/max=\{max\}/)
    expect(body).toMatch(/step=\{step\}/)
  })

  it('types freely (onChange is a plain pass-through) and clamps to the floor/cap only on blur', () => {
    // Clamping on every keystroke would stop "3" from ever becoming "300" --
    // it would snap back to the floor the instant it dipped below it. The
    // slider enforced its floor/cap physically; the number input enforces
    // the same floor/cap on blur instead, after the person is done typing.
    expect(registerSource).toMatch(/const setSeat = \(key\) => \(e\) => setForm\(\(f\) => \(\{ \.\.\.f, \[key\]: e\.target\.value \}\)\)/)
    expect(registerSource).toMatch(/onBlur=\{clampSeat\('teacherSeats', SEATS\.teachers\.min, SEATS\.teachers\.max\)\}/)
    expect(registerSource).toMatch(/onBlur=\{clampSeat\('studentsPerTeacher', SEATS\.perTeacher\.min, SEATS\.perTeacher\.max\)\}/)
    expect(registerSource).toMatch(/onBlur=\{clampSeat\('soloStudents', SEATS\.perTeacher\.min, SEATS\.perTeacher\.max\)\}/)
  })

  it('the clamp math itself holds the same floor and cap the sliders enforced, in both directions and for a non-numeric value', () => {
    // Pulled out of the source and run directly, rather than re-deriving
    // the formula by eye, so a change to the math -- not just its presence
    // -- turns this red.
    const at = registerSource.indexOf('const clampSeat = (key, min, max) => () => setForm((f) => {')
    expect(at).toBeGreaterThan(-1)
    const body = registerSource.slice(at, registerSource.indexOf('})', at))
    expect(body).toContain('Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min')
    const clamp = (value, min, max) => {
      const n = Number(value)
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
    }
    expect(clamp(3, 20, 500)).toBe(20) // below the teacher-seats floor
    expect(clamp(9999, 20, 500)).toBe(500) // above the teacher-seats cap
    expect(clamp('', 20, 500)).toBe(20) // not a number -- falls to the floor
    expect(clamp(250, 20, 500)).toBe(250) // already in range -- untouched
  })
})
