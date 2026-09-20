/**
 * T-87 (triplecookiemonster-106): a quiz deleted before `89c1200` (T-73)
 * left its column on the class record forever -- the fix only cleans up at
 * the moment of a delete, and nothing swept what a pre-fix delete had
 * already orphaned.
 *
 * Pinned: `sweepOrphanedQuizColumns` removes exactly the assessment rows
 * `orphanedQuizAssessments` found, refuses only the ones in a locked
 * period (naming it) while still removing the rest, and re-syncs entries
 * once, only when something was actually removed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({ deleted: [], synced: [] }))

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn() }))
vi.mock('@/lib/gradebook', () => ({ syncEntries: vi.fn(async (classId) => { fs.synced.push(classId) }) }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal()),
  doc: (_db, ...path) => path.join('/'),
  deleteDoc: async (path) => { fs.deleted.push(path) },
}))

import { sweepOrphanedQuizColumns } from './useQuizRecordSync.js'

const periods = [
  { id: 'q1', name: 'Quarter 1', locked: false },
  { id: 'q2', name: 'Quarter 2', locked: true },
]

beforeEach(() => {
  fs.deleted = []
  fs.synced = []
})

describe('sweepOrphanedQuizColumns', () => {
  it('does nothing, and never touches Firestore, when there are no orphans', async () => {
    const r = await sweepOrphanedQuizColumns({ classId: 'C1', orphans: [], periods })
    expect(r).toEqual({ removed: [], locked: [] })
    expect(fs.deleted).toEqual([])
    expect(fs.synced).toEqual([])
  })

  it('deletes an orphaned column in an unlocked period and re-syncs entries once', async () => {
    const orphans = [{ id: 'quiz-Q9', period_id: 'q1' }]
    const r = await sweepOrphanedQuizColumns({ classId: 'C1', orphans, periods })
    expect(r).toEqual({ removed: ['quiz-Q9'], locked: [] })
    expect(fs.deleted).toEqual(['gradebooks/C1/assessments/quiz-Q9'])
    expect(fs.synced).toEqual(['C1'])
  })

  it('refuses the one in a locked period, names it, and still removes the rest', async () => {
    const orphans = [
      { id: 'quiz-Q1', period_id: 'q1' }, // unlocked
      { id: 'quiz-Q2', period_id: 'q2' }, // locked
    ]
    const r = await sweepOrphanedQuizColumns({ classId: 'C1', orphans, periods })
    expect(r.removed).toEqual(['quiz-Q1'])
    expect(r.locked).toEqual(['Quarter 2 is locked — unlock it to remove that column.'])
    expect(fs.deleted).toEqual(['gradebooks/C1/assessments/quiz-Q1'])
    expect(fs.synced).toEqual(['C1']) // still re-synced: something did get removed
  })

  it('re-syncs entries not at all when every orphan is refused', async () => {
    const orphans = [{ id: 'quiz-Q2', period_id: 'q2' }]
    const r = await sweepOrphanedQuizColumns({ classId: 'C1', orphans, periods })
    expect(r).toEqual({ removed: [], locked: ['Quarter 2 is locked — unlock it to remove that column.'] })
    expect(fs.deleted).toEqual([])
    expect(fs.synced).toEqual([])
  })

  it('leaves an orphan alone when its assessment carries a period that no longer exists on the gradebook, treating it as unlocked', async () => {
    const orphans = [{ id: 'quiz-Q3', period_id: 'deleted-period' }]
    const r = await sweepOrphanedQuizColumns({ classId: 'C1', orphans, periods })
    expect(r.removed).toEqual(['quiz-Q3'])
    expect(r.locked).toEqual([])
  })
})
