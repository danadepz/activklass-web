import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getDocs } = vi.hoisted(() => ({ getDocs: vi.fn() }))
vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ name }),
  doc: (_db, collectionName, id) => ({ collectionName, id }),
  getDocs,
  query: (source, ...constraints) => ({ source, constraints }),
  serverTimestamp: () => 'server-time',
  updateDoc: vi.fn(),
  where: (...args) => args,
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))

import { fetchAllUsers } from './useAdminUsers'

describe('fetchAllUsers', () => {
  beforeEach(() => getDocs.mockReset())

  it('joins school-scoped activity records to users and keeps missing activity empty', async () => {
    getDocs.mockImplementation(async (querySnapshot) => querySnapshot?.source?.name === 'users'
      ? { docs: [
        { id: 'student-1', data: () => ({ role: 'student', last_name: 'B', student_number: 'S1' }) },
        { id: 'student-2', data: () => ({ role: 'student', last_name: 'A' }) },
      ] }
      : { docs: [{ id: 'student-1', data: () => ({ last_active_at: 'activity-time' }) }] })

    const users = await fetchAllUsers('school-1')

    expect(users).toEqual([
      { id: 'student-2', role: 'student', last_name: 'A', last_active_at: null },
      { id: 'student-1', role: 'student', last_name: 'B', student_number: 'S1', last_active_at: 'activity-time' },
    ])
    expect(getDocs).toHaveBeenCalledTimes(2)
    expect(getDocs.mock.calls.map(([q]) => q.source.name).sort()).toEqual(['student_activity', 'users'])
  })

  it('does not query either collection without a school scope', async () => {
    await expect(fetchAllUsers('')).resolves.toEqual([])
    expect(getDocs).not.toHaveBeenCalled()
  })
})
