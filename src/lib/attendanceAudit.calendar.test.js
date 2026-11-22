/**
 * writeAttendanceDays refuses impossible calendar dates before writing
 * anything (owner decision 2026-11-22). The rules refuse them too; this is the
 * client boundary. Fake Firestore, synthetic data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sets = []
const runTransaction = vi.fn(async (_db, fn) => fn({
  get: async () => ({ exists: () => false, data: () => null }),
  set: (ref, data) => sets.push([ref, data]),
}))
vi.mock('firebase/firestore', () => ({
  collection: (_db, ...path) => path.join('/'),
  doc: (base, ...path) => (path.length ? [typeof base === 'string' ? base : '', ...path].filter(Boolean).join('/') : `${base}/auto-id`),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  runTransaction: (...a) => runTransaction(...a),
  serverTimestamp: () => 'now',
}))

const { writeAttendanceDays } = await import('./attendanceAudit')
const held = () => ({ records: {} })

beforeEach(() => { sets.length = 0; runTransaction.mockClear() })

describe('writeAttendanceDays · real calendar dates only', () => {
  it.each(['2026-02-30', '2026-04-31', '2026-02-29', '1900-02-29', '2026-13-01', '2026-00-10', '2026-01-32'])(
    'refuses day %s before opening a transaction',
    async (date) => {
      await expect(writeAttendanceDays({}, 'c1', 't1', [{ date, next: held }]))
        .rejects.toMatchObject({ userMessage: expect.stringMatching(/real calendar date/) })
      expect(runTransaction).not.toHaveBeenCalled()
    },
  )

  it('refuses a move whose make-up end is impossible, writing neither side', async () => {
    await expect(writeAttendanceDays({}, 'c1', 't1', [
      { date: '2026-11-04', kind: 'reschedule_out', next: () => ({ records: {}, session_status: 'rescheduled', rescheduled_to: '2026-11-31' }) },
    ])).rejects.toMatchObject({ userMessage: expect.stringMatching(/real calendar date/) })
    expect(sets).toEqual([])
  })

  it('writes real days, leap days included, each with its audit event', async () => {
    await writeAttendanceDays({}, 'c1', 't1', [
      { date: '2024-02-29', next: held },
      { date: '2000-02-29', next: held },
    ])
    expect(sets).toHaveLength(4)
  })
})
