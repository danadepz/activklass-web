/**
 * T-73 (triplecookiemonster-93): a teacher deleted a published quiz and its
 * column stayed on the class record -- and in the student's grade -- though the
 * delete dialog said "the gradebook loses those scores".
 *
 * Pinned: deleting a quiz takes its assessment row off the record in EVERY
 * class it was mapped to and re-syncs each class's entries (which is what the
 * student reads), all-or-nothing when a period is locked; and the Quizzes
 * page runs that removal before it deletes the quiz document itself.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({ gradebooks: {}, deleted: [], synced: [] }))

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn() }))
vi.mock('@/lib/gradebook', () => ({ syncEntries: vi.fn(async (classId) => { fs.synced.push(classId) }) }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal()),
  doc: (_db, ...path) => path.join('/'),
  getDoc: async (path) => {
    const id = path.split('/')[1]
    const data = fs.gradebooks[id]
    return { exists: () => !!data, data: () => data }
  },
  deleteDoc: async (path) => { fs.deleted.push(path) },
}))

import { removeQuizFromAllRecords } from './useQuizRecordSync.js'

const quiz = { id: 'Q9' }
const mappings = { C1: { grading_period_id: 'q1' }, C2: { grading_period_id: 'mid' } }

beforeEach(() => {
  fs.deleted = []
  fs.synced = []
  fs.gradebooks = {
    C1: { periods: [{ id: 'q1', name: 'Quarter 1', locked: false }] },
    C2: { periods: [{ id: 'mid', name: 'Midterm', locked: false }] },
  }
})

describe('T-73 — deleting a quiz takes it off every class record', () => {
  it("deletes the quiz's assessment row in every mapped class and re-syncs each class's entries", async () => {
    const r = await removeQuizFromAllRecords({ quiz, classMappings: mappings })
    expect(r).toEqual({ removed: ['C1', 'C2'], locked: [] })
    expect(fs.deleted.sort()).toEqual(['gradebooks/C1/assessments/quiz-Q9', 'gradebooks/C2/assessments/quiz-Q9'])
    expect(fs.synced.sort()).toEqual(['C1', 'C2'])
  })

  it('removes nothing anywhere when any mapped period is locked, and names it', async () => {
    fs.gradebooks.C2.periods[0].locked = true
    const r = await removeQuizFromAllRecords({ quiz, classMappings: mappings })
    expect(r).toEqual({ removed: [], locked: [{ classId: 'C2', periodName: 'Midterm' }] })
    expect(fs.deleted).toEqual([])
    expect(fs.synced).toEqual([])
  })
})

describe('T-73 — the Quizzes page removes the column before deleting the quiz', () => {
  const src = readFileSync(fileURLToPath(new URL('../routes/teacher/quizzes.jsx', import.meta.url)), 'utf8')
  const at = src.indexOf('async function handleDelete(')
  const body = src.slice(at, src.indexOf('\n  }\n', at))

  it('calls removeQuizFromAllRecords, stops on a locked period, and only then deletes the quiz document', () => {
    expect(at).toBeGreaterThan(-1)
    // Runs for any quiz that was assigned somewhere -- not behind a condition
    // that could quietly be false.
    const guard = body.indexOf('if (quiz?.class_mappings && Object.keys(quiz.class_mappings).length) {')
    const remove = body.indexOf('removeQuizFromAllRecords({ quiz, classMappings: quiz.class_mappings })')
    expect(guard, 'the removal is no longer guarded by "the quiz was assigned somewhere"').toBeGreaterThan(-1)
    expect(remove).toBeGreaterThan(guard)
    const stop = body.indexOf('if (locked.length)')
    const del = body.indexOf("deleteDoc(doc(db, 'quizzes', quizId))")
    expect(remove).toBeGreaterThan(-1)
    expect(stop).toBeGreaterThan(remove)
    expect(del).toBeGreaterThan(stop)
  })

  it('no longer promises what the code never did', () => {
    expect(body).not.toMatch(/the gradebook loses those scores/)
    expect(body).toMatch(/Its column comes off the class record in every class it was assigned to/)
  })
})
