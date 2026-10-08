/**
 * Security-rule tests for `quiz_attempts`, run against the real rules engine.
 *
 * These do not run with `npm run test` — they need the Firestore emulator, so
 * they live behind `npm run test:rules`, which starts it for them. Everything
 * else in this directory is pure and needs nothing.
 *
 * Why they exist: the attempt-lifecycle work widened `allow update` so a
 * student can finish the sitting they started. Before that, students could
 * only ever create an attempt, so the blast radius of a mistake in this rule
 * was zero. It is not zero now — the same clause, written slightly too loosely,
 * would let a student rewrite a submitted score, move an attempt onto another
 * student, or push their own deadline forward. Reading the rule and agreeing
 * it looks right is not evidence; running it is.
 *
 * The rules file is read from activklass-backend, which is the deployed source
 * of truth. If it moves, this fails loudly rather than silently testing
 * nothing.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, documentId, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'

const RULES_PATH = fileURLToPath(
  new URL('../../../activklass-backend/firestore.rules', import.meta.url),
)

const STUDENT = 'student-1'
const OTHER_STUDENT = 'student-2'
const TEACHER = 'teacher-1'
const ADMIN = 'admin-1'
const OTHER_ADMIN = 'admin-2'

let testEnv

/** A signed-in context whose users/{uid} document carries the given role. */
function ctx(uid) {
  return testEnv.authenticatedContext(uid).firestore()
}

/**
 * Seed the role documents the rules read.
 *
 * `isStudent()` / `isTeacher()` resolve the caller's role by reading
 * users/{uid}, so without these every request is denied for the wrong reason
 * and the tests would pass while proving nothing.
 */
async function seedRoles() {
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore()
    // Since 2026-08-31 a teacher acts only on the students they handle:
    // TEACHER owns class-1 (the class every seeded attempt names) with both
    // students on it, and each student carries the server-written
    // teacher_ids the rules read. Without this, every "the teacher can"
    // test below would be denied for the wrong reason.
    await setDoc(doc(db, 'users', STUDENT), { role: 'student', first_name: 'A', last_name: 'B', teacher_ids: [TEACHER] })
    await setDoc(doc(db, 'users', OTHER_STUDENT), { role: 'student', first_name: 'C', last_name: 'D', teacher_ids: [TEACHER] })
    await setDoc(doc(db, 'users', TEACHER), { role: 'teacher', first_name: 'T', last_name: 'R' })
    await setDoc(doc(db, 'classes', 'class-1'), { teacher_id: TEACHER, student_ids: [STUDENT, OTHER_STUDENT] })
  })
}

/** An open attempt belonging to STUDENT, written past the rules. */
async function seedAttempt(id, overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    await setDoc(doc(admin.firestore(), 'quiz_attempts', id), {
      quiz_id: 'quiz-1',
      class_id: 'class-1',
      student_id: STUDENT,
      attempt_number: 1,
      status: 'in_progress',
      started_at: new Date('2026-04-10T09:00:00Z'),
      expires_at_ms: 1_775_811_600_000,
      reopen_count: 0,
      focus_events: [],
      ...overrides,
    })
  })
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'activklass-rules-test',
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await seedRoles()
})

describe('quiz_attempts · creating an attempt', () => {
  it('lets a student open an attempt under their own uid', async () => {
    await assertSucceeds(
      setDoc(doc(ctx(STUDENT), 'quiz_attempts', 'a1'), {
        quiz_id: 'quiz-1',
        student_id: STUDENT,
        status: 'in_progress',
      }),
    )
  })

  it('refuses an attempt opened under someone else', async () => {
    await assertFails(
      setDoc(doc(ctx(STUDENT), 'quiz_attempts', 'a1'), {
        quiz_id: 'quiz-1',
        student_id: OTHER_STUDENT,
        status: 'in_progress',
      }),
    )
  })
})

describe('quiz_attempts · finishing your own attempt', () => {
  beforeEach(() => seedAttempt('a1'))

  it('lets the student submit the sitting they started', async () => {
    // The whole reason the rule was widened.
    await assertSucceeds(
      updateDoc(doc(ctx(STUDENT), 'quiz_attempts', 'a1'), {
        answers: { q1: 'o2' },
        total_score: 8,
        score: 8,
        total_possible: 10,
        status: 'graded',
        submitted_at: new Date(),
      }),
    )
  })

  it('lets the student record a reopen and an away-event', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(STUDENT), 'quiz_attempts', 'a1'), {
        reopen_count: 1,
        focus_events: [{ at: 'x', question_index: 2, question_id: 'q3', away_ms: 4000 }],
      }),
    )
  })

  it('lets the student stamp the deadline right after starting', async () => {
    // startAttempt() writes expires_at_ms in a second call.
    await assertSucceeds(
      updateDoc(doc(ctx(STUDENT), 'quiz_attempts', 'a1'), { expires_at_ms: 1_775_811_600_000 }),
    )
  })
})

describe('quiz_attempts · what the student still must not do', () => {
  it('cannot touch an attempt that is already submitted', async () => {
    await seedAttempt('a1', { status: 'graded', total_score: 3 })
    await assertFails(
      updateDoc(doc(ctx(STUDENT), 'quiz_attempts', 'a1'), { total_score: 10 }),
    )
  })

  it('cannot touch an attempt a teacher discarded', async () => {
    await seedAttempt('a1', { status: 'discarded' })
    await assertFails(
      updateDoc(doc(ctx(STUDENT), 'quiz_attempts', 'a1'), { status: 'graded', total_score: 10 }),
    )
  })

  it('cannot move an attempt onto another student', async () => {
    await seedAttempt('a1')
    await assertFails(
      updateDoc(doc(ctx(STUDENT), 'quiz_attempts', 'a1'), { student_id: OTHER_STUDENT }),
    )
  })

  it('cannot move an attempt onto another quiz', async () => {
    await seedAttempt('a1')
    await assertFails(
      updateDoc(doc(ctx(STUDENT), 'quiz_attempts', 'a1'), { quiz_id: 'quiz-2' }),
    )
  })

  it('cannot push its own deadline forward by restamping the start', async () => {
    await seedAttempt('a1')
    await assertFails(
      updateDoc(doc(ctx(STUDENT), 'quiz_attempts', 'a1'), {
        started_at: new Date('2026-04-10T10:00:00Z'),
      }),
    )
  })

  it('cannot write to another student’s open attempt', async () => {
    await seedAttempt('a1')
    await assertFails(
      updateDoc(doc(ctx(OTHER_STUDENT), 'quiz_attempts', 'a1'), { total_score: 10 }),
    )
  })

  it('cannot delete an attempt', async () => {
    await seedAttempt('a1')
    await assertFails(deleteDoc(doc(ctx(STUDENT), 'quiz_attempts', 'a1')))
  })
})

describe('quiz_attempts · the teacher', () => {
  beforeEach(() => seedAttempt('a1'))

  it('can discard an open attempt', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(TEACHER), 'quiz_attempts', 'a1'), {
        status: 'discarded',
        discarded_by: TEACHER,
      }),
    )
  })

  it('can correct a submitted attempt', async () => {
    await seedAttempt('a2', { status: 'graded', total_score: 3 })
    await assertSucceeds(
      updateDoc(doc(ctx(TEACHER), 'quiz_attempts', 'a2'), { total_score: 7 }),
    )
  })

  it('can read an attempt in their class, and delete one', async () => {
    await assertSucceeds(getDoc(doc(ctx(TEACHER), 'quiz_attempts', 'a1')))
    await assertSucceeds(deleteDoc(doc(ctx(TEACHER), 'quiz_attempts', 'a1')))
  })

  it('a student can read their own attempt but not a classmate’s', async () => {
    await assertSucceeds(getDoc(doc(ctx(STUDENT), 'quiz_attempts', 'a1')))
    await assertFails(getDoc(doc(ctx(OTHER_STUDENT), 'quiz_attempts', 'a1')))
  })
})

describe('users · the billing fields no client may move', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', TEACHER), {
        role: 'teacher',
        first_name: 'T',
        last_name: 'R',
        school_id: 'school-1',
      })
    })
  })

  it('lets a teacher edit their own name', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(TEACHER), 'users', TEACHER), { first_name: 'Renamed' }),
    )
  })

  it('refuses a teacher moving themselves onto another school’s plan', async () => {
    // subscription_usage.py counts seats as `users where school_id == X`.
    await assertFails(
      updateDoc(doc(ctx(TEACHER), 'users', TEACHER), { school_id: 'school-2' }),
    )
  })

  it('refuses a teacher joining a group by writing the field', async () => {
    await assertFails(
      updateDoc(doc(ctx(TEACHER), 'users', TEACHER), { teacher_group_id: 'group-9' }),
    )
  })
})

describe('users · what a student may write about their own password', () => {
  beforeEach(seedRoles)

  /* The change-password screen clears is_temp_password right after Firebase
     accepts the new password. Without this allowance the write is denied, the
     password changes anyway, and the console keeps reporting the student as
     still on the one the school issued -- which is the stale badge the flag
     exists to prevent. Found by changing a password in the browser and watching
     the flag stay true. */
  it('lets a student record that they chose their own password', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(STUDENT), 'users', STUDENT), {
        is_temp_password: false,
        password_changed_at: new Date(),
      }),
    )
  })

  it('still refuses everything else a student might write about themselves', async () => {
    // The narrow allowlist is the point: birthdate is load-bearing, since the
    // guardian-access panel unlocks on age >= 18.
    await assertFails(
      updateDoc(doc(ctx(STUDENT), 'users', STUDENT), { birthdate: '2000-01-01' }),
    )
    await assertFails(
      updateDoc(doc(ctx(STUDENT), 'users', STUDENT), { role: 'teacher' }),
    )
  })

  it('does not let a student touch a classmate’s password state', async () => {
    await assertFails(
      updateDoc(doc(ctx(STUDENT), 'users', OTHER_STUDENT), { is_temp_password: false }),
    )
  })
})

/**
 * A school admin cannot create another admin (2026-10-03). Before this, the
 * `isAdmin()` branch of the update rule let an admin write ANY field on ANY
 * profile, role included — the re-role dropdown on the admin console's Users
 * table (Firestore-direct, no Flask endpoint in front of it) could promote
 * any teacher or student straight to 'admin'. That is the exact account the
 * owner ruled out of the create-user form and the bulk CSV on 2026-10-02
 * ("creating an admin wont happen anymore, only teacher and student now") —
 * closing the create path while leaving this one open would not have closed
 * anything.
 */
describe('users · a school admin cannot promote anyone to admin', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const db = admin.firestore()
      await setDoc(doc(db, 'users', ADMIN), { role: 'admin', first_name: 'A', last_name: 'D', school_id: 'school-1' })
      await setDoc(doc(db, 'users', OTHER_ADMIN), { role: 'admin', first_name: 'B', last_name: 'E', school_id: 'school-1' })
      await setDoc(doc(db, 'users', TEACHER), { role: 'teacher', first_name: 'T', last_name: 'R', school_id: 'school-1' })
      await setDoc(doc(db, 'users', STUDENT), { role: 'student', first_name: 'S', last_name: 'T', school_id: 'school-1' })
    })
  })

  it('refuses promoting a teacher to admin', async () => {
    await assertFails(
      updateDoc(doc(ctx(ADMIN), 'users', TEACHER), { role: 'admin' }),
    )
  })

  it('refuses promoting a student to admin', async () => {
    await assertFails(
      updateDoc(doc(ctx(ADMIN), 'users', STUDENT), { role: 'admin' }),
    )
  })

  it('still lets an admin edit an ordinary field on that teacher', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(ADMIN), 'users', TEACHER), { department: 'Science' }),
    )
  })

  it('still lets an admin edit a field on another existing admin, role unchanged', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(ADMIN), 'users', OTHER_ADMIN), { status: 'inactive' }),
    )
  })
})

/**
 * T-126: a school admin sees and edits only their OWN school's users, never
 * every account on the platform. A tester who registered a brand-new
 * institution found 369 existing users before adding anybody -- `isAdmin()`
 * alone opened every users/{uid} document to any admin of any school. Fixed
 * by comparing school_id between the caller and the target profile.
 */
describe('users · a school admin sees only their own school (T-126)', () => {
  const FOREIGN_ADMIN = 'admin-3'
  const FOREIGN_TEACHER_U = 'teacher-9'
  const FOREIGN_STUDENT = 'student-8'

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const db = admin.firestore()
      await setDoc(doc(db, 'users', ADMIN), { role: 'admin', first_name: 'A', last_name: 'D', school_id: 'school-1' })
      await setDoc(doc(db, 'users', TEACHER), { role: 'teacher', first_name: 'T', last_name: 'R', school_id: 'school-1' })
      await setDoc(doc(db, 'users', STUDENT), { role: 'student', first_name: 'S', last_name: 'T', school_id: 'school-1' })
      await setDoc(doc(db, 'users', FOREIGN_ADMIN), { role: 'admin', first_name: 'F', last_name: 'A', school_id: 'school-2' })
      await setDoc(doc(db, 'users', FOREIGN_TEACHER_U), { role: 'teacher', first_name: 'F', last_name: 'T', school_id: 'school-2' })
      await setDoc(doc(db, 'users', FOREIGN_STUDENT), { role: 'student', first_name: 'F', last_name: 'S', school_id: 'school-2' })
    })
  })

  it('lets an admin read a student at their own school', async () => {
    await assertSucceeds(getDoc(doc(ctx(ADMIN), 'users', STUDENT)))
  })

  it('refuses an admin reading a student at a different school', async () => {
    // Not a teacher target: any signed-in user may read a TEACHER profile by
    // design (docs/06 §2.B, unrelated to this fix) -- a student profile has
    // no such exemption, so it isolates the school_id check this card adds.
    await assertFails(getDoc(doc(ctx(ADMIN), 'users', FOREIGN_STUDENT)))
  })

  it('refuses an admin reading an admin at a different school', async () => {
    await assertFails(getDoc(doc(ctx(ADMIN), 'users', FOREIGN_ADMIN)))
  })

  it('refuses an admin editing a profile at a different school', async () => {
    await assertFails(
      updateDoc(doc(ctx(ADMIN), 'users', FOREIGN_TEACHER_U), { department: 'Science' }),
    )
  })

  it('refuses an admin deactivating a profile at a different school', async () => {
    await assertFails(
      updateDoc(doc(ctx(ADMIN), 'users', FOREIGN_TEACHER_U), { status: 'inactive' }),
    )
  })

  it('refuses an unscoped listing of every user on the platform', async () => {
    // Mirrors fetchAllUsers in hooks/useAdminUsers.js before the fix: no
    // where('school_id', ...) at all. Firestore refuses the whole query
    // outright when it cannot prove every possible result matches the rule.
    await assertFails(getDocs(collection(ctx(ADMIN), 'users')))
  })

  it('lets a school-scoped listing through and returns only that school', async () => {
    const snap = await getDocs(query(collection(ctx(ADMIN), 'users'), where('school_id', '==', 'school-1')))
    const ids = snap.docs.map((d) => d.id).sort()
    expect(ids).toEqual([ADMIN, STUDENT, TEACHER].sort())
  })
})

describe('teacher groups and invites are closed to every client', () => {
  it('denies reads and writes even to a teacher', async () => {
    for (const path of [
      'teacher_groups',
      'teacher_group_codes',
      'teacher_group_requests',
      'institution_invites',
    ]) {
      await assertFails(getDoc(doc(ctx(TEACHER), path, 'x')))
      await assertFails(setDoc(doc(ctx(TEACHER), path, 'x'), { a: 1 }))
    }
  })
})

/**
 * Proof that the suite above is enforcing, not decorating.
 *
 * An `assertFails` test passes just as happily when the rules never loaded at
 * all — the emulator's default is allow-everything, and a suite that forgot to
 * load its rules would report a clean run while checking nothing. That failure
 * mode is invisible, so it is pinned here instead.
 *
 * The weakened copy exists only as a string in this process. Nothing on disk
 * and nothing deployed is touched: the point is to show which line is doing
 * the work, by removing it and watching the protection disappear.
 */
describe('the guard that stops a submitted attempt being rewritten', () => {
  const GUARD = "            && resource.data.status == 'in_progress'\n"
  let weakened

  beforeAll(async () => {
    // Line endings normalised first. Git restores this file with CRLF on
    // Windows, so a guard string written with a bare newline would stop
    // matching and the throw below would fire on a rule that is perfectly
    // intact — a false alarm that looks exactly like a real one.
    const source = readFileSync(RULES_PATH, 'utf8').replace(/\r\n/g, '\n')
    // If this throws, the rule was reworded and this proof needs rewriting —
    // which is the correct outcome, not something to paper over.
    if (!source.includes(GUARD)) {
      throw new Error('The in_progress guard is not where this test expects it; re-check the rule.')
    }
    weakened = await initializeTestEnvironment({
      projectId: 'activklass-rules-weakened',
      firestore: {
        rules: source.replace(GUARD, ''),
        host: '127.0.0.1',
        port: 8080,
      },
    })
  })

  afterAll(async () => {
    await weakened?.cleanup()
  })

  it('is the only thing preventing it — remove it and the write goes through', async () => {
    await weakened.withSecurityRulesDisabled(async (admin) => {
      const db = admin.firestore()
      await setDoc(doc(db, 'users', STUDENT), { role: 'student' })
      await setDoc(doc(db, 'quiz_attempts', 'graded-1'), {
        quiz_id: 'quiz-1',
        student_id: STUDENT,
        status: 'graded',
        total_score: 3,
        started_at: new Date('2026-04-10T09:00:00Z'),
      })
    })

    // Without the guard, a student can rewrite their own finished score.
    await assertSucceeds(
      updateDoc(doc(weakened.authenticatedContext(STUDENT).firestore(), 'quiz_attempts', 'graded-1'), {
        total_score: 10,
      }),
    )
    // And the real ruleset, tested above, refuses exactly this.
  })
})

/**
 * Guardian revocation.
 *
 * Revoking is a delete, so access stops the moment the link document goes.
 * But the CODE outlives the link: guardian_codes has no consumed flag and
 * neither revoke path rotates one. Without the revoked list these tests pin,
 * a removed guardian could retype the same six characters, and for a MINOR
 * the create rule then forces status 'approved' with every scope on -- full
 * access restored with nobody approving it.
 *
 * That matters most exactly where the protection is weakest: a minor cannot
 * revoke their own guardian (the update and delete rules require
 * is_minor == false), so revocation is a teacher's or admin's decision, and
 * re-redeeming would let the revoked guardian overturn it unilaterally.
 */
describe('guardian_links · a revoked guardian cannot let themselves back in', () => {
  const PARENT = 'parent-1'
  const OTHER_PARENT = 'parent-2'
  const CODE = 'ABC234'
  const linkId = (guardian) => STUDENT + '_' + guardian

  const ALL_ON = {
    can_view_grades: true,
    can_view_quiz_scores: true,
    can_view_attendance: true,
    can_view_analytics: true,
  }

  /** What a guardian redeeming a MINOR's code must submit. */
  const minorLink = (guardian) => ({
    student_uid: STUDENT,
    guardian_uid: guardian,
    code: CODE,
    is_minor: true,
    status: 'approved',
    scopes: ALL_ON,
  })

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const db = admin.firestore()
      await setDoc(doc(db, 'users', PARENT), { role: 'parent', first_name: 'P', last_name: 'One' })
      await setDoc(doc(db, 'users', OTHER_PARENT), { role: 'parent', first_name: 'P', last_name: 'Two' })
      await setDoc(doc(db, 'guardian_codes', CODE), {
        code: CODE,
        student_uid: STUDENT,
        student_name: 'A B',
        is_minor: true,
        default_scopes: ALL_ON,
      })
    })
  })

  /** Revoke the way the app does it: drop the link, then mark the guardian. */
  async function revoke(guardian) {
    await deleteDoc(doc(ctx(TEACHER), 'guardian_links', linkId(guardian)))
    await updateDoc(doc(ctx(TEACHER), 'guardian_codes', CODE), {
      revoked_guardian_uids: [guardian],
    })
  }

  it('lets a guardian redeem a minor code and unlock at once', async () => {
    await assertSucceeds(
      setDoc(doc(ctx(PARENT), 'guardian_links', linkId(PARENT)), minorLink(PARENT)),
    )
  })

  it('lets a teacher revoke, recording it on the code', async () => {
    await setDoc(doc(ctx(PARENT), 'guardian_links', linkId(PARENT)), minorLink(PARENT))
    await assertSucceeds(revoke(PARENT))
  })

  it('refuses the revoked guardian re-redeeming the same code', async () => {
    await setDoc(doc(ctx(PARENT), 'guardian_links', linkId(PARENT)), minorLink(PARENT))
    await revoke(PARENT)
    await assertFails(
      setDoc(doc(ctx(PARENT), 'guardian_links', linkId(PARENT)), minorLink(PARENT)),
    )
  })

  it('still lets a DIFFERENT guardian redeem that code', async () => {
    await setDoc(doc(ctx(PARENT), 'guardian_links', linkId(PARENT)), minorLink(PARENT))
    await revoke(PARENT)
    // The block is targeted at the revoked guardian, not the code. A second
    // parent holding the same six characters is unaffected -- rotating the
    // code instead would have cut them off for someone else's revocation.
    await assertSucceeds(
      setDoc(
        doc(ctx(OTHER_PARENT), 'guardian_links', linkId(OTHER_PARENT)),
        minorLink(OTHER_PARENT),
      ),
    )
  })

  it('does not let a guardian clear their own revocation', async () => {
    await setDoc(doc(ctx(PARENT), 'guardian_links', linkId(PARENT)), minorLink(PARENT))
    await revoke(PARENT)
    await assertFails(
      updateDoc(doc(ctx(PARENT), 'guardian_codes', CODE), { revoked_guardian_uids: [] }),
    )
  })

  it('does not let a guardian reach is_minor while writing the revoked list', async () => {
    await assertFails(
      updateDoc(doc(ctx(STUDENT), 'guardian_codes', CODE), {
        revoked_guardian_uids: [PARENT],
        is_minor: false,
      }),
    )
  })
})

describe('school_directory · the registration page dropdown', () => {
  // A well-formed entry as lib/schoolDirectory.js writes it. The rule pins
  // created_at to request.time, which serverTimestamp() satisfies.
  const entry = (by = TEACHER) => ({
    name: 'University of Cebu-Banilad',
    abbreviation: 'UCB',
    created_by: by,
    created_at: serverTimestamp(),
  })

  it('is readable with no account at all — the register form is pre-auth', async () => {
    await assertSucceeds(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'school_directory', 'ucb')),
    )
  })

  it('lets a signed-in user create an entry under its lowercased abbreviation', async () => {
    await assertSucceeds(setDoc(doc(ctx(TEACHER), 'school_directory', 'ucb'), entry()))
  })

  it('refuses a doc id that is not the lowercased abbreviation', async () => {
    // The id is the uniqueness guarantee; an entry filed elsewhere would let
    // "UCB" exist twice.
    await assertFails(setDoc(doc(ctx(TEACHER), 'school_directory', 'elsewhere'), entry()))
  })

  it('refuses creation signed out or signed as someone else', async () => {
    await assertFails(
      setDoc(doc(testEnv.unauthenticatedContext().firestore(), 'school_directory', 'ucb'), entry()),
    )
    await assertFails(setDoc(doc(ctx(STUDENT), 'school_directory', 'ucb'), entry(TEACHER)))
  })

  it('refuses extra fields and malformed abbreviations', async () => {
    await assertFails(
      setDoc(doc(ctx(TEACHER), 'school_directory', 'ucb'), { ...entry(), login_prefix: 'ucb' }),
    )
    await assertFails(
      setDoc(doc(ctx(TEACHER), 'school_directory', 'u c b'), { ...entry(), abbreviation: 'U C B' }),
    )
  })

  it('refuses client rewrites or deletes of an existing entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'school_directory', 'ucb'), {
        name: 'University of Cebu-Banilad',
        abbreviation: 'UCB',
      })
    })
    await assertFails(updateDoc(doc(ctx(TEACHER), 'school_directory', 'ucb'), { name: 'Hijacked U' }))
    await assertFails(deleteDoc(doc(ctx(TEACHER), 'school_directory', 'ucb')))
  })
})

describe('subscription_requests · the Institution path on /register', () => {
  // The exact shape register.jsx's details() + createAccount() build (T-61:
  // 'he'/'she'/'others' and no middle_name/gender_custom key refused every
  // request after the form switched to female/male/custom).
  const request = (overrides = {}) => ({
    uid: TEACHER,
    first_name: 'Maykel',
    last_name: 'Dela Cruz',
    gender: 'female',
    phone: '09171234567',
    school_name: 'University of Cebu-Banilad',
    school_type: 'private',
    academic_calendar: 'school_year',
    position: 'faculty',
    email: 'maykel@ucb.edu.ph',
    teacher_seats: 20,
    students_per_teacher: 120,
    student_seats: 2400,
    status: 'pending',
    created_at: serverTimestamp(),
    ...overrides,
  })

  it('lets a signed-in requester file their own request with a female gender', async () => {
    await assertSucceeds(
      setDoc(doc(collection(ctx(TEACHER), 'subscription_requests')), request()),
    )
  })

  it('lets a Custom gender with a gender_custom note and a middle name through', async () => {
    await assertSucceeds(
      setDoc(
        doc(collection(ctx(TEACHER), 'subscription_requests')),
        request({ gender: 'custom', gender_custom: 'Nonbinary', middle_name: 'Santos' }),
      ),
    )
  })

  it('refuses the old pronoun-shaped gender values', async () => {
    await assertFails(
      setDoc(doc(collection(ctx(TEACHER), 'subscription_requests')), request({ gender: 'he' })),
    )
  })

  it('refuses a request signed with someone else’s uid', async () => {
    await assertFails(
      setDoc(doc(collection(ctx(TEACHER), 'subscription_requests')), request({ uid: 'someone-else' })),
    )
  })

  it('never lets the requester read their own request back', async () => {
    const ref = doc(collection(ctx(TEACHER), 'subscription_requests'))
    await setDoc(ref, request())
    await assertFails(getDoc(ref))
  })
})

describe('payments · the PayMongo checkout flip (T-68)', () => {
  // Written only by the Flask subscription endpoints through the Admin SDK,
  // which these rules do not govern -- a client never gets to write one.
  async function seedPayment(ownerId) {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'payments', `pay-${ownerId}`), {
        owner_id: ownerId,
        amount: 3600,
        provider: 'paymongo',
        status: 'paid',
      })
    })
  }

  it('lets the paying teacher read their own payment', async () => {
    await seedPayment(TEACHER)
    await assertSucceeds(getDoc(doc(ctx(TEACHER), 'payments', `pay-${TEACHER}`)))
  })

  it('refuses a client write, even from the owner', async () => {
    await assertFails(
      setDoc(doc(ctx(TEACHER), 'payments', 'pay-new'), { owner_id: TEACHER, amount: 1, status: 'paid' }),
    )
  })

  it('refuses another teacher reading it', async () => {
    await seedPayment(TEACHER)
    await assertFails(getDoc(doc(ctx(STUDENT), 'payments', `pay-${TEACHER}`)))
  })
})

/* ────────────────────────────────────────────────────────────────────────
 * A teacher handles the students in their own classes (2026-08-31).
 *
 * users.teacher_ids is written by the server from the rosters
 * (services/roster_sync.py); the rules read it. OWN_TEACHER owns class-1
 * with STUDENT on it; FOREIGN_TEACHER owns nothing STUDENT is on. Every
 * read a teacher screen makes is tried as both, and every way a client
 * could forge the link is tried as the owner.
 * ──────────────────────────────────────────────────────────────────────── */
const OWN_TEACHER = TEACHER
const FOREIGN_TEACHER = 'teacher-2'

async function seedRoster() {
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore()
    await setDoc(doc(db, 'users', FOREIGN_TEACHER), { role: 'teacher', first_name: 'F', last_name: 'T' })
    await setDoc(doc(db, 'users', STUDENT), { role: 'student', first_name: 'A', last_name: 'B', teacher_ids: [OWN_TEACHER] })
    await setDoc(doc(db, 'classes', 'class-1'), { teacher_id: OWN_TEACHER, student_ids: [STUDENT] })
    await setDoc(doc(db, 'classes', 'class-2'), { teacher_id: FOREIGN_TEACHER, student_ids: [] })
    await setDoc(doc(db, 'student_performance', `class-1_${STUDENT}`), { class_id: 'class-1', student_id: STUDENT, risk_probability: 0.2 })
    await setDoc(doc(db, 'remediations', 'plan-1'), { kind: 'plan', class_id: 'class-1', created_by: OWN_TEACHER })
    await setDoc(doc(db, 'guardian_links', `${STUDENT}_g1`), { student_uid: STUDENT, guardian_uid: 'g1', status: 'approved' })
    await setDoc(doc(db, 'consent_records', STUDENT), { parent_id: 'g1', status: 'approved', is_minor: true })
    await setDoc(doc(db, 'gradebooks', 'class-1'), { configured: true })
    await setDoc(doc(db, 'gradebooks', 'class-1', 'entries', STUDENT), { student_id: STUDENT, final: 90 })
  })
  await seedAttempt('a-own', { status: 'submitted', total_score: 8 })
}

describe('a teacher reads only the students they handle', () => {
  beforeEach(seedRoster)

  it('the roster query the whole app uses: documentId in [...] is judged per student', async () => {
    const q = (uid) => getDocs(query(collection(ctx(uid), 'users'), where(documentId(), 'in', [STUDENT])))
    await assertSucceeds(q(OWN_TEACHER))
    await assertFails(q(FOREIGN_TEACHER))
  })

  it('a single profile read follows the same line', async () => {
    await assertSucceeds(getDoc(doc(ctx(OWN_TEACHER), 'users', STUDENT)))
    await assertFails(getDoc(doc(ctx(FOREIGN_TEACHER), 'users', STUDENT)))
  })

  it('teacher profiles stay readable by every teacher (the Your school card)', async () => {
    await assertSucceeds(getDoc(doc(ctx(FOREIGN_TEACHER), 'users', OWN_TEACHER)))
  })

  it('quiz attempts, risk snapshots and remediations: the class owner, through a class_id filter', async () => {
    for (const coll of ['quiz_attempts', 'student_performance', 'remediations']) {
      const q = (uid) => getDocs(query(collection(ctx(uid), coll), where('class_id', '==', 'class-1')))
      await assertSucceeds(q(OWN_TEACHER))
      await assertFails(q(FOREIGN_TEACHER))
    }
    // and without the filter the rules cannot prove ownership, so even the owner is refused
    await assertFails(getDocs(query(collection(ctx(OWN_TEACHER), 'quiz_attempts'), where('quiz_id', '==', 'quiz-1'))))
  })

  it('grade entries: the class owner only', async () => {
    await assertSucceeds(getDoc(doc(ctx(OWN_TEACHER), 'gradebooks', 'class-1', 'entries', STUDENT)))
    await assertFails(getDoc(doc(ctx(FOREIGN_TEACHER), 'gradebooks', 'class-1', 'entries', STUDENT)))
  })

  it('guardian links and consent: the student’s own teacher, via a get() on the student', async () => {
    const links = (uid) => getDocs(query(collection(ctx(uid), 'guardian_links'), where('student_uid', '==', STUDENT)))
    await assertSucceeds(links(OWN_TEACHER))
    await assertFails(links(FOREIGN_TEACHER))
    await assertSucceeds(getDoc(doc(ctx(OWN_TEACHER), 'consent_records', STUDENT)))
    await assertFails(getDoc(doc(ctx(FOREIGN_TEACHER), 'consent_records', STUDENT)))
  })

  it('a teacher edits roster fields only on a student they handle', async () => {
    await assertSucceeds(updateDoc(doc(ctx(OWN_TEACHER), 'users', STUDENT), { section: 'Rizal' }))
    await assertFails(updateDoc(doc(ctx(FOREIGN_TEACHER), 'users', STUDENT), { section: 'Rizal' }))
  })

  it('no client can forge the link: teacher_ids is server-owned', async () => {
    await assertFails(updateDoc(doc(ctx(OWN_TEACHER), 'users', STUDENT), { teacher_ids: [OWN_TEACHER, FOREIGN_TEACHER] }))
    await assertFails(updateDoc(doc(ctx(FOREIGN_TEACHER), 'users', STUDENT), { teacher_ids: [FOREIGN_TEACHER] }))
    await assertFails(updateDoc(doc(ctx(STUDENT), 'users', STUDENT), { teacher_ids: [] }))
    await assertFails(setDoc(doc(ctx(OWN_TEACHER), 'users', 'new-student'), { role: 'student', teacher_ids: [OWN_TEACHER] }))
  })

  it('no client can change a roster or an owner: that is Flask’s (services/roster_sync.py)', async () => {
    await assertFails(updateDoc(doc(ctx(OWN_TEACHER), 'classes', 'class-1'), { student_ids: [] }))
    await assertFails(updateDoc(doc(ctx(OWN_TEACHER), 'classes', 'class-1'), { teacher_id: FOREIGN_TEACHER }))
    await assertFails(deleteDoc(doc(ctx(OWN_TEACHER), 'classes', 'class-1')))
    // the edits a teacher still makes on their own class go through
    await assertSucceeds(updateDoc(doc(ctx(OWN_TEACHER), 'classes', 'class-1'), { section: 'Rizal' }))
    // creating a class: own, and empty
    await assertSucceeds(setDoc(doc(ctx(OWN_TEACHER), 'classes', 'class-new'), { teacher_id: OWN_TEACHER, student_ids: [] }))
    await assertFails(setDoc(doc(ctx(OWN_TEACHER), 'classes', 'class-x'), { teacher_id: OWN_TEACHER, student_ids: [STUDENT] }))
    await assertFails(setDoc(doc(ctx(OWN_TEACHER), 'classes', 'class-y'), { teacher_id: FOREIGN_TEACHER, student_ids: [] }))
  })

  it('a student still reads their own records', async () => {
    await assertSucceeds(getDoc(doc(ctx(STUDENT), 'users', STUDENT)))
    await assertSucceeds(getDoc(doc(ctx(STUDENT), 'gradebooks', 'class-1', 'entries', STUDENT)))
    await assertSucceeds(getDocs(query(collection(ctx(STUDENT), 'quiz_attempts'), where('student_id', '==', STUDENT))))
  })
})

/* ────────────────────────────────────────────────────────────────────────
 * class_tasks (2026-09-13): activities, assignments and paper exams a
 * teacher publishes under a sub-module for ONE class.
 *
 * The rule reads class_id for everything: the owner of that class creates,
 * updates and deletes; an enrolled student reads only what is published;
 * a teacher who does not own the class is refused on all of it -- there is
 * deliberately no bare isTeacher() branch. The student's list query has to
 * carry BOTH filters the rule reads (class_id in [...], status ==
 * 'published'), which is what useStudentDeliverables sends; the last test
 * proves the same query without the status filter is refused, so nobody
 * "simplifies" it later.
 * ──────────────────────────────────────────────────────────────────────── */
const NON_ENROLLED = 'student-9'

async function seedClassTasks() {
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore()
    await setDoc(doc(db, 'users', FOREIGN_TEACHER), { role: 'teacher', first_name: 'F', last_name: 'T' })
    await setDoc(doc(db, 'users', NON_ENROLLED), { role: 'student', first_name: 'N', last_name: 'E', teacher_ids: [] })
    await setDoc(doc(db, 'classes', 'class-1'), { teacher_id: OWN_TEACHER, student_ids: [STUDENT, OTHER_STUDENT] })
    await setDoc(doc(db, 'classes', 'class-2'), { teacher_id: FOREIGN_TEACHER, student_ids: [NON_ENROLLED] })
    await setDoc(doc(db, 'class_tasks', 'task-pub'), {
      class_id: 'class-1', teacher_id: OWN_TEACHER, kind: 'assignment', title: 'Assignment 1',
      topic_id: 't1', status: 'published', opens_at: '2026-09-14T08:00', due_at: '2026-09-19T23:59', attachments: [],
    })
    await setDoc(doc(db, 'class_tasks', 'task-draft'), {
      class_id: 'class-1', teacher_id: OWN_TEACHER, kind: 'activity', title: 'Draft activity',
      topic_id: 't1', status: 'draft', opens_at: null, due_at: null, attachments: [],
    })
  })
}

const newTask = (over = {}) => ({
  class_id: 'class-1', teacher_id: OWN_TEACHER, kind: 'activity', title: 'Lab 1',
  topic_id: 't1', status: 'draft', opens_at: null, due_at: null, attachments: [], ...over,
})

describe('class_tasks · the class owner writes, the class reads', () => {
  beforeEach(seedClassTasks)

  it('the owner creates a task on their class under their own teacher_id', async () => {
    await assertSucceeds(setDoc(doc(ctx(OWN_TEACHER), 'class_tasks', 'new-1'), newTask()))
  })

  it('a foreign teacher cannot create one on that class, nor forge the owner’s id', async () => {
    await assertFails(setDoc(doc(ctx(FOREIGN_TEACHER), 'class_tasks', 'new-2'), newTask({ teacher_id: FOREIGN_TEACHER })))
    await assertFails(setDoc(doc(ctx(FOREIGN_TEACHER), 'class_tasks', 'new-3'), newTask()))
    // and the owner cannot stamp someone else as the author
    await assertFails(setDoc(doc(ctx(OWN_TEACHER), 'class_tasks', 'new-4'), newTask({ teacher_id: FOREIGN_TEACHER })))
  })

  it('the owner reads a task, and lists them with the class_id filter useClassTasks sends', async () => {
    await assertSucceeds(getDoc(doc(ctx(OWN_TEACHER), 'class_tasks', 'task-draft')))
    await assertSucceeds(getDocs(query(collection(ctx(OWN_TEACHER), 'class_tasks'), where('class_id', '==', 'class-1'))))
  })

  it('a foreign teacher is refused the read, the list, the update and the delete', async () => {
    await assertFails(getDoc(doc(ctx(FOREIGN_TEACHER), 'class_tasks', 'task-pub')))
    await assertFails(getDocs(query(collection(ctx(FOREIGN_TEACHER), 'class_tasks'), where('class_id', '==', 'class-1'))))
    await assertFails(updateDoc(doc(ctx(FOREIGN_TEACHER), 'class_tasks', 'task-pub'), { title: 'Hijacked' }))
    await assertFails(deleteDoc(doc(ctx(FOREIGN_TEACHER), 'class_tasks', 'task-pub')))
  })

  it('the owner updates (including publishing) and deletes', async () => {
    await assertSucceeds(updateDoc(doc(ctx(OWN_TEACHER), 'class_tasks', 'task-draft'), { status: 'published', due_at: '2026-09-20T23:59' }))
    await assertSucceeds(deleteDoc(doc(ctx(OWN_TEACHER), 'class_tasks', 'task-draft')))
  })

  it('an enrolled student reads a published task and is refused a draft', async () => {
    await assertSucceeds(getDoc(doc(ctx(STUDENT), 'class_tasks', 'task-pub')))
    await assertFails(getDoc(doc(ctx(STUDENT), 'class_tasks', 'task-draft')))
  })

  it('a student who is not on the class is refused even the published one', async () => {
    await assertFails(getDoc(doc(ctx(NON_ENROLLED), 'class_tasks', 'task-pub')))
  })

  it('a student never writes a task', async () => {
    await assertFails(setDoc(doc(ctx(STUDENT), 'class_tasks', 'new-5'), newTask({ teacher_id: STUDENT, status: 'published' })))
    await assertFails(updateDoc(doc(ctx(STUDENT), 'class_tasks', 'task-pub'), { due_at: '2027-01-01T00:00' }))
    await assertFails(deleteDoc(doc(ctx(STUDENT), 'class_tasks', 'task-pub')))
  })

  it('the exact list query useStudentDeliverables sends passes for an enrolled student', async () => {
    const q = (uid) => getDocs(query(
      collection(ctx(uid), 'class_tasks'),
      where('class_id', 'in', ['class-1']),
      where('status', '==', 'published'),
    ))
    await assertSucceeds(q(STUDENT))
    // and a student the class does not list is refused the same query
    await assertFails(q(NON_ENROLLED))
  })

  it('the same query without the status filter is refused — the rule cannot prove the draft branch', async () => {
    await assertFails(getDocs(query(collection(ctx(STUDENT), 'class_tasks'), where('class_id', 'in', ['class-1']))))
    await assertFails(getDocs(query(collection(ctx(STUDENT), 'class_tasks'), where('class_id', '==', 'class-1'))))
  })
})

/* ────────────────────────────────────────────────────────────────────────
 * task_submissions (2026-09-13, plan section 9): a student's hand-in for a
 * class task whose teacher switched the bin on.
 *
 * The student writes only their own, only onto a task that is published,
 * accepts submissions, and belongs to a class they are on; an update may
 * not move the row to another task, class or student. Teachers never write.
 * The teacher reads through the class -- so the teacher's list query must
 * carry class_id beside task_id, and the last write-side test proves a
 * task_id-only query is refused even for the owner, so nobody "simplifies"
 * useTaskSubmissions later. A student reads their own and nobody else's.
 * ──────────────────────────────────────────────────────────────────────── */
async function seedSubmissions() {
  await seedClassTasks()
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore()
    await updateDoc(doc(db, 'class_tasks', 'task-pub'), { accepts_submissions: true })
    await setDoc(doc(db, 'class_tasks', 'task-closed-bin'), {
      class_id: 'class-1', teacher_id: OWN_TEACHER, kind: 'assignment', title: 'No bin',
      topic_id: 't1', status: 'published', opens_at: null, due_at: null, attachments: [], accepts_submissions: false,
    })
    await setDoc(doc(db, 'class_tasks', 'task-elsewhere'), {
      class_id: 'class-2', teacher_id: FOREIGN_TEACHER, kind: 'assignment', title: 'Other class',
      topic_id: 't1', status: 'published', opens_at: null, due_at: null, attachments: [], accepts_submissions: true,
    })
    // OTHER_STUDENT has already handed in on task-pub.
    await setDoc(doc(db, 'task_submissions', `task-pub_${OTHER_STUDENT}`), submission({ student_id: OTHER_STUDENT }))
  })
}

const submission = (over = {}) => ({
  task_id: 'task-pub', class_id: 'class-1', student_id: STUDENT,
  attachment: { title: 'My doc', resource_type: 'link', url: 'https://docs.google.com/document/d/x' },
  note: '', submitted_at: serverTimestamp(), resubmitted_count: 0, ...over,
})

describe('task_submissions · the student hands in their own, the class reads', () => {
  beforeEach(seedSubmissions)

  it('a student creates their own submission on a published task that accepts them', async () => {
    await assertSucceeds(setDoc(doc(ctx(STUDENT), 'task_submissions', `task-pub_${STUDENT}`), submission()))
  })

  it('is refused on a draft task, on a task whose bin is off, and on a class they are not on', async () => {
    await assertFails(setDoc(doc(ctx(STUDENT), 'task_submissions', `task-draft_${STUDENT}`), submission({ task_id: 'task-draft' })))
    await assertFails(setDoc(doc(ctx(STUDENT), 'task_submissions', `task-closed-bin_${STUDENT}`), submission({ task_id: 'task-closed-bin' })))
    await assertFails(setDoc(doc(ctx(STUDENT), 'task_submissions', `task-elsewhere_${STUDENT}`), submission({ task_id: 'task-elsewhere', class_id: 'class-2' })))
  })

  it('cannot be written under another student’s id, nor with a class_id the task does not belong to', async () => {
    await assertFails(setDoc(doc(ctx(STUDENT), 'task_submissions', `task-pub_${OTHER_STUDENT}`), submission({ student_id: OTHER_STUDENT })))
    await assertFails(setDoc(doc(ctx(STUDENT), 'task_submissions', `task-pub_${STUDENT}`), submission({ class_id: 'class-2' })))
  })

  it('re-submits their own (a set at the same id), but cannot move it to another task, class or student', async () => {
    const own = doc(ctx(STUDENT), 'task_submissions', `task-pub_${STUDENT}`)
    await assertSucceeds(setDoc(own, submission()))
    await assertSucceeds(setDoc(own, submission({ note: 'Fixed the table.', resubmitted_count: 1 })))
    await assertFails(setDoc(own, submission({ task_id: 'task-closed-bin' })))
    await assertFails(setDoc(own, submission({ class_id: 'class-2' })))
    await assertFails(setDoc(own, submission({ student_id: OTHER_STUDENT })))
  })

  it('a teacher never writes a submission, even on their own class', async () => {
    await assertFails(setDoc(doc(ctx(OWN_TEACHER), 'task_submissions', `task-pub_${STUDENT}`), submission()))
    await assertFails(updateDoc(doc(ctx(OWN_TEACHER), 'task_submissions', `task-pub_${OTHER_STUDENT}`), { note: 'edited' }))
  })

  it('the owner reads the bin with the (class_id, task_id) query useTaskSubmissions sends, and is refused a task_id-only one', async () => {
    await assertSucceeds(getDocs(query(
      collection(ctx(OWN_TEACHER), 'task_submissions'),
      where('class_id', '==', 'class-1'),
      where('task_id', '==', 'task-pub'),
    )))
    await assertFails(getDocs(query(collection(ctx(OWN_TEACHER), 'task_submissions'), where('task_id', '==', 'task-pub'))))
    await assertSucceeds(getDoc(doc(ctx(OWN_TEACHER), 'task_submissions', `task-pub_${OTHER_STUDENT}`)))
  })

  it('a foreign teacher is refused every read and the delete; the owner may delete', async () => {
    await assertFails(getDoc(doc(ctx(FOREIGN_TEACHER), 'task_submissions', `task-pub_${OTHER_STUDENT}`)))
    await assertFails(getDocs(query(
      collection(ctx(FOREIGN_TEACHER), 'task_submissions'),
      where('class_id', '==', 'class-1'),
      where('task_id', '==', 'task-pub'),
    )))
    await assertFails(deleteDoc(doc(ctx(FOREIGN_TEACHER), 'task_submissions', `task-pub_${OTHER_STUDENT}`)))
    await assertSucceeds(deleteDoc(doc(ctx(OWN_TEACHER), 'task_submissions', `task-pub_${OTHER_STUDENT}`)))
  })

  it('a student reads their own rows with the student_id query useStudentDeliverables sends, and not another student’s', async () => {
    await assertSucceeds(getDocs(query(collection(ctx(OTHER_STUDENT), 'task_submissions'), where('student_id', '==', OTHER_STUDENT))))
    await assertSucceeds(getDoc(doc(ctx(OTHER_STUDENT), 'task_submissions', `task-pub_${OTHER_STUDENT}`)))
    await assertFails(getDoc(doc(ctx(STUDENT), 'task_submissions', `task-pub_${OTHER_STUDENT}`)))
    await assertFails(getDocs(query(collection(ctx(STUDENT), 'task_submissions'), where('task_id', '==', 'task-pub'))))
    await assertFails(deleteDoc(doc(ctx(OTHER_STUDENT), 'task_submissions', `task-pub_${OTHER_STUDENT}`)))
  })
})

/* T-125 (2026-10-03): the admin-creation closure (T-113 follow-up, commit
 * b9f9a9f) wrapped every isAdmin() guardian check in adminCannotGrantAdmin(),
 * which reads request.resource.data.role. On a delete request.resource is
 * null, so the read crashes → PERMISSION_DENIED. Guardian documents have no
 * role field anyway — the guard belongs only on users/{uid}, where role lives.
 * Fix: plain isAdmin() on all four guardian call sites. These tests pin that
 * the regression is gone and that the admin-escalation block on users is
 * still intact. */
describe('T-125 — admin guardian access restored; role-escalation block untouched', () => {
  const GUARDIAN = 'guardian-1'
  const LINK_ID = `${STUDENT}_${GUARDIAN}`
  const CODE = 'abc123'

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const db = admin.firestore()
      await setDoc(doc(db, 'users', ADMIN), { role: 'admin', school_id: 'school-1' })
      // Overrides seedRoles()'s school_id-less TEACHER so the "edit a
      // non-role field" check below has a same-school target (T-126).
      await setDoc(doc(db, 'users', TEACHER), { role: 'teacher', first_name: 'T', last_name: 'R', school_id: 'school-1' })
      await setDoc(doc(db, 'guardian_codes', CODE), {
        student_uid: STUDENT,
        is_minor: true,
      })
      await setDoc(doc(db, 'guardian_links', LINK_ID), {
        student_uid: STUDENT,
        guardian_uid: GUARDIAN,
        status: 'approved',
        is_minor: true,
        scopes: { can_view_grades: true, can_view_quiz_scores: true, can_view_attendance: true, can_view_analytics: true },
      })
    })
  })

  it('an admin can read a guardian link (was broken by T-125)', async () => {
    await assertSucceeds(getDoc(doc(ctx(ADMIN), 'guardian_links', LINK_ID)))
  })

  it('an admin can update a guardian link — e.g. revoke a guardian (was broken by T-125)', async () => {
    await assertSucceeds(updateDoc(doc(ctx(ADMIN), 'guardian_links', LINK_ID), {
      status: 'approved',
      scopes: { can_view_grades: false, can_view_quiz_scores: false, can_view_attendance: false, can_view_analytics: false },
    }))
  })

  it('an admin can delete a guardian link — full revocation (was broken by T-125)', async () => {
    await assertSucceeds(deleteDoc(doc(ctx(ADMIN), 'guardian_links', LINK_ID)))
  })

  it('an admin can delete a guardian code — rotation (was broken by T-125)', async () => {
    await assertSucceeds(deleteDoc(doc(ctx(ADMIN), 'guardian_codes', CODE)))
  })

  /* The admin-escalation block on users/{uid} must be unchanged — writing
   * role:'admin' onto a non-admin must still be denied. This is the most
   * important regression check: the fix must not open that door. */
  it('an admin still cannot escalate another user to admin on users/{uid}', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', TEACHER), { role: 'teacher', first_name: 'T', last_name: 'R' })
    })
    await assertFails(
      updateDoc(doc(ctx(ADMIN), 'users', TEACHER), { role: 'admin' })
    )
  })

  it('an admin can still edit non-role fields on a user document', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(ADMIN), 'users', TEACHER), { first_name: 'Updated' })
    )
  })
})
