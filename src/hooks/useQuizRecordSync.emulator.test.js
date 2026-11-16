import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'

const rulesPath = globalThis.process?.env?.ACTIVKLASS_RULES_PATH
  || new URL('../../../../activklass-backend/firestore.rules', import.meta.url)
const TEACHER = 'teacher-performance-fixture'
const STUDENT = 'student-performance-fixture'
const CLASS = 'class-performance-fixture'
const QUIZ = 'quiz-performance-fixture'
const EMULATOR_IS_RUNNING = Boolean(globalThis.process?.env?.FIRESTORE_EMULATOR_HOST)

let testEnv
let teacherDb
let syncQuizToClassRecord

beforeAll(async () => {
  if (!EMULATOR_IS_RUNNING) return
  testEnv = await initializeTestEnvironment({
    projectId: 'activklass-performance-sync-test',
    firestore: { rules: readFileSync(rulesPath, 'utf8'), host: '127.0.0.1', port: 8080 },
  })
  teacherDb = testEnv.authenticatedContext(TEACHER).firestore()
  vi.doMock('@/lib/firebase', () => ({ db: teacherDb }))
  ;({ syncQuizToClassRecord } = await import('./useQuizRecordSync.js'))
})

afterAll(async () => {
  await testEnv?.cleanup()
  vi.doUnmock('@/lib/firebase')
})

beforeEach(async () => {
  if (!EMULATOR_IS_RUNNING) return
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore()
    await Promise.all([
      setDoc(doc(db, 'users', TEACHER), { role: 'teacher' }),
      setDoc(doc(db, 'users', STUDENT), { role: 'student', teacher_ids: [TEACHER] }),
      setDoc(doc(db, 'classes', CLASS), { teacher_id: TEACHER, student_ids: [STUDENT] }),
      setDoc(doc(db, 'gradebooks', CLASS), {
        configured: true,
        periods: [{ id: 'term-1', name: 'Term 1', locked: false }],
        components: [{ id: 'quiz-component', name: 'Quizzes', weight: 100 }],
      }),
      setDoc(doc(db, 'quiz_attempts', 'attempt-fixture'), {
        quiz_id: QUIZ, class_id: CLASS, student_id: STUDENT,
        attempt_number: 1, status: 'graded', total_score: 8, total_possible: 10,
      }),
    ])
  })
})

const quiz = {
  id: QUIZ, title: 'Fixture quiz', status: 'published', scoring_attempt: 'best',
  questions: [{ id: 'q1', type: 'multiple_choice', points: 10 }],
  class_mappings: { [CLASS]: { grading_period_id: 'term-1', component_id: 'quiz-component' } },
}

describe.skipIf(!EMULATOR_IS_RUNNING)('Performance quiz score synchronization against the Firestore Emulator', () => {
  it('posts a submitted quiz result to the owning class record without opening Class Record', async () => {
    const result = await syncQuizToClassRecord({
      quiz, classId: CLASS, mapping: quiz.class_mappings[CLASS], firestore: teacherDb,
      loadStudents: async (ids) => ids.map((id) => ({ id, student_id: id })),
      updateEntries: async () => {},
    })

    expect(result.written).toBe(1)
    const assessment = await getDoc(doc(teacherDb, 'gradebooks', CLASS, 'assessments', `quiz-${QUIZ}`))
    expect(assessment.data().scores[STUDENT]).toEqual({ status: 'graded', raw_score: 8 })

    // Performance and Class Record both read this same assessment collection.
    const recordRows = await getDocs(collection(teacherDb, 'gradebooks', CLASS, 'assessments'))
    expect(recordRows.docs.find((row) => row.id === `quiz-${QUIZ}`).data().scores[STUDENT].raw_score).toBe(8)
  })

  it('preserves a manual score override when a newer quiz result exists', async () => {
    await setDoc(doc(teacherDb, 'gradebooks', CLASS, 'assessments', `quiz-${QUIZ}`), {
      scores: { [STUDENT]: { status: 'graded', raw_score: 6, manual: true } },
    })
    const result = await syncQuizToClassRecord({
      quiz, classId: CLASS, mapping: quiz.class_mappings[CLASS], firestore: teacherDb,
      loadStudents: async (ids) => ids.map((id) => ({ id, student_id: id })),
      updateEntries: async () => {},
    })
    const assessment = await getDoc(doc(teacherDb, 'gradebooks', CLASS, 'assessments', `quiz-${QUIZ}`))
    expect(result.kept).toBe(1)
    expect(assessment.data().scores[STUDENT]).toEqual({ status: 'graded', raw_score: 6, manual: true })
  })

  it('cannot query a quiz attempt through another class id', async () => {
    await expect(getDoc(doc(teacherDb, 'gradebooks', 'another-class'))).rejects.toThrow()
    await expect(
      import('firebase/firestore').then(({ getDocs }) => getDocs(
        query(collection(teacherDb, 'quiz_attempts'), where('quiz_id', '==', QUIZ), where('class_id', '==', 'another-class')),
      )),
    ).rejects.toThrow()
  })
})
