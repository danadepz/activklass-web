/**
 * The write helpers against mocked Firestore: what publishTask saves, what it
 * tells the roster, and that a failed notification never fails the publish.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const writes = { set: [], update: [], del: [] }
const fail = { update: false }
vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ name }),
  doc: (dbOrColl, ...parts) => (dbOrColl?.name ? { path: `${dbOrColl.name}/auto-1`, id: 'auto-1' } : { path: parts.join('/'), id: parts[parts.length - 1] }),
  setDoc: async (ref, data) => { writes.set.push([ref.path, data]) },
  updateDoc: async (ref, data) => { if (fail.update) throw new Error('refused'); writes.update.push([ref.path, data]) },
  deleteDoc: async (ref) => { writes.del.push(ref.path) },
  serverTimestamp: () => 'TS',
}))
vi.mock('./firebase', () => ({ db: {}, storage: null }))
const uploadAttachment = vi.fn(async (path) => `https://firebasestorage.googleapis.com/v0/b/x/o/${encodeURIComponent(path)}`)
vi.mock('./attachments', () => ({ uploadAttachment: (...a) => uploadAttachment(...a) }))
const notifyStudents = vi.fn(async () => {})
vi.mock('./notifications', () => ({ notifyStudents: (...a) => notifyStudents(...a) }))

const { createTask, updateTask, publishTask, deleteTask, uploadTaskFile, newTaskId, classTasksKey } = await import('./classTasks')

beforeEach(() => {
  writes.set = []; writes.update = []; writes.del = []; fail.update = false
  notifyStudents.mockClear(); uploadAttachment.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('createTask', () => {
  it('writes the full shape as a draft under the caller\'s teacher_id, dropping unknown keys', async () => {
    const id = await createTask({ classId: 'c1', teacherId: 't1', task: { title: '  Lab 1 ', kind: 'activity', due_at: '', points: '20', evil: true } })
    expect(id).toBe('auto-1')
    const [path, data] = writes.set[0]
    expect(path).toBe('class_tasks/auto-1')
    expect(data).toMatchObject({ class_id: 'c1', teacher_id: 't1', title: 'Lab 1', kind: 'activity', due_at: null, opens_at: null, points: 20, status: 'draft', attachments: [], created_at: 'TS', updated_at: 'TS' })
    expect(data).not.toHaveProperty('evil')
  })
  it('uses a pre-allocated id so files uploaded first end up under the same task', async () => {
    expect(newTaskId()).toBe('auto-1')
    const id = await createTask({ classId: 'c1', teacherId: 't1', task: { title: 'X' }, id: 'pre-9' })
    expect(id).toBe('pre-9')
    expect(writes.set[0][0]).toBe('class_tasks/pre-9')
  })
  it('an unknown kind is stored as other, and status cannot be anything but draft or published', async () => {
    await createTask({ classId: 'c1', teacherId: 't1', task: { kind: 'homework', status: 'live' } })
    expect(writes.set[0][1]).toMatchObject({ kind: 'other', status: 'draft' })
  })
})

describe('updateTask / deleteTask', () => {
  it('updates only the task\'s own fields and stamps updated_at', async () => {
    await updateTask('k1', { due_at: '2026-09-20T23:59', class_id: 'c9', teacher_id: 'someone' })
    expect(writes.update[0]).toEqual(['class_tasks/k1', { due_at: '2026-09-20T23:59', updated_at: 'TS' }])
  })
  it('deletes by id', async () => {
    await deleteTask('k1')
    expect(writes.del).toEqual(['class_tasks/k1'])
  })
})

describe('publishTask', () => {
  const task = { class_id: 'c1', kind: 'assignment', title: 'Assignment 1', topic_id: 't3' }

  it('saves status published, then notifies the roster with the kind, the title and the sub-module deep link', async () => {
    await publishTask({ taskId: 'k1', task, teacherId: 't1', studentIds: ['s1', 's2'], changes: { due_at: '2026-09-20T23:59' } })
    expect(writes.update[0]).toEqual(['class_tasks/k1', { due_at: '2026-09-20T23:59', status: 'published', updated_at: 'TS' }])
    expect(notifyStudents).toHaveBeenCalledWith({
      studentIds: ['s1', 's2'], classId: 'c1', createdBy: 't1', type: 'task_published',
      message: 'New assignment: Assignment 1', link: '/student/classes/c1?tab=topics&topic=t3',
    })
  })
  it('a task without a sub-module links to the Modules tab itself', async () => {
    await publishTask({ taskId: 'k1', task: { ...task, topic_id: null, kind: 'exam' }, teacherId: 't1', studentIds: ['s1'] })
    expect(notifyStudents.mock.calls[0][0]).toMatchObject({ message: 'New exam: Assignment 1', link: '/student/classes/c1?tab=topics' })
  })
  it('a failed notification never fails the publish', async () => {
    notifyStudents.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'))
    await expect(publishTask({ taskId: 'k1', task, teacherId: 't1', studentIds: ['s1'] })).resolves.toBeUndefined()
    expect(writes.update).toHaveLength(1)
    expect(console.error).toHaveBeenCalled()
  })
  it('a failed save is the caller’s error and nobody is notified', async () => {
    fail.update = true
    await expect(publishTask({ taskId: 'k1', task, teacherId: 't1', studentIds: ['s1'] })).rejects.toThrow('refused')
    expect(notifyStudents).not.toHaveBeenCalled()
  })
})

describe('uploadTaskFile', () => {
  it('uploads under task_files/{classId}/{taskId}/ with the name made safe and unique', async () => {
    const url = await uploadTaskFile('c1', 'k1', { name: 'a/b template.pdf', type: 'application/pdf' })
    const path = uploadAttachment.mock.calls[0][0]
    expect(path).toMatch(/^task_files\/c1\/k1\/\d+-a_b template\.pdf$/)
    expect(url).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\//)
  })
  it('refuses without a class or a task id, in words a teacher can act on', async () => {
    await expect(uploadTaskFile('c1', '', { name: 'x' })).rejects.toThrow(/Close the dialog and try again/)
  })
})

describe('classTasksKey', () => {
  it('is its own prefix, per class', () => {
    expect(classTasksKey('c1')).toEqual(['fs-class-tasks', 'c1'])
  })
})
