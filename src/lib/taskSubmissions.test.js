/**
 * The submission bin's pure rules, and its one write against mocked
 * Firestore: the id is the pair, late is derived and strict, the sentence
 * matches the one lib/deliverables.js prints, and submitWork refuses a bad
 * attachment or a long note before writing anything.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const writes = []
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => ({ path: parts.join('/') }),
  setDoc: async (ref, data) => { writes.push([ref.path, data]) },
  serverTimestamp: () => 'TS',
}))
vi.mock('./firebase', () => ({ db: {} }))

const { submissionId, submittedAt, isLate, describeSubmission, submitWork, submissionFilePath } = await import('./taskSubmissions')
const { describeWindow, fromTask } = await import('./deliverables')

const NOW = new Date(2026, 8, 15, 10, 0) // Tue 15 Sep 2026, 10:00 local
const task = { id: 'k1', class_id: 'c1', kind: 'assignment', title: 'Lab 1', status: 'published', due_at: '2026-09-19T23:59', accepts_submissions: true }
const onTime = { submitted_at: new Date(2026, 8, 19, 15, 12) }
const late = { submitted_at: new Date(2026, 8, 20, 8, 5) }

beforeEach(() => { writes.length = 0 })

describe('submissionId', () => {
  it('is the pair, task first', () => {
    expect(submissionId('k1', 'S1')).toBe('k1_S1')
  })
})

describe('submittedAt', () => {
  it('reads a Timestamp, a Date, a number and a string, and null for nothing', () => {
    const d = new Date(2026, 8, 19, 15, 12)
    expect(submittedAt({ submitted_at: { toDate: () => d } })).toEqual(d)
    expect(submittedAt({ submitted_at: d })).toEqual(d)
    expect(submittedAt({ submitted_at: d.getTime() })).toEqual(d)
    expect(submittedAt({ submitted_at: d.toISOString() })).toEqual(d)
    expect(submittedAt({ submitted_at: null })).toBeNull()
    expect(submittedAt({})).toBeNull()
    expect(submittedAt({ submitted_at: 'not a date' })).toBeNull()
  })
})

describe('isLate', () => {
  it('is late only after the deadline, strictly', () => {
    expect(isLate(onTime, task)).toBe(false)
    expect(isLate(late, task)).toBe(true)
    expect(isLate({ submitted_at: new Date(2026, 8, 19, 23, 59) }, task)).toBe(false)
    expect(isLate({ submitted_at: new Date(2026, 8, 19, 23, 59, 30) }, task)).toBe(true)
  })
  it('is never late without a deadline or without a time', () => {
    expect(isLate(late, { ...task, due_at: null })).toBe(false)
    expect(isLate({ submitted_at: null }, task)).toBe(false)
  })
})

describe('describeSubmission', () => {
  it('says when, and late when late, and only Submitted while the server time is pending', () => {
    expect(describeSubmission(onTime, task, NOW)).toBe('Submitted · Sat 19 Sep, 3:12 PM')
    expect(describeSubmission(late, task, NOW)).toBe('Submitted · Sun 20 Sep, 8:05 AM · late')
    expect(describeSubmission({ submitted_at: null }, task, NOW)).toBe('Submitted')
  })
  it('is the same sentence the deliverable chip prints for a done task', () => {
    for (const sub of [onTime, late, { submitted_at: null }]) {
      const d = fromTask(task, { now: NOW, submission: sub })
      expect(d.state).toBe('done')
      expect(describeWindow(d, NOW)).toBe(describeSubmission(sub, task, NOW))
    }
  })
})

describe('submitWork', () => {
  const link = { title: 'My doc', resource_type: 'link', url: 'https://docs.google.com/document/d/abc' }

  it('writes the row at the pair id with the three identity fields, a server time, and a zero counter', async () => {
    await submitWork({ taskId: 'k1', classId: 'c1', studentId: 'S1', attachment: link, note: '  Done early. ' })
    expect(writes).toHaveLength(1)
    const [path, data] = writes[0]
    expect(path).toBe('task_submissions/k1_S1')
    expect(data).toEqual({
      task_id: 'k1', class_id: 'c1', student_id: 'S1',
      attachment: link, note: 'Done early.', submitted_at: 'TS', resubmitted_count: 0,
    })
  })

  it('a re-submit bumps the counter from the existing row and keeps the identity', async () => {
    await submitWork({ taskId: 'k1', classId: 'c1', studentId: 'S1', attachment: link, existing: { resubmitted_count: 2 } })
    expect(writes[0][1]).toMatchObject({ task_id: 'k1', class_id: 'c1', student_id: 'S1', resubmitted_count: 3 })
  })

  it('an untitled attachment is titled by its url', async () => {
    await submitWork({ taskId: 'k1', classId: 'c1', studentId: 'S1', attachment: { ...link, title: '' } })
    expect(writes[0][1].attachment.title).toBe(link.url)
  })

  it('refuses a bad link or a long note with a sentence, and writes nothing', async () => {
    await expect(submitWork({ taskId: 'k1', classId: 'c1', studentId: 'S1', attachment: { ...link, url: 'ftp://x' } }))
      .rejects.toThrow(/full web address/)
    await expect(submitWork({ taskId: 'k1', classId: 'c1', studentId: 'S1', attachment: link, note: 'x'.repeat(501) }))
      .rejects.toThrow(/too long/)
    expect(writes).toHaveLength(0)
  })
})

describe('submissionFilePath', () => {
  it('is the storage.rules path, student segment last but one', () => {
    expect(submissionFilePath('c1', 'k1', 'S1', 'lab.pdf')).toBe('task_files/c1/k1/submissions/S1/lab.pdf')
  })
})
