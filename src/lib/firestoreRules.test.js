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

  /**
   * T-208 (audit F-06): this used to be `assertSucceeds` -- "the whole
   * reason the rule was widened" -- because nothing stopped a student
   * writing ANY total_score on their own attempt once the rest of the
   * update's guards passed. Finishing an attempt is now reachable only
   * through POST /api/quiz_attempts/<id>/submit (app/api/quizzes.py),
   * which grades from the quiz's own answer key via the Admin SDK and
   * bypasses this file entirely -- a direct client write that tries to
   * move status off 'in_progress' is refused here, whatever score it
   * claims.
   */
  it('refuses the student finishing the attempt by writing the score directly', async () => {
    await assertFails(
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

  it('still lets the student save answers while staying in_progress (autosave)', async () => {
    // Mirrors mobile's saveAnswers() and the reopen/deadline writes below --
    // none of these touch `status`, so it stays 'in_progress' and the
    // T-208 guard above does not apply to them.
    await assertSucceeds(
      updateDoc(doc(ctx(STUDENT), 'quiz_attempts', 'a1'), {
        answers: { q1: 'o2' },
        answers_saved_at: new Date(),
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
  // T-208 (audit F-06) added the second line: before it, this single line
  // was the only thing stopping a student rewriting an ALREADY-finished
  // attempt's score. Both lines now do related but distinct jobs (the
  // second one is proven separately below), so both come out together to
  // reopen the specific hole this test is named for.
  const GUARD =
    "            && resource.data.status == 'in_progress'\n" +
    "            && request.resource.data.status == 'in_progress'\n"
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
      throw new Error('The in_progress guards are not where this test expects them; re-check the rule.')
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
 * T-208 (audit F-06): the guard above stops REWRITING an attempt that is
 * already finished. This is the narrower, newer line that stops a student
 * FINISHING one themselves in the first place — before it, nothing kept
 * `request.resource.data.status` from leaving 'in_progress' at all, so the
 * student-written `finishAttempt()` could set status straight to 'graded'
 * with any total_score it liked. Proven the same way: strip only this one
 * line (leaving the older guard above untouched) and show that a student
 * can finish their own OPEN attempt directly, with a self-chosen score,
 * exactly the hole this ticket closes.
 */
describe('the guard that stops a student finishing their own attempt directly', () => {
  const GUARD = "            && request.resource.data.status == 'in_progress'\n"
  let weakened

  beforeAll(async () => {
    const source = readFileSync(RULES_PATH, 'utf8').replace(/\r\n/g, '\n')
    if (!source.includes(GUARD)) {
      throw new Error('The request.resource status guard is not where this test expects it; re-check the rule.')
    }
    weakened = await initializeTestEnvironment({
      projectId: 'activklass-rules-weakened-2',
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

  it('is the only thing preventing a student grading themselves — remove it and the write goes through', async () => {
    await weakened.withSecurityRulesDisabled(async (admin) => {
      const db = admin.firestore()
      await setDoc(doc(db, 'users', STUDENT), { role: 'student' })
      await setDoc(doc(db, 'quiz_attempts', 'open-1'), {
        quiz_id: 'quiz-1',
        student_id: STUDENT,
        status: 'in_progress',
        started_at: new Date('2026-04-10T09:00:00Z'),
      })
    })

    // Without this guard, a student can finish their own attempt and name
    // their own score -- no server grading involved at all.
    await assertSucceeds(
      updateDoc(doc(weakened.authenticatedContext(STUDENT).firestore(), 'quiz_attempts', 'open-1'), {
        status: 'graded',
        total_score: 9999,
      }),
    )
    // And the real ruleset refuses this -- see "refuses the student
    // finishing the attempt by writing the score directly" above.
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
  // T-162: this must be the exact shape register.jsx's details() actually
  // sends. It used to hard-code `gender: 'female'` — a field the form
  // stopped sending back in T-109 — so every test here was green against a
  // payload production never produces, while the rules still demanded the
  // field and refused every real request. No `gender` / `gender_custom` key
  // belongs in this helper again unless the form sends one.
  const request = (overrides = {}) => ({
    uid: TEACHER,
    first_name: 'Maykel',
    last_name: 'Dela Cruz',
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

  it('lets a signed-in requester file their own request — the exact shape register.jsx sends', async () => {
    await assertSucceeds(
      setDoc(doc(collection(ctx(TEACHER), 'subscription_requests')), request()),
    )
  })

  it('lets a middle name through', async () => {
    await assertSucceeds(
      setDoc(
        doc(collection(ctx(TEACHER), 'subscription_requests')),
        request({ middle_name: 'Santos' }),
      ),
    )
  })

  // T-169: the abbreviation register.jsx now sends alongside the request, so
  // it can reach the school record at approval instead of staying stuck in
  // school_directory. Optional — a request filed before this field existed
  // must still be writable without it.
  it('lets the school abbreviation through (T-169)', async () => {
    await assertSucceeds(
      setDoc(
        doc(collection(ctx(TEACHER), 'subscription_requests')),
        request({ school_abbr: 'UCB' }),
      ),
    )
  })

  it('still files a request with no abbreviation at all — a request filed before T-169', async () => {
    await assertSucceeds(
      setDoc(doc(collection(ctx(TEACHER), 'subscription_requests')), request()),
    )
  })

  it('refuses a stray gender key — T-109 dropped the field, so the rule no longer permits it at all', async () => {
    await assertFails(
      setDoc(doc(collection(ctx(TEACHER), 'subscription_requests')), request({ gender: 'female' })),
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
    // OWN_TEACHER and FOREIGN_TEACHER share a school_id: the "School
    // Colleagues" card (hooks/useSchoolColleagues.js) needs same-school
    // teachers to read each other (T-213, audit F-13) -- this fixture's
    // other tests are all about class/roster ownership, which school_id
    // does not touch.
    await setDoc(doc(db, 'users', OWN_TEACHER), { role: 'teacher', first_name: 'T', last_name: 'R', school_id: 'school-1' })
    await setDoc(doc(db, 'users', FOREIGN_TEACHER), { role: 'teacher', first_name: 'F', last_name: 'T', school_id: 'school-1' })
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

  it('teacher profiles stay readable by a same-school teacher (the Your school card)', async () => {
    await assertSucceeds(getDoc(doc(ctx(FOREIGN_TEACHER), 'users', OWN_TEACHER)))
  })

  it('refuses a different-school teacher the same read (T-213, audit F-13)', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'users', FOREIGN_TEACHER), {
        role: 'teacher', first_name: 'F', last_name: 'T', school_id: 'school-9',
      })
    })
    await assertFails(getDoc(doc(ctx(FOREIGN_TEACHER), 'users', OWN_TEACHER)))
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
      // T-203: guardian_codes/guardian_links have no school_id of their own
      // now, so the admin branch is scoped through the student's -- this
      // describe's admin-can-act checks need STUDENT at the admin's school,
      // or sameSchoolAsUser() denies it as a cross-school mismatch.
      await setDoc(doc(db, 'users', STUDENT), { role: 'student', first_name: 'S', last_name: 'T', school_id: 'school-1' })
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

/*
 * announcement_dismissals (T-195, 2026-10-25): a student hiding a read
 * announcement from their own list. Per-student only — proves a student
 * cannot write (or read) another student's dismissal, which is the whole
 * point of the feature: the owner's decision (b) was dismiss, never
 * teacher-visible delete.
 */
describe('announcement_dismissals · a student hides their own, never another\'s', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'announcements', 'ann-1'), {
        teacher_id: TEACHER,
        class_id: 'class-1',
        title: 'Quiz on Monday',
        body: 'Bring a calculator.',
      })
    })
  })

  it('lets a student dismiss an announcement under their own id', async () => {
    await assertSucceeds(
      setDoc(doc(ctx(STUDENT), 'announcement_dismissals', `ann-1_${STUDENT}`), {
        announcement_id: 'ann-1',
        student_id: STUDENT,
        dismissed_at: serverTimestamp(),
      }),
    )
  })

  it('refuses a student writing a dismissal under another student\'s id', async () => {
    await assertFails(
      setDoc(doc(ctx(STUDENT), 'announcement_dismissals', `ann-1_${OTHER_STUDENT}`), {
        announcement_id: 'ann-1',
        student_id: OTHER_STUDENT,
        dismissed_at: serverTimestamp(),
      }),
    )
  })

  it('refuses a dismissal for an announcement that does not exist', async () => {
    await assertFails(
      setDoc(doc(ctx(STUDENT), 'announcement_dismissals', `ghost_${STUDENT}`), {
        announcement_id: 'ghost',
        student_id: STUDENT,
        dismissed_at: serverTimestamp(),
      }),
    )
  })

  it('lets a student read only their own dismissal, never another\'s', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'announcement_dismissals', `ann-1_${STUDENT}`), {
        announcement_id: 'ann-1',
        student_id: STUDENT,
        dismissed_at: serverTimestamp(),
      })
      await setDoc(doc(admin.firestore(), 'announcement_dismissals', `ann-1_${OTHER_STUDENT}`), {
        announcement_id: 'ann-1',
        student_id: OTHER_STUDENT,
        dismissed_at: serverTimestamp(),
      })
    })
    await assertSucceeds(getDoc(doc(ctx(STUDENT), 'announcement_dismissals', `ann-1_${STUDENT}`)))
    await assertFails(getDoc(doc(ctx(STUDENT), 'announcement_dismissals', `ann-1_${OTHER_STUDENT}`)))
  })

  it('refuses a teacher writing a dismissal on a student\'s behalf', async () => {
    await assertFails(
      setDoc(doc(ctx(TEACHER), 'announcement_dismissals', `ann-1_${STUDENT}`), {
        announcement_id: 'ann-1',
        student_id: STUDENT,
        dismissed_at: serverTimestamp(),
      }),
    )
  })

  it('refuses updating or deleting a dismissal once written — there is no undo', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'announcement_dismissals', `ann-1_${STUDENT}`), {
        announcement_id: 'ann-1',
        student_id: STUDENT,
        dismissed_at: serverTimestamp(),
      })
    })
    await assertFails(updateDoc(doc(ctx(STUDENT), 'announcement_dismissals', `ann-1_${STUDENT}`), { student_id: STUDENT }))
    await assertFails(deleteDoc(doc(ctx(STUDENT), 'announcement_dismissals', `ann-1_${STUDENT}`)))
  })
})

/**
 * T-203 (audit F-02): `isAdmin()` is role-only, so an admin of one school
 * satisfied it for every OTHER school's documents across 20 collections --
 * `classes/{classId}` was the clearest case, `allow delete: if isAdmin()`
 * with no scope at all. None of these 20 carry a school_id of their own
 * (unlike users/subscriptions/payments, already scoped before this card),
 * so every admin branch below is now scoped through the uid the document
 * already belongs to -- a class's teacher_id, a submission's student_id --
 * compared against the CALLER's school_id via the lifted
 * sameSchoolAsCaller()/sameSchoolAsUser() helpers.
 *
 * One fixture per collection, owned by the FOREIGN (school-2) side; ADMIN
 * (school-1) is refused every one of them. FOREIGN_ADMIN (school-2) gets one
 * sanity check on `classes` proving a same-school admin still works -- the
 * fix narrows isAdmin(), it must not zero it out.
 */
describe('T-203 — an admin may act only within their own school (audit F-02)', () => {
  const FOREIGN_ADMIN = 'admin-10'
  const FOREIGN_TEACHER = 'teacher-10'
  const FOREIGN_STUDENT = 'student-10'
  const FOREIGN_GUARDIAN = 'guardian-10'
  const FOREIGN_CLASS = 'class-10'

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const db = admin.firestore()
      await setDoc(doc(db, 'users', ADMIN), { role: 'admin', first_name: 'A', last_name: 'D', school_id: 'school-1' })
      await setDoc(doc(db, 'users', TEACHER), { role: 'teacher', first_name: 'T', last_name: 'R', school_id: 'school-1' })
      await setDoc(doc(db, 'users', STUDENT), { role: 'student', first_name: 'S', last_name: 'T', school_id: 'school-1' })
      await setDoc(doc(db, 'users', FOREIGN_ADMIN), { role: 'admin', first_name: 'F', last_name: 'A', school_id: 'school-2' })
      await setDoc(doc(db, 'users', FOREIGN_TEACHER), { role: 'teacher', first_name: 'F', last_name: 'T', school_id: 'school-2' })
      await setDoc(doc(db, 'users', FOREIGN_STUDENT), { role: 'student', first_name: 'F', last_name: 'S', school_id: 'school-2' })

      await setDoc(doc(db, 'classes', FOREIGN_CLASS), {
        teacher_id: FOREIGN_TEACHER, subject: 'Math', student_ids: [FOREIGN_STUDENT],
      })
      await setDoc(doc(db, 'gradebooks', FOREIGN_CLASS), { teacher_id: FOREIGN_TEACHER, grading_mode: 'deped_k12' })
      await setDoc(doc(db, 'gradebooks', FOREIGN_CLASS, 'entries', FOREIGN_STUDENT), {
        student_id: FOREIGN_STUDENT, final_grade: 90,
      })
      await setDoc(doc(db, 'announcements', 'ann-foreign'), {
        teacher_id: FOREIGN_TEACHER, class_id: FOREIGN_CLASS, title: 'x', body: 'y',
      })
      await setDoc(doc(db, 'announcement_dismissals', `ann-foreign_${FOREIGN_STUDENT}`), {
        announcement_id: 'ann-foreign', student_id: FOREIGN_STUDENT,
      })
      await setDoc(doc(db, 'quizzes', 'quiz-foreign'), {
        teacher_id: FOREIGN_TEACHER, class_id: FOREIGN_CLASS, title: 'Quiz',
      })
      await setDoc(doc(db, 'banked_questions', 'bq-foreign'), { teacher_id: FOREIGN_TEACHER, question_text: 'x' })
      await setDoc(doc(db, 'syllabi', 'syl-foreign'), { teacher_id: FOREIGN_TEACHER, class_id: FOREIGN_CLASS })
      await setDoc(doc(db, 'class_tasks', 'task-foreign'), {
        teacher_id: FOREIGN_TEACHER, class_id: FOREIGN_CLASS, status: 'draft',
      })
      await setDoc(doc(db, 'task_submissions', 'sub-foreign'), {
        task_id: 'task-foreign', class_id: FOREIGN_CLASS, student_id: FOREIGN_STUDENT,
      })
      await setDoc(doc(db, 'quiz_attempts', 'attempt-foreign'), {
        quiz_id: 'quiz-foreign', class_id: FOREIGN_CLASS, student_id: FOREIGN_STUDENT,
        status: 'in_progress', started_at: new Date('2026-04-10T09:00:00Z'),
      })
      await setDoc(doc(db, 'remediations', 'rem-foreign'), { student_id: FOREIGN_STUDENT, class_id: FOREIGN_CLASS })
      await setDoc(doc(db, 'attendance_summaries', `${FOREIGN_CLASS}_${FOREIGN_STUDENT}`), {
        class_id: FOREIGN_CLASS, student_id: FOREIGN_STUDENT,
      })
      await setDoc(doc(db, 'student_performance', 'perf-foreign'), {
        class_id: FOREIGN_CLASS, student_id: FOREIGN_STUDENT,
      })
      await setDoc(doc(db, 'guardian_codes', 'FGN123'), {
        student_uid: FOREIGN_STUDENT, is_minor: false,
        default_scopes: {
          can_view_grades: false, can_view_quiz_scores: false,
          can_view_attendance: false, can_view_analytics: false,
        },
      })
      await setDoc(doc(db, 'guardian_links', `${FOREIGN_STUDENT}_${FOREIGN_GUARDIAN}`), {
        student_uid: FOREIGN_STUDENT, guardian_uid: FOREIGN_GUARDIAN, status: 'pending', is_minor: false,
        scopes: {
          can_view_grades: false, can_view_quiz_scores: false,
          can_view_attendance: false, can_view_analytics: false,
        },
      })
      await setDoc(doc(db, 'consent_records', FOREIGN_STUDENT), {
        student_id: FOREIGN_STUDENT, parent_id: FOREIGN_GUARDIAN, is_minor: false, status: 'approved',
      })
      await setDoc(doc(db, 'attendance_contests', 'ac-foreign'), {
        student_id: FOREIGN_STUDENT, class_id: FOREIGN_CLASS, status: 'pending',
      })
      await setDoc(doc(db, 'grade_contests', 'gc-foreign'), {
        student_id: FOREIGN_STUDENT, class_id: FOREIGN_CLASS, status: 'pending',
      })
      await setDoc(doc(db, 'notifications', 'notif-foreign'), {
        user_id: FOREIGN_STUDENT, class_id: FOREIGN_CLASS, created_by: FOREIGN_TEACHER, read: false,
      })
    })
  })

  it('refuses a foreign-school admin deleting a class', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'classes', FOREIGN_CLASS)))
  })

  it('lets the class\'s own-school admin delete it', async () => {
    await assertSucceeds(deleteDoc(doc(ctx(FOREIGN_ADMIN), 'classes', FOREIGN_CLASS)))
  })

  it('refuses a foreign-school admin deleting a gradebook', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'gradebooks', FOREIGN_CLASS)))
  })

  it('refuses a foreign-school admin reading a gradebook entry', async () => {
    await assertFails(getDoc(doc(ctx(ADMIN), 'gradebooks', FOREIGN_CLASS, 'entries', FOREIGN_STUDENT)))
  })

  it('refuses a foreign-school admin deleting an announcement', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'announcements', 'ann-foreign')))
  })

  it('refuses a foreign-school admin reading an announcement dismissal', async () => {
    await assertFails(getDoc(doc(ctx(ADMIN), 'announcement_dismissals', `ann-foreign_${FOREIGN_STUDENT}`)))
  })

  it('refuses a foreign-school admin deleting a quiz', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'quizzes', 'quiz-foreign')))
  })

  it('refuses a foreign-school admin reading a banked question', async () => {
    await assertFails(getDoc(doc(ctx(ADMIN), 'banked_questions', 'bq-foreign')))
  })

  it('refuses a foreign-school admin deleting a syllabus', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'syllabi', 'syl-foreign')))
  })

  it('refuses a foreign-school admin deleting a class task', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'class_tasks', 'task-foreign')))
  })

  it('refuses a foreign-school admin deleting a task submission', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'task_submissions', 'sub-foreign')))
  })

  it('refuses a foreign-school admin deleting a quiz attempt', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'quiz_attempts', 'attempt-foreign')))
  })

  it('refuses a foreign-school admin deleting a remediation', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'remediations', 'rem-foreign')))
  })

  it('refuses a foreign-school admin deleting an attendance summary', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'attendance_summaries', `${FOREIGN_CLASS}_${FOREIGN_STUDENT}`)))
  })

  it('refuses a foreign-school admin deleting a student_performance snapshot', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'student_performance', 'perf-foreign')))
  })

  it('refuses a foreign-school admin deleting a guardian code', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'guardian_codes', 'FGN123')))
  })

  it('refuses a foreign-school admin deleting a guardian link', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'guardian_links', `${FOREIGN_STUDENT}_${FOREIGN_GUARDIAN}`)))
  })

  it('refuses a foreign-school admin deleting a consent record', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'consent_records', FOREIGN_STUDENT)))
  })

  it('refuses a foreign-school admin deleting an attendance contest', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'attendance_contests', 'ac-foreign')))
  })

  it('refuses a foreign-school admin deleting a grade contest', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'grade_contests', 'gc-foreign')))
  })

  it('refuses a foreign-school admin deleting a notification', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'notifications', 'notif-foreign')))
  })
})

/**
 * T-213 (audit F-13): three reads with no relationship check at all.
 * `/users/{uid}`'s teacher-profile clause was bare `resource.data.role ==
 * 'teacher'`; `/syllabi` and `/announcements` were bare `signedIn()`. Any
 * signed-in account, any school, any role, could read any teacher's full
 * profile (including email), any syllabus, any announcement (free text that
 * routinely names students).
 *
 * Fix scopes each to: a student actually taught by that teacher (via the
 * student's own teacher_ids -- NOT a school_id compare, since a solo
 * teacher and their self-enrolled students have no school_id at all and
 * that compare would have denied the single most common account shape on
 * the platform), the owning teacher, and a same-school admin.
 * `announcements` additionally still allows isParent() -- a documented,
 * deliberate known-breadth gap (see the comment above the rule): there is
 * no student_id on that document to scope a guardian against.
 */
describe('T-213 — teacher profiles, syllabi and announcements are scoped to who actually needs them (audit F-13)', () => {
  const OTHER_TEACHER = 'teacher-20'
  const SAME_SCHOOL_ADMIN = 'admin-20'
  const FOREIGN_SCHOOL_ADMIN = 'admin-21'
  const PARENT = 'guardian-20'
  const UNRELATED_STUDENT = 'student-20'

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const db = admin.firestore()
      // seedRoles() already gives STUDENT (and OTHER_STUDENT) teacher_ids:
      // [TEACHER] -- the "this really is my teacher" case this fix must
      // keep working. OTHER_TEACHER is a stranger: nobody's teacher_ids
      // names them. UNRELATED_STUDENT is taught by OTHER_TEACHER only, so
      // TEACHER's documents are a stranger's to them too.
      await setDoc(doc(db, 'users', OTHER_TEACHER), { role: 'teacher', first_name: 'O', last_name: 'T' })
      await setDoc(doc(db, 'users', UNRELATED_STUDENT), { role: 'student', first_name: 'U', last_name: 'S', teacher_ids: [OTHER_TEACHER] })
      await setDoc(doc(db, 'users', TEACHER), { role: 'teacher', first_name: 'T', last_name: 'R', school_id: 'school-1' })
      await setDoc(doc(db, 'users', SAME_SCHOOL_ADMIN), { role: 'admin', first_name: 'S', last_name: 'A', school_id: 'school-1' })
      await setDoc(doc(db, 'users', FOREIGN_SCHOOL_ADMIN), { role: 'admin', first_name: 'F', last_name: 'A', school_id: 'school-9' })
      await setDoc(doc(db, 'users', PARENT), { role: 'parent', first_name: 'P', last_name: 'G' })
      await setDoc(doc(db, 'syllabi', 'syl-mine'), { teacher_id: TEACHER, title: 'Algebra' })
      await setDoc(doc(db, 'syllabi', 'syl-stranger'), { teacher_id: OTHER_TEACHER, title: 'Chemistry' })
      await setDoc(doc(db, 'announcements', 'ann-mine'), {
        teacher_id: TEACHER, class_id: 'class-1', title: 'Quiz Friday', body: 'Bring a calculator.',
      })
    })
  })

  it('lets a student read the profile of their own teacher', async () => {
    await assertSucceeds(getDoc(doc(ctx(STUDENT), 'users', TEACHER)))
  })

  it('refuses a student reading the profile of a teacher who does not teach them', async () => {
    await assertFails(getDoc(doc(ctx(STUDENT), 'users', OTHER_TEACHER)))
  })

  it('refuses one teacher reading a colleague\'s profile with no relationship at all', async () => {
    await assertFails(getDoc(doc(ctx(OTHER_TEACHER), 'users', TEACHER)))
  })

  it('lets a student read the syllabus of the teacher who actually teaches them', async () => {
    await assertSucceeds(getDoc(doc(ctx(STUDENT), 'syllabi', 'syl-mine')))
  })

  it('refuses a student reading a syllabus from a teacher who does not teach them', async () => {
    await assertFails(getDoc(doc(ctx(STUDENT), 'syllabi', 'syl-stranger')))
  })

  it('lets the owning teacher read their own syllabus', async () => {
    await assertSucceeds(getDoc(doc(ctx(TEACHER), 'syllabi', 'syl-mine')))
  })

  it('lets a same-school admin read a syllabus', async () => {
    await assertSucceeds(getDoc(doc(ctx(SAME_SCHOOL_ADMIN), 'syllabi', 'syl-mine')))
  })

  it('refuses a different-school admin reading a syllabus', async () => {
    await assertFails(getDoc(doc(ctx(FOREIGN_SCHOOL_ADMIN), 'syllabi', 'syl-mine')))
  })

  it('lets a student read an announcement from the teacher who actually teaches them', async () => {
    await assertSucceeds(getDoc(doc(ctx(STUDENT), 'announcements', 'ann-mine')))
  })

  it('refuses a student reading an announcement from a teacher who does not teach them', async () => {
    await assertFails(getDoc(doc(ctx(UNRELATED_STUDENT), 'announcements', 'ann-mine')))
  })

  it('refuses an unrelated teacher reading another teacher\'s announcement', async () => {
    await assertFails(getDoc(doc(ctx(OTHER_TEACHER), 'announcements', 'ann-mine')))
  })

  it('lets the owning teacher read their own announcement', async () => {
    await assertSucceeds(getDoc(doc(ctx(TEACHER), 'announcements', 'ann-mine')))
  })

  it('lets a same-school admin read an announcement', async () => {
    await assertSucceeds(getDoc(doc(ctx(SAME_SCHOOL_ADMIN), 'announcements', 'ann-mine')))
  })

  it('refuses a different-school admin reading an announcement', async () => {
    await assertFails(getDoc(doc(ctx(FOREIGN_SCHOOL_ADMIN), 'announcements', 'ann-mine')))
  })

  it('still lets a parent read an announcement (documented known breadth, not scoped by this card)', async () => {
    await assertSucceeds(getDoc(doc(ctx(PARENT), 'announcements', 'ann-mine')))
  })
})

/**
 * T-218 (audit F-14, verified 2026-10-29) — "verify first" ticket. The
 * audit claimed teacher access to guardian_links might be school-wide and
 * guardian_codes deletion might not be scoped to the right owner/role.
 *
 * What was actually true: a comment above guardian_codes' delete rule
 * (and, by its own cross-reference, guardian_links' read rule) said
 * "KNOWN BREADTH: isTeacher() is unscoped" -- accurate on 2026-08-21
 * (f275eee) when that really was the code, but stale after 2026-08-31
 * (87cad2f, "a teacher reads only the students they handle") replaced
 * every bare isTeacher() in both blocks with handlesStudent() -- scoped
 * to a teacher who actually has this student in a class via
 * users.teacher_ids. Grepping the live rule text for `isTeacher()` inside
 * either match block today finds zero calls outside handlesStudent()'s
 * own definition. The audit likely read the stale comment, not the code
 * -- which is exactly why an undocumented-but-also-un-updated note is
 * worse than no note.
 *
 * No rule changed here (firestore.rules only got the comment corrected).
 * These tests pin the access matrix the corrected comment now describes,
 * so a future change that reintroduces a bare isTeacher() fails loudly
 * instead of drifting silently again.
 */
describe('T-218 — guardian_codes delete and guardian_links read/update/delete scope to the HANDLING teacher, not any teacher (audit F-14)', () => {
  const HANDLING_TEACHER = 'teacher-30'
  const OTHER_TEACHER = 'teacher-31'
  const GUARDIAN_STUDENT = 'student-30'
  const GUARDIAN_UID = 'guardian-30'

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const db = admin.firestore()
      await setDoc(doc(db, 'users', HANDLING_TEACHER), { role: 'teacher', first_name: 'H', last_name: 'T' })
      await setDoc(doc(db, 'users', OTHER_TEACHER), { role: 'teacher', first_name: 'O', last_name: 'T' })
      // teacher_ids is what handlesStudent() actually reads -- HANDLING_TEACHER
      // is really this student's teacher; OTHER_TEACHER is a stranger.
      await setDoc(doc(db, 'users', GUARDIAN_STUDENT), {
        role: 'student', first_name: 'G', last_name: 'S', teacher_ids: [HANDLING_TEACHER],
      })
      await setDoc(doc(db, 'guardian_codes', 'GRD030'), {
        student_uid: GUARDIAN_STUDENT, is_minor: false,
        default_scopes: { can_view_grades: false, can_view_quiz_scores: false, can_view_attendance: false, can_view_analytics: false },
      })
      await setDoc(doc(db, 'guardian_links', `${GUARDIAN_STUDENT}_${GUARDIAN_UID}`), {
        student_uid: GUARDIAN_STUDENT, guardian_uid: GUARDIAN_UID, status: 'approved', is_minor: false,
        scopes: { can_view_grades: true, can_view_quiz_scores: true, can_view_attendance: true, can_view_analytics: true },
      })
    })
  })

  it('lets the handling teacher delete the student\'s guardian code', async () => {
    await assertSucceeds(deleteDoc(doc(ctx(HANDLING_TEACHER), 'guardian_codes', 'GRD030')))
  })

  it('refuses a teacher who does not handle this student deleting their guardian code', async () => {
    await assertFails(deleteDoc(doc(ctx(OTHER_TEACHER), 'guardian_codes', 'GRD030')))
  })

  it('lets the handling teacher read the student\'s guardian link', async () => {
    await assertSucceeds(getDoc(doc(ctx(HANDLING_TEACHER), 'guardian_links', `${GUARDIAN_STUDENT}_${GUARDIAN_UID}`)))
  })

  it('refuses a teacher who does not handle this student reading their guardian link', async () => {
    await assertFails(getDoc(doc(ctx(OTHER_TEACHER), 'guardian_links', `${GUARDIAN_STUDENT}_${GUARDIAN_UID}`)))
  })

  it('lets the handling teacher revoke a guardian on the student\'s behalf', async () => {
    await assertSucceeds(deleteDoc(doc(ctx(HANDLING_TEACHER), 'guardian_links', `${GUARDIAN_STUDENT}_${GUARDIAN_UID}`)))
  })

  it('refuses a teacher who does not handle this student revoking their guardian', async () => {
    await assertFails(deleteDoc(doc(ctx(OTHER_TEACHER), 'guardian_links', `${GUARDIAN_STUDENT}_${GUARDIAN_UID}`)))
  })

  it('refuses an unrelated teacher updating the student\'s guardian link scopes', async () => {
    await assertFails(
      updateDoc(doc(ctx(OTHER_TEACHER), 'guardian_links', `${GUARDIAN_STUDENT}_${GUARDIAN_UID}`), {
        scopes: { can_view_grades: false, can_view_quiz_scores: false, can_view_attendance: false, can_view_analytics: false },
      }),
    )
  })
})

describe('grading_templates · client access is closed to all roles (Flask Admin SDK only)', () => {
  it('refuses an unauthenticated client reading or writing a template', async () => {
    const unauth = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(unauth, 'grading_templates', 'tpl-1')))
    await assertFails(setDoc(doc(unauth, 'grading_templates', 'tpl-1'), { name: 'Hack' }))
  })

  it('refuses a teacher reading, writing, updating, or deleting a template directly via Firestore client', async () => {
    await assertFails(getDoc(doc(ctx(TEACHER), 'grading_templates', 'tpl-1')))
    await assertFails(setDoc(doc(ctx(TEACHER), 'grading_templates', 'tpl-1'), { name: 'Direct' }))
    await assertFails(updateDoc(doc(ctx(TEACHER), 'grading_templates', 'tpl-1'), { name: 'Direct' }))
    await assertFails(deleteDoc(doc(ctx(TEACHER), 'grading_templates', 'tpl-1')))
  })

  it('refuses an admin reading or writing a template directly via Firestore client', async () => {
    await assertFails(getDoc(doc(ctx(ADMIN), 'grading_templates', 'tpl-1')))
    await assertFails(setDoc(doc(ctx(ADMIN), 'grading_templates', 'tpl-1'), { name: 'AdminDirect' }))
  })

  it('refuses a student reading or writing a template directly via Firestore client', async () => {
    await assertFails(getDoc(doc(ctx(STUDENT), 'grading_templates', 'tpl-1')))
    await assertFails(setDoc(doc(ctx(STUDENT), 'grading_templates', 'tpl-1'), { name: 'StudentDirect' }))
  })
})
