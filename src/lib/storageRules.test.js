/**
 * Security-rule tests for Cloud Storage, run against the real rules engine.
 *
 * These do not run with `npm run test` — they need the Firestore AND Storage
 * emulators (the storage rules cross-reference Firestore via `firestore.get()`
 * for ownership), so they live behind `npm run test:rules:storage`, which
 * starts both. Everything else in this directory is pure and needs nothing.
 *
 * Why they exist: a code audit (2026-10-29, F-07/F-10/F-11/F-12) found that
 * several paths in storage.rules were far more open than the app intends —
 * one readable with no auth at all, several readable or deletable by any
 * signed-in user regardless of whose file it is. Reading the rule and
 * agreeing it looks right is not evidence; running it is.
 *
 * The rules file is read from activklass-backend, which is the deployed
 * source of truth. If it moves, this fails loudly rather than silently
 * testing nothing.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'

const RULES_PATH = fileURLToPath(
  new URL('../../../activklass-backend/storage.rules', import.meta.url),
)

const STUDENT = 'student-1'
const OTHER_STUDENT = 'student-2'
const TEACHER = 'teacher-1'
const OTHER_TEACHER = 'teacher-2'
const ADMIN = 'admin-1'

const BYTES = new Uint8Array([1, 2, 3])

let testEnv

/** A signed-in context's Storage client for the given uid. */
function storageCtx(uid) {
  return testEnv.authenticatedContext(uid).storage()
}

function anonStorage() {
  return testEnv.unauthenticatedContext().storage()
}

/**
 * Seed the Firestore documents the storage rules read via `firestore.get()`.
 * Written past Firestore's own rules (irrelevant here — this suite tests
 * storage.rules, not firestore.rules).
 */
async function seedFirestore() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', TEACHER), { role: 'teacher' })
    await setDoc(doc(db, 'users', OTHER_TEACHER), { role: 'teacher' })
    await setDoc(doc(db, 'users', ADMIN), { role: 'admin' })
    await setDoc(doc(db, 'users', STUDENT), { role: 'student' })
    await setDoc(doc(db, 'users', OTHER_STUDENT), { role: 'student' })
    await setDoc(doc(db, 'classes', 'class-1'), {
      teacher_id: TEACHER,
      student_ids: [STUDENT],
    })
    await setDoc(doc(db, 'syllabi', 'syl-1'), { teacher_id: TEACHER })
  })
}

/** Write a file straight into the emulator, bypassing storage.rules. */
async function seedFile(path, bytes = BYTES) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), bytes)
  })
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'activklass-rules-test',
    firestore: { host: '127.0.0.1', port: 8080 },
    storage: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.clearStorage()
  await seedFirestore()
})

/*
 * T-204 / audit F-07: /learning_materials/{syllabusId}/{fileName} had
 * `allow read: if true` — readable by anyone on the internet, no auth at
 * all. Fixed to `signedIn()`, matching the rest of the file's convention
 * (syllabus attachments are already "any signed-in user may read" by
 * documented design) and the Firestore `syllabi` collection's own read rule.
 */
describe('learning_materials · read (T-204)', () => {
  it('refuses a read with no auth at all', async () => {
    await seedFile('learning_materials/syl-1/handout.pdf')
    await assertFails(
      getBytes(ref(anonStorage(), 'learning_materials/syl-1/handout.pdf')),
    )
  })

  it('allows any signed-in user to read', async () => {
    await seedFile('learning_materials/syl-1/handout.pdf')
    await assertSucceeds(
      getBytes(ref(storageCtx(OTHER_TEACHER), 'learning_materials/syl-1/handout.pdf')),
    )
  })
})

/*
 * T-205 / audit F-10: /excuse_letters/{classId}/{studentId}/{fileName} and
 * /contest_files/{classId}/{studentId}/{fileName} both had
 * `allow read: if signedIn()` — any signed-in user, including any student at
 * any school, could read another student's excuse letter or contest
 * attachment (which can hold a medical document). Scoped to: the owning
 * student, the class's teacher, or an admin.
 */
describe('excuse_letters · read (T-205)', () => {
  it("refuses another student reading this student's excuse letter", async () => {
    await seedFile('excuse_letters/class-1/student-1/2026-10-29.pdf')
    await assertFails(
      getBytes(ref(storageCtx(OTHER_STUDENT), 'excuse_letters/class-1/student-1/2026-10-29.pdf')),
    )
  })

  it('refuses a teacher who does not teach this class', async () => {
    await seedFile('excuse_letters/class-1/student-1/2026-10-29.pdf')
    await assertFails(
      getBytes(ref(storageCtx(OTHER_TEACHER), 'excuse_letters/class-1/student-1/2026-10-29.pdf')),
    )
  })

  it('allows the owning student to read their own excuse letter', async () => {
    await seedFile('excuse_letters/class-1/student-1/2026-10-29.pdf')
    await assertSucceeds(
      getBytes(ref(storageCtx(STUDENT), 'excuse_letters/class-1/student-1/2026-10-29.pdf')),
    )
  })

  it("allows the class's own teacher to read it", async () => {
    await seedFile('excuse_letters/class-1/student-1/2026-10-29.pdf')
    await assertSucceeds(
      getBytes(ref(storageCtx(TEACHER), 'excuse_letters/class-1/student-1/2026-10-29.pdf')),
    )
  })

  it('allows an admin to read it', async () => {
    await seedFile('excuse_letters/class-1/student-1/2026-10-29.pdf')
    await assertSucceeds(
      getBytes(ref(storageCtx(ADMIN), 'excuse_letters/class-1/student-1/2026-10-29.pdf')),
    )
  })
})

describe('contest_files · read (T-205)', () => {
  it("refuses another student reading this student's contest attachment", async () => {
    await seedFile('contest_files/class-1/student-1/assessment-1.pdf')
    await assertFails(
      getBytes(ref(storageCtx(OTHER_STUDENT), 'contest_files/class-1/student-1/assessment-1.pdf')),
    )
  })

  it('allows the owning student to read their own contest attachment', async () => {
    await seedFile('contest_files/class-1/student-1/assessment-1.pdf')
    await assertSucceeds(
      getBytes(ref(storageCtx(STUDENT), 'contest_files/class-1/student-1/assessment-1.pdf')),
    )
  })

  it("allows the class's own teacher to read it", async () => {
    await seedFile('contest_files/class-1/student-1/assessment-1.pdf')
    await assertSucceeds(
      getBytes(ref(storageCtx(TEACHER), 'contest_files/class-1/student-1/assessment-1.pdf')),
    )
  })
})
