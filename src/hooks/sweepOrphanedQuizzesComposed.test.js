/**
 * T-87 (triplecookiemonster-106) -- the tester's own sentence, end to end.
 *
 * Kristine's PS under her T-73 PASS: "Need pa iremove ang traces sa recent
 * quizzes pajud where this task failed kay naa pa sila sa class record
 * (teacher) and quizzes/grade center (student) even though deleted na ang
 * quizzes." The columns left behind by quizzes deleted BEFORE `89c1200`
 * landed were never swept -- that fix only cleans up at the moment of a
 * delete.
 *
 * The two halves of the healer are each already pinned on their own
 * (`orphanedQuizAssessments` in `lib/quizToRecord.test.js`, and
 * `sweepOrphanedQuizColumns` in `sweepOrphanedQuizzes.test.js`, which is
 * handed a ready-made `orphans` array). What nothing pinned is the
 * COMPOSITION the record page actually runs -- detection feeding removal --
 * so a change that keeps both units passing while wiring them together
 * wrongly (a narrower quiz list, a dropped `source_quiz_id` guard, a
 * detection that simply stops detecting) would go unnoticed. This pins the
 * whole line: one real class record, one quiz still alive, one quiz deleted
 * out from under its column, one hand-entered column.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({ deleted: [], synced: [] }))

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn() }))
vi.mock('@/lib/gradebook', () => ({
  syncEntries: vi.fn(async (classId) => {
    fs.synced.push(classId)
  }),
}))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal()),
  doc: (_db, ...path) => path.join('/'),
  deleteDoc: async (path) => {
    fs.deleted.push(path)
  },
}))

import { orphanedQuizAssessments } from '@/lib/quizToRecord'
import { sweepOrphanedQuizColumns } from './useQuizRecordSync.js'

const PERIODS = [
  { id: 'q1', name: 'Quarter 1', locked: true },
  { id: 'q2', name: 'Quarter 2', locked: false },
]

/* The class record exactly as the page loads it: one column posted by a quiz
   that still exists, one left behind by a quiz deleted before the fix, and
   one the teacher typed by hand (no source_quiz_id at all). */
const ASSESSMENTS = [
  { id: 'quiz-live-quiz', title: 'Quiz 2 - Matter', source_quiz_id: 'live-quiz', period_id: 'q2' },
  { id: 'quiz-deleted-quiz', title: 'Quiz 1 - Scientific Method', source_quiz_id: 'deleted-quiz', period_id: 'q2' },
  { id: 'a-q2-ww1', title: 'Written Work 2 - Periodic Table', period_id: 'q2' },
]

/* What `useQuizzes()` resolves to: the deleted quiz is simply not in it. */
const QUIZZES_AFTER_DELETE = [{ id: 'live-quiz' }, { id: 'some-other-class-quiz' }]

/** Exactly what `useSweepOrphanedQuizzes` does on a page open. */
const sweepOnOpen = ({ assessments = ASSESSMENTS, quizzes, periods = PERIODS } = {}) =>
  sweepOrphanedQuizColumns({
    classId: 'demo-sci9-newton',
    orphans: orphanedQuizAssessments(assessments, quizzes),
    periods,
  })

beforeEach(() => {
  fs.deleted = []
  fs.synced = []
})

describe('opening a class record sweeps the columns a pre-fix quiz delete orphaned (T-87)', () => {
  it('drops the column whose quiz no longer exists, and re-syncs the students entries', async () => {
    const result = await sweepOnOpen({ quizzes: QUIZZES_AFTER_DELETE })

    expect(result.removed).toEqual(['quiz-deleted-quiz'])
    expect(fs.deleted).toEqual(['gradebooks/demo-sci9-newton/assessments/quiz-deleted-quiz'])
    // The student reads their grade through `entries` only: without this the
    // teacher sees the corrected record and the student still counts the quiz.
    expect(fs.synced).toEqual(['demo-sci9-newton'])
  })

  it('keeps the column of a quiz that still exists, and the hand-entered one, untouched', async () => {
    await sweepOnOpen({ quizzes: QUIZZES_AFTER_DELETE })

    expect(fs.deleted).not.toContain('gradebooks/demo-sci9-newton/assessments/quiz-live-quiz')
    expect(fs.deleted).not.toContain('gradebooks/demo-sci9-newton/assessments/a-q2-ww1')
    expect(fs.deleted).toHaveLength(1)
  })

  it('removes nothing at all while every quiz behind the record still exists', async () => {
    const result = await sweepOnOpen({
      quizzes: [{ id: 'live-quiz' }, { id: 'deleted-quiz' }],
    })

    expect(result).toEqual({ removed: [], locked: [] })
    expect(fs.deleted).toEqual([])
    expect(fs.synced).toEqual([])
  })

  it('refuses an orphan sitting in a locked period, names the period, and deletes nothing', async () => {
    const result = await sweepOnOpen({
      assessments: [{ ...ASSESSMENTS[1], period_id: 'q1' }],
      quizzes: QUIZZES_AFTER_DELETE,
    })

    expect(result.removed).toEqual([])
    expect(result.locked).toEqual(['Quarter 1 is locked — unlock it to remove that column.'])
    expect(fs.deleted).toEqual([])
    expect(fs.synced).toEqual([])
  })

  /* The whole risk of a healer: a quiz list that has not resolved, resolved
     empty, or errored looks identical to "every quiz is gone" from in here.
     Sweeping on any of those wipes every quiz column in the class at once --
     far worse than the bug being fixed. */
  it.each([
    ['still loading', undefined],
    ['resolved empty', []],
    ['errored into a non-array', null],
  ])('sweeps nothing when the teachers quiz list is %s', async (_label, quizzes) => {
    const result = await sweepOnOpen({ quizzes })

    expect(result).toEqual({ removed: [], locked: [] })
    expect(fs.deleted).toEqual([])
    expect(fs.synced).toEqual([])
  })
})
