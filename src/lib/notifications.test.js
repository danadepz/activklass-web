/**
 * notifyStudents prefixes the message with the class's own label
 * ("<subject_code> — <section>"), falls back sanely, and never blocks the
 * notification on a failed class read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const writes = { set: [] }
const classDoc = { exists: true, data: { subject_code: 'SCI9', section: 'Newton' } }
vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ name }),
  doc: (dbOrColl, ...parts) => (dbOrColl?.name ? { path: `${dbOrColl.name}/auto-1` } : { path: parts.join('/') }),
  getDoc: async () => ({
    exists: () => classDoc.exists,
    data: () => classDoc.data,
  }),
  setDoc: async () => {},
  writeBatch: () => ({
    set: (ref, data) => writes.set.push([ref.path, data]),
    commit: async () => {},
  }),
  serverTimestamp: () => 'TS',
}))
vi.mock('./firebase', () => ({ db: {} }))

const { notifyStudents } = await import('./notifications')

beforeEach(() => {
  writes.set = []
  classDoc.exists = true
  classDoc.data = { subject_code: 'SCI9', section: 'Newton' }
})

describe('notifyStudents', () => {
  it('prefixes the message with the class\'s subject code and section', async () => {
    await notifyStudents({ studentIds: ['s1'], classId: 'c1', createdBy: 't1', type: 'announcement', message: 'New announcement: Quiz tomorrow' })
    expect(writes.set[0][1].message).toBe('SCI9 — Newton · New announcement: Quiz tomorrow')
  })

  it('falls back to subject when there is no subject_code', async () => {
    classDoc.data = { subject: 'Science' }
    await notifyStudents({ studentIds: ['s1'], classId: 'c1', createdBy: 't1', type: 'announcement', message: 'New announcement: Quiz tomorrow' })
    expect(writes.set[0][1].message).toBe('Science · New announcement: Quiz tomorrow')
  })

  it('falls back to subject_code alone when there is no section or subject', async () => {
    classDoc.data = { subject_code: 'SCI9' }
    await notifyStudents({ studentIds: ['s1'], classId: 'c1', createdBy: 't1', type: 'announcement', message: 'New announcement: Quiz tomorrow' })
    expect(writes.set[0][1].message).toBe('SCI9 · New announcement: Quiz tomorrow')
  })

  it('sends unprefixed when the class has neither subject_code nor subject nor section', async () => {
    classDoc.data = {}
    await notifyStudents({ studentIds: ['s1'], classId: 'c1', createdBy: 't1', type: 'announcement', message: 'New announcement: Quiz tomorrow' })
    expect(writes.set[0][1].message).toBe('New announcement: Quiz tomorrow')
  })

  it('sends unprefixed when the class read fails, and still notifies', async () => {
    classDoc.exists = false
    await notifyStudents({ studentIds: ['s1'], classId: 'c1', createdBy: 't1', type: 'announcement', message: 'New announcement: Quiz tomorrow' })
    expect(writes.set).toHaveLength(1)
    expect(writes.set[0][1].message).toBe('New announcement: Quiz tomorrow')
  })

  it('does not add the label twice if the message already starts with it', async () => {
    await notifyStudents({ studentIds: ['s1'], classId: 'c1', createdBy: 't1', type: 'announcement', message: 'SCI9 — Newton · New announcement: Quiz tomorrow' })
    expect(writes.set[0][1].message).toBe('SCI9 — Newton · New announcement: Quiz tomorrow')
  })

  it('sends nothing when there are no student ids, without reading the class', async () => {
    await notifyStudents({ studentIds: [], classId: 'c1', createdBy: 't1', type: 'announcement', message: 'x' })
    expect(writes.set).toHaveLength(0)
  })
})
