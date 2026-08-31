/**
 * A teacher's identity is never offered as a student to enrol.
 *
 * A tester opened Add Student in a class, typed 24231524 -- the school ID she
 * had registered her own TEACHER account on -- and the modal handed back a
 * pre-filled Grade 7 form for "Namocatcat, Abigail". The data check said
 * nothing was corrupt: users/rfBqRYUO3MXyH3gI4O3EwoVFSxf2 is a real teacher
 * carrying that number as verification_id_number, and
 * users/nKeke6KOTOcoU3qAjbU6FXZnwBD2 is a real student carrying the same
 * digits as student_number. Two legitimate documents, two different fields,
 * and nothing anywhere comparing them.
 *
 * So the case these lock down is the awkward one: the lookup SUCCEEDS and the
 * answer is still "no". A guard that only fired when no student matched would
 * have missed this report entirely.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// roster.js reaches Firestore for fetchUsersByIds and api.js reads the ID
// token off auth; neither is what is under test, so the SDK is stubbed rather
// than initialised.
vi.mock('./firebase', () => ({
  db: {},
  auth: { currentUser: { getIdToken: async () => 'test-token' } },
}))

const { findStudentsByNumber, findStudentByEmail, teacherAccountMessage } = await import('./roster')

const answers = (payload) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(payload),
  })))

const STUDENT = { id: 'nKeke', first_name: 'Abigail', last_name: 'Namocatcat', student_number: '24231524' }

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('a number that names both a student and a teacher', () => {
  it('reports the teacher alongside the student it found', async () => {
    answers({ students: [STUDENT], teacher_match: true })

    const res = await findStudentsByNumber('24231524')

    // Both facts survive: the caller refuses, but it knows who it refused over.
    expect(res.students).toEqual([STUDENT])
    expect(res.teacherMatch).toBe(true)
  })

  it('says so for an email too', async () => {
    answers({ students: [], teacher_match: true })

    const res = await findStudentByEmail('Kristine@Email.com')

    expect(res.student).toBeNull()
    expect(res.teacherMatch).toBe(true)
  })
})

describe('an ordinary student lookup', () => {
  it('is not flagged when only a student matches', async () => {
    answers({ students: [STUDENT], teacher_match: false })

    expect((await findStudentsByNumber('24231524')).teacherMatch).toBe(false)
    expect((await findStudentByEmail('abigail@email.com')).student).toEqual(STUDENT)
  })

  it('treats a server that never heard of the flag as no collision', async () => {
    // The deployed API is a separate repo on a separate restart. An older one
    // answering { students: [...] } must not read as "belongs to a teacher".
    answers({ students: [STUDENT] })

    expect((await findStudentsByNumber('24231524')).teacherMatch).toBe(false)
  })

  it('asks nothing at all for an empty box', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await findStudentsByNumber('  ')).toEqual({ students: [], teacherMatch: false })
    expect(await findStudentByEmail('')).toEqual({ student: null, teacherMatch: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('what the teacher is told', () => {
  it('names the ID, and the key that does not collide', () => {
    const msg = teacherAccountMessage('24231524')
    expect(msg).toMatch(/belongs to a teacher account/i)
    expect(msg).toMatch(/by email/i)
  })

  it('does not tell an email typist to try the email', () => {
    expect(teacherAccountMessage('kristine@email.com')).toMatch(/their own email address/i)
  })

  it('never leaks the teacher it matched', () => {
    // The endpoint returns the fact and no staff field; the message must not
    // invent one either. A roster search is not a directory of colleagues.
    for (const needle of ['24231524', 'kristine@email.com']) {
      expect(teacherAccountMessage(needle)).not.toMatch(/kristine|namocatcat/i)
    }
  })
})
