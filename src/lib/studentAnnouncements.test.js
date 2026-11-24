import { describe, expect, it, vi } from 'vitest'

vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ collection: name }),
  where: (field, op, value) => ({ field, op, value }),
  query: (base, ...filters) => ({ ...base, filters }),
}))

const { announcementTeacherId, studentAnnouncementsQuery } = await import('./studentAnnouncements')

describe('announcementTeacherId', () => {
  it('accepts an ordinary uid', () => {
    expect(announcementTeacherId('teacher-1')).toBe('teacher-1')
    expect(announcementTeacherId('Zx9AbCdEf0123456789xyzABCD12')).toBe('Zx9AbCdEf0123456789xyzABCD12')
  })

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['a number', 42],
    ['an object', { id: 't' }],
    ['whitespace', ' teacher-1'],
    ['a path', 'users/teacher-1'],
    ['too long', 'x'.repeat(129)],
  ])('refuses %s', (_label, value) => {
    expect(announcementTeacherId(value)).toBeNull()
  })
})

describe('studentAnnouncementsQuery', () => {
  it('filters by class_id and by the class teacher, nothing else', () => {
    expect(studentAnnouncementsQuery({}, 'class-1', 'teacher-1')).toEqual({
      collection: 'announcements',
      filters: [
        { field: 'class_id', op: '==', value: 'class-1' },
        { field: 'teacher_id', op: '==', value: 'teacher-1' },
      ],
    })
  })

  it('returns null rather than a doomed query when the teacher id is unusable', () => {
    expect(studentAnnouncementsQuery({}, 'class-1', undefined)).toBeNull()
    expect(studentAnnouncementsQuery({}, 'class-1', '')).toBeNull()
    expect(studentAnnouncementsQuery({}, 'class-1', 'a/b')).toBeNull()
  })

  it('returns null without a class id', () => {
    expect(studentAnnouncementsQuery({}, '', 'teacher-1')).toBeNull()
    expect(studentAnnouncementsQuery({}, undefined, 'teacher-1')).toBeNull()
  })
})
