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
    await setDoc(doc(db, 'class_tasks', 'task-1'), {
      class_id: 'class-1',
      teacher_id: TEACHER,
      status: 'published',
    })
    await setDoc(doc(db, 'class_tasks', 'task-draft'), {
      class_id: 'class-1',
      teacher_id: TEACHER,
      status: 'draft',
    })
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

/*
 * T-206 / audit F-12: /task_files/{classId}/{taskId}/submissions/{studentId}/
 * {fileName} had `allow read: if signedIn()` -- any signed-in user could
 * read any student's hand-in, wider than the Firestore task_submissions
 * read rule for the same document. Scoped to: the owning student, the
 * class's teacher, or an admin -- the same pattern as T-205.
 *
 * Unflagged by the audit but the same mistake one level up:
 * /task_files/{classId}/{taskId}/{fileName} (the teacher's hand-outs) was
 * also `if signedIn()`. Scoped to mirror the Firestore class_tasks read
 * rule instead: the class's teacher, an admin, or an enrolled student once
 * the task is published.
 */
describe('task_files · submission read (T-206)', () => {
  it("refuses another student reading this student's hand-in", async () => {
    await seedFile('task_files/class-1/task-1/submissions/student-1/essay.pdf')
    await assertFails(
      getBytes(ref(storageCtx(OTHER_STUDENT), 'task_files/class-1/task-1/submissions/student-1/essay.pdf')),
    )
  })

  it('refuses a teacher who does not teach this class', async () => {
    await seedFile('task_files/class-1/task-1/submissions/student-1/essay.pdf')
    await assertFails(
      getBytes(ref(storageCtx(OTHER_TEACHER), 'task_files/class-1/task-1/submissions/student-1/essay.pdf')),
    )
  })

  it('allows the owning student to read their own hand-in', async () => {
    await seedFile('task_files/class-1/task-1/submissions/student-1/essay.pdf')
    await assertSucceeds(
      getBytes(ref(storageCtx(STUDENT), 'task_files/class-1/task-1/submissions/student-1/essay.pdf')),
    )
  })

  it("allows the class's own teacher to read it", async () => {
    await seedFile('task_files/class-1/task-1/submissions/student-1/essay.pdf')
    await assertSucceeds(
      getBytes(ref(storageCtx(TEACHER), 'task_files/class-1/task-1/submissions/student-1/essay.pdf')),
    )
  })

  it('allows an admin to read it', async () => {
    await seedFile('task_files/class-1/task-1/submissions/student-1/essay.pdf')
    await assertSucceeds(
      getBytes(ref(storageCtx(ADMIN), 'task_files/class-1/task-1/submissions/student-1/essay.pdf')),
    )
  })
})

describe('task_files · hand-out read (T-206, the sibling at :53)', () => {
  it('refuses a student not enrolled in the class', async () => {
    await seedFile('task_files/class-1/task-1/worksheet.pdf')
    await assertFails(
      getBytes(ref(storageCtx(OTHER_STUDENT), 'task_files/class-1/task-1/worksheet.pdf')),
    )
  })

  it('refuses an enrolled student while the task is still a draft', async () => {
    await seedFile('task_files/class-1/task-draft/worksheet.pdf')
    await assertFails(
      getBytes(ref(storageCtx(STUDENT), 'task_files/class-1/task-draft/worksheet.pdf')),
    )
  })

  it('allows an enrolled student to read it once the task is published', async () => {
    await seedFile('task_files/class-1/task-1/worksheet.pdf')
    await assertSucceeds(
      getBytes(ref(storageCtx(STUDENT), 'task_files/class-1/task-1/worksheet.pdf')),
    )
  })

  it("allows the class's own teacher to read it even in draft", async () => {
    await seedFile('task_files/class-1/task-draft/worksheet.pdf')
    await assertSucceeds(
      getBytes(ref(storageCtx(TEACHER), 'task_files/class-1/task-draft/worksheet.pdf')),
    )
  })

  it('allows an admin to read it', async () => {
    await seedFile('task_files/class-1/task-1/worksheet.pdf')
    await assertSucceeds(
      getBytes(ref(storageCtx(ADMIN), 'task_files/class-1/task-1/worksheet.pdf')),
    )
  })
})

/*
 * T-207 / audit F-11: /syllabi/{classId}/{fileName} and
 * /learning_materials/{syllabusId}/{fileName} both had
 * `allow delete: if signedIn()` -- any signed-in user, at any school, could
 * delete any teacher's syllabus attachment or learning material. Gated on
 * the owning teacher (the class's teacher for /syllabi/, the syllabus
 * document's teacher_id for /learning_materials/) or an admin, reusing the
 * ownsClass() and isAdmin() helpers T-205/T-206 already established.
 */
describe('syllabi · delete (T-207)', () => {
  it('refuses a teacher who does not own the class', async () => {
    await seedFile('syllabi/class-1/outline.pdf')
    await assertFails(
      deleteObject(ref(storageCtx(OTHER_TEACHER), 'syllabi/class-1/outline.pdf')),
    )
  })

  it("refuses a student, even the class's own", async () => {
    await seedFile('syllabi/class-1/outline.pdf')
    await assertFails(
      deleteObject(ref(storageCtx(STUDENT), 'syllabi/class-1/outline.pdf')),
    )
  })

  it("allows the class's own teacher to delete it", async () => {
    await seedFile('syllabi/class-1/outline.pdf')
    await assertSucceeds(
      deleteObject(ref(storageCtx(TEACHER), 'syllabi/class-1/outline.pdf')),
    )
  })

  it('allows an admin to delete it', async () => {
    await seedFile('syllabi/class-1/outline.pdf')
    await assertSucceeds(
      deleteObject(ref(storageCtx(ADMIN), 'syllabi/class-1/outline.pdf')),
    )
  })
})

describe('learning_materials · delete (T-207)', () => {
  it('refuses a teacher who does not own the syllabus', async () => {
    await seedFile('learning_materials/syl-1/handout.pdf')
    await assertFails(
      deleteObject(ref(storageCtx(OTHER_TEACHER), 'learning_materials/syl-1/handout.pdf')),
    )
  })

  it('allows the owning teacher to delete it', async () => {
    await seedFile('learning_materials/syl-1/handout.pdf')
    await assertSucceeds(
      deleteObject(ref(storageCtx(TEACHER), 'learning_materials/syl-1/handout.pdf')),
    )
  })

  it('allows an admin to delete it', async () => {
    await seedFile('learning_materials/syl-1/handout.pdf')
    await assertSucceeds(
      deleteObject(ref(storageCtx(ADMIN), 'learning_materials/syl-1/handout.pdf')),
    )
  })
})

/**
 * Syllabus-attachment and learning-material WRITE (2026-10-31 audit).
 *
 * Both paths previously allowed any signed-in user to upload and to OVERWRITE:
 *
 *   /syllabi/{classId}/{fileName}            write: signedIn() && isAllowedDoc()
 *   /learning_materials/{syllabusId}/{file}  write: signedIn() && size < 25MB
 *
 * The earlier passes on these same two paths closed READ (T-204) and DELETE
 * (T-207) and left write open, so a student -- or a teacher at another school
 * -- could replace any class's syllabus PDF or any syllabus's learning
 * material with their own file. The file path is predictable, and nothing in
 * Firestore has to be touched to do it, so the "ownership is enforced where
 * the reference is written" argument in the old header did not hold.
 *
 * The learning-material rule deliberately does NOT require the syllabus to
 * exist: `SyllabusEditor` writes `syllabi/{id}` only on save while the upload
 * happens when the file is picked, so a must-exist rule would break every
 * new-syllabus upload. That workflow is pinned below as a positive test, so
 * tightening this later cannot silently break it.
 */
const PDF = { contentType: 'application/pdf' }
const HTML = { contentType: 'text/html' }
const SVG = { contentType: 'image/svg+xml' }

describe('syllabi · write — only the class teacher or an admin', () => {
  beforeEach(seedFirestore)

  it('denies an unauthenticated upload', async () => {
    await assertFails(
      uploadBytes(ref(anonStorage(), 'syllabi/class-1/plan.pdf'), BYTES, PDF),
    )
  })

  it('denies a student uploading into their own class', async () => {
    await assertFails(
      uploadBytes(ref(storageCtx(STUDENT), 'syllabi/class-1/plan.pdf'), BYTES, PDF),
    )
  })

  it('denies a teacher who does not own the class', async () => {
    await assertFails(
      uploadBytes(ref(storageCtx(OTHER_TEACHER), 'syllabi/class-1/plan.pdf'), BYTES, PDF),
    )
  })

  it('denies a foreign teacher OVERWRITING an existing attachment', async () => {
    await seedFile('syllabi/class-1/plan.pdf')
    await assertFails(
      uploadBytes(ref(storageCtx(OTHER_TEACHER), 'syllabi/class-1/plan.pdf'), BYTES, PDF),
    )
  })

  it('denies an upload to a class that does not exist', async () => {
    await assertFails(
      uploadBytes(ref(storageCtx(TEACHER), 'syllabi/no-such-class/plan.pdf'), BYTES, PDF),
    )
  })

  it('denies a disallowed content type even from the owner', async () => {
    await assertFails(
      uploadBytes(ref(storageCtx(TEACHER), 'syllabi/class-1/evil.html'), BYTES, HTML),
    )
  })

  it('denies an oversized file even from the owner', async () => {
    // The cap on this path is 10 MB.
    await assertFails(
      uploadBytes(ref(storageCtx(TEACHER), 'syllabi/class-1/big.pdf'),
        new Uint8Array(11 * 1024 * 1024), PDF),
    )
  })

  it('allows the owning teacher to upload', async () => {
    await assertSucceeds(
      uploadBytes(ref(storageCtx(TEACHER), 'syllabi/class-1/plan.pdf'), BYTES, PDF),
    )
  })

  it('allows the owning teacher to overwrite their own attachment', async () => {
    await seedFile('syllabi/class-1/plan.pdf')
    await assertSucceeds(
      uploadBytes(ref(storageCtx(TEACHER), 'syllabi/class-1/plan.pdf'), BYTES, PDF),
    )
  })

  it('allows an admin to upload', async () => {
    await assertSucceeds(
      uploadBytes(ref(storageCtx(ADMIN), 'syllabi/class-1/plan.pdf'), BYTES, PDF),
    )
  })
})

describe('learning_materials · write — only the syllabus owner or an admin', () => {
  beforeEach(seedFirestore)

  it('denies an unauthenticated upload', async () => {
    await assertFails(
      uploadBytes(ref(anonStorage(), 'learning_materials/syl-1/handout.pdf'), BYTES, PDF),
    )
  })

  it('denies a student uploading to an existing syllabus', async () => {
    await assertFails(
      uploadBytes(ref(storageCtx(STUDENT), 'learning_materials/syl-1/handout.pdf'), BYTES, PDF),
    )
  })

  it('denies a student uploading to an UNSAVED syllabus id too', async () => {
    // The new-syllabus allowance is for teachers only; it must not become a
    // hole a student can walk through by inventing an id.
    await assertFails(
      uploadBytes(ref(storageCtx(STUDENT), 'learning_materials/syl-unsaved/handout.pdf'), BYTES, PDF),
    )
  })

  it('denies a foreign teacher OVERWRITING another teacher’s material', async () => {
    await seedFile('learning_materials/syl-1/handout.pdf')
    await assertFails(
      uploadBytes(ref(storageCtx(OTHER_TEACHER), 'learning_materials/syl-1/handout.pdf'), BYTES, PDF),
    )
  })

  it('denies text/html — the stored-XSS shape', async () => {
    await assertFails(
      uploadBytes(ref(storageCtx(TEACHER), 'learning_materials/syl-1/evil.html'), BYTES, HTML),
    )
  })

  it('denies image/svg+xml for the same reason', async () => {
    await assertFails(
      uploadBytes(ref(storageCtx(TEACHER), 'learning_materials/syl-1/evil.svg'), BYTES, SVG),
    )
  })

  it('allows the owning teacher to upload to their saved syllabus', async () => {
    await assertSucceeds(
      uploadBytes(ref(storageCtx(TEACHER), 'learning_materials/syl-1/handout.pdf'), BYTES, PDF),
    )
  })

  it('allows a teacher to upload to a syllabus that is not saved yet', async () => {
    // The workflow guard: SyllabusEditor uploads before the first save.
    await assertSucceeds(
      uploadBytes(ref(storageCtx(TEACHER), 'learning_materials/syl-unsaved/handout.pdf'), BYTES, PDF),
    )
  })

  it('allows an admin to upload', async () => {
    await assertSucceeds(
      uploadBytes(ref(storageCtx(ADMIN), 'learning_materials/syl-1/handout.pdf'), BYTES, PDF),
    )
  })

  it('still denies an unauthorized delete (unchanged by this pass)', async () => {
    await seedFile('learning_materials/syl-1/handout.pdf')
    await assertFails(
      deleteObject(ref(storageCtx(OTHER_TEACHER), 'learning_materials/syl-1/handout.pdf')),
    )
  })
})
