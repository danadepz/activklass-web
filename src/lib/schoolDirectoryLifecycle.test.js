/**
 * T-272: a purged school's directory entry is retired (`status: 'retired'`,
 * backend app/services/school_directory.py), never deleted. This pins the
 * client half: the dropdown leaves it out, a submit re-reads the picked entry
 * instead of trusting a cached list, and a retired abbreviation is never
 * handed out again by itself. firestore.rules is the guard
 * (firestoreRules.test.js, "school_directory lifecycle"); this is the courtesy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ docs: {}, writes: [] }))

vi.mock('./firebase', () => ({ auth: { currentUser: { uid: 'me' } }, db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ name }),
  doc: (_db, name, id) => ({ name, id }),
  getDocs: async () => ({
    docs: Object.entries(store.docs).map(([id, data]) => ({ id, data: () => data })),
  }),
  getDoc: async (ref) => ({
    id: ref.id,
    exists: () => ref.id in store.docs,
    data: () => store.docs[ref.id],
  }),
  setDoc: async (ref, data) => { store.writes.push([ref.id, data]); store.docs[ref.id] = data },
  serverTimestamp: () => 'ts',
}))

import {
  abbrConflictError,
  addSchoolToDirectory,
  fetchSchoolDirectory,
  findActiveSchoolById,
  isRetiredSchool,
} from './schoolDirectory'

beforeEach(() => {
  store.writes = []
  store.docs = {
    pa: { name: 'Purged Academy', abbreviation: 'PA', status: 'retired' },
    live: { name: 'Live High', abbreviation: 'LIVE', status: 'active' },
    old: { name: 'Old College', abbreviation: 'OLD' }, // written before T-272: no status
  }
})

describe('the registration dropdown (A, B, E, F)', () => {
  it('leaves a retired school out and keeps active and legacy ones', async () => {
    const ids = (await fetchSchoolDirectory()).map((s) => s.id)
    expect(ids).toEqual(['live', 'old'])
  })

  it('a fresh fetch never brings a retired school back', async () => {
    await fetchSchoolDirectory()
    expect((await fetchSchoolDirectory()).some((s) => s.id === 'pa')).toBe(false)
  })

  it('reads only `retired` as retired — a missing status is active', () => {
    expect(isRetiredSchool({ status: 'retired' })).toBe(true)
    expect(isRetiredSchool({})).toBe(false)
    expect(isRetiredSchool({ status: 'active' })).toBe(false)
    expect(isRetiredSchool(null)).toBe(false)
  })
})

describe('the submit-time re-check (C)', () => {
  it('refuses a picked school that has since been retired or removed', async () => {
    expect(await findActiveSchoolById('pa')).toBeNull()
    expect(await findActiveSchoolById('gone')).toBeNull()
    expect(await findActiveSchoolById('')).toBeNull()
  })

  it('returns the entry, fresh, for an active or legacy school', async () => {
    expect(await findActiveSchoolById('live')).toMatchObject({ id: 'live', name: 'Live High' })
    expect(await findActiveSchoolById('old')).toMatchObject({ id: 'old', name: 'Old College' })
  })
})

describe('a retired abbreviation is not reused on its own', () => {
  it('says so, even when the same name is typed again', async () => {
    expect(await abbrConflictError('PA', 'Purged Academy')).toMatch(/no longer on ActivKlass/)
    expect(await abbrConflictError('pa', 'Another School')).toMatch(/no longer on ActivKlass/)
  })

  it('leaves active-entry behaviour as it was', async () => {
    expect(await abbrConflictError('LIVE', 'Live High')).toBe('')
    expect(await abbrConflictError('LIVE', 'Other School')).toMatch(/already used by Live High/)
    expect(await abbrConflictError('NEW', 'Brand New School')).toBe('')
  })

  it('adding a purged school back under its old abbreviation throws and writes nothing', async () => {
    await expect(addSchoolToDirectory({ name: 'Purged Academy', abbreviation: 'PA' }))
      .rejects.toThrow(/no longer on ActivKlass/)
    expect(store.writes).toEqual([])
  })

  it('adding it under a new abbreviation creates a new entry rather than reviving the retired one', async () => {
    const added = await addSchoolToDirectory({ name: 'Purged Academy', abbreviation: 'PA2' })
    expect(added.id).toBe('pa2')
    expect(store.docs.pa.status).toBe('retired')
  })
})
