import { readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc } from 'firebase/firestore'

const RULES_PATH = process.env.ACTIVKLASS_RULES_PATH || fileURLToPath(new URL('../../../activklass-backend/firestore.rules', import.meta.url))
const STUDENT = 'metadata-student'
const TEACHER = 'metadata-teacher'
const ATTEMPT = 'metadata-attempt'
let testEnv

const ctx = (uid) => testEnv.authenticatedContext(uid).firestore()

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'activklass-metadata-rules-test',
    firestore: { rules: readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore()
    await setDoc(doc(db, 'users', STUDENT), { role: 'student', teacher_ids: [TEACHER] })
    await setDoc(doc(db, 'users', TEACHER), { role: 'teacher' })
    await setDoc(doc(db, 'classes', 'metadata-class'), { teacher_id: TEACHER, student_ids: [STUDENT] })
    await setDoc(doc(db, 'quiz_attempts', ATTEMPT), {
      quiz_id: 'metadata-quiz', class_id: 'metadata-class', student_id: STUDENT,
      status: 'in_progress', started_at: new Date('2026-01-01T00:00:00Z'),
      question_ids: ['q1'],
      question_metadata: [{ question_id: 'q1', blooms_level: null, topic_id: 'topic-1', topic_label: 'Module · Topic', objective: null }],
    })
  })
})

describe('attempt question metadata immutability', () => {
  it('refuses student edits to the historical snapshot', async () => {
    await assertFails(updateDoc(doc(ctx(STUDENT), 'quiz_attempts', ATTEMPT), {
      question_metadata: [{ question_id: 'q1', blooms_level: 'remember', topic_id: 'topic-2' }],
    }))
  })

  it('refuses teacher edits to the historical snapshot', async () => {
    await assertFails(updateDoc(doc(ctx(TEACHER), 'quiz_attempts', ATTEMPT), {
      question_metadata: [],
    }))
  })

  it('still permits ordinary answer progress', async () => {
    await assertSucceeds(updateDoc(doc(ctx(STUDENT), 'quiz_attempts', ATTEMPT), {
      answers: { q1: 'a' },
    }))
  })
})
