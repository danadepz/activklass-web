import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

const RULES_PATH = process.env.ACTIVKLASS_RULES_PATH || 'C:/CAPSTONE/_worktrees/school-directory-security-fix/firestore.rules'

const TEACHER = 'teacher-dir-test'

let testEnv

function ctx(uid, claims = {}) {
  return testEnv.authenticatedContext(uid, claims).firestore()
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'activklass-directory-rules-test',
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
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore()
    // 1. Active directory entry
    await setDoc(doc(db, 'school_directory', 'active_sch'), {
      name: 'Active School',
      abbreviation: 'ACTIVE_SCH',
      created_by: 'someone',
      created_at: new Date(),
    })
    // 2. Retiring directory entry
    await setDoc(doc(db, 'school_directory', 'retiring_sch'), {
      name: 'Retiring School',
      abbreviation: 'RETIRING_SCH',
      status: 'retiring',
      created_by: 'someone',
      created_at: new Date(),
    })
    // 3. Retired directory entry
    await setDoc(doc(db, 'school_directory', 'retired_sch'), {
      name: 'Retired School',
      abbreviation: 'RETIRED_SCH',
      status: 'retired',
      created_by: 'someone',
      created_at: new Date(),
    })
    // Base teacher profile
    await setDoc(doc(db, 'users', TEACHER), {
      role: 'teacher',
      first_name: 'Teacher',
      last_name: 'Directory',
      email: 'teacher@dir.test',
      teaching_school_id: 'active_sch',
    })
  })
})

describe('Firestore Rules — activeDirectoryEntry enforcement on registration & affiliations', () => {
  it('allows solo teacher registration selecting an ACTIVE school_directory entry', async () => {
    const newUid = 'new-teacher-1'
    await assertSucceeds(
      setDoc(doc(ctx(newUid, { email: 'new1@dir.test' }), 'users', newUid), {
        role: 'teacher',
        first_name: 'New',
        last_name: 'One',
        email: 'new1@dir.test',
        teaching_school_id: 'active_sch',
      }),
    )
  })

  it('refuses solo teacher registration selecting a RETIRING school_directory entry', async () => {
    const newUid = 'new-teacher-2'
    await assertFails(
      setDoc(doc(ctx(newUid, { email: 'new2@dir.test' }), 'users', newUid), {
        role: 'teacher',
        first_name: 'New',
        last_name: 'Two',
        email: 'new2@dir.test',
        teaching_school_id: 'retiring_sch',
      }),
    )
  })

  it('refuses solo teacher registration selecting a RETIRED school_directory entry', async () => {
    const newUid = 'new-teacher-3'
    await assertFails(
      setDoc(doc(ctx(newUid, { email: 'new3@dir.test' }), 'users', newUid), {
        role: 'teacher',
        first_name: 'New',
        last_name: 'Three',
        email: 'new3@dir.test',
        teaching_school_id: 'retired_sch',
      }),
    )
  })

  it('allows teacher profile update keeping an active school affiliation', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(TEACHER), 'users', TEACHER), {
        first_name: 'UpdatedName',
      }),
    )
  })

  it('refuses teacher profile update switching to a RETIRING directory entry', async () => {
    await assertFails(
      updateDoc(doc(ctx(TEACHER), 'users', TEACHER), {
        teaching_school_id: 'retiring_sch',
      }),
    )
  })

  it('refuses teacher profile update switching to a RETIRED directory entry', async () => {
    await assertFails(
      updateDoc(doc(ctx(TEACHER), 'users', TEACHER), {
        teaching_school_id: 'retired_sch',
      }),
    )
  })

  it('allows institution subscription_request with an ACTIVE school abbreviation', async () => {
    await assertSucceeds(
      setDoc(doc(ctx(TEACHER), 'subscription_requests', 'req_active'), {
        uid: TEACHER,
        first_name: 'Admin',
        last_name: 'School',
        phone: '09171234567',
        school_name: 'Active School',
        school_abbr: 'active_sch',
        school_type: 'private',
        academic_calendar: 'school_year',
        position: 'faculty',
        email: 'admin@activesch.edu.ph',
        teacher_seats: 10,
        students_per_teacher: 30,
        student_seats: 300,
        status: 'pending',
        created_at: serverTimestamp(),
      }),
    )
  })

  it('refuses institution subscription_request with a RETIRING school abbreviation', async () => {
    await assertFails(
      setDoc(doc(ctx(TEACHER), 'subscription_requests', 'req_retiring'), {
        uid: TEACHER,
        first_name: 'Admin',
        last_name: 'School',
        phone: '09171234567',
        school_name: 'Retiring School',
        school_abbr: 'retiring_sch',
        school_type: 'private',
        academic_calendar: 'school_year',
        position: 'faculty',
        email: 'admin@retiringsch.edu.ph',
        teacher_seats: 10,
        students_per_teacher: 30,
        student_seats: 300,
        status: 'pending',
        created_at: serverTimestamp(),
      }),
    )
  })

  it('refuses institution subscription_request with a RETIRED school abbreviation', async () => {
    await assertFails(
      setDoc(doc(ctx(TEACHER), 'subscription_requests', 'req_retired'), {
        uid: TEACHER,
        first_name: 'Admin',
        last_name: 'School',
        phone: '09171234567',
        school_name: 'Retired School',
        school_abbr: 'retired_sch',
        school_type: 'private',
        academic_calendar: 'school_year',
        position: 'faculty',
        email: 'admin@retiredsch.edu.ph',
        teacher_seats: 10,
        students_per_teacher: 30,
        student_seats: 300,
        status: 'pending',
        created_at: serverTimestamp(),
      }),
    )
  })
})
