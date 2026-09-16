/**
 * The class record's slice of the Logs page (T-64, triplecookiemonster-83).
 *
 * Kristine added an assessment and typed a score on MATH101 · 1A's record
 * and neither showed up in Logs -- the page read quizzes, attendance and
 * setup changes, never gradebooks/{classId}/assessments. These lock the
 * event shaping that fixes it.
 */
import { describe, expect, it } from 'vitest'
import { assessmentEvents, overrideEvents } from './historyEvents.js'

describe('assessmentEvents', () => {
  it('reports a new assessment from its own created_at', () => {
    const events = assessmentEvents({
      title: 'Quiz-Fractions',
      total_points: 10,
      created_at: '2026-09-14T08:00:00.000Z',
    })
    expect(events).toEqual([
      { ts: new Date('2026-09-14T08:00:00.000Z'), kind: 'record', actor: 'You', summary: 'Added assessment · Quiz-Fractions', detail: '/10' },
    ])
  })

  it('reports a typed score as "Scores recorded", one event per change entry', () => {
    const events = assessmentEvents({
      title: 'Quiz-Fractions',
      total_points: 10,
      changes: [{ at: '2026-09-14T08:05:00.000Z', student_ids: ['chan'], by: 'teacher-1' }],
    })
    expect(events).toEqual([
      { ts: new Date('2026-09-14T08:05:00.000Z'), kind: 'record', actor: 'You', summary: 'Scores recorded · Quiz-Fractions · 1 student', detail: null },
    ])
  })

  it('pluralises the student count', () => {
    const [event] = assessmentEvents({
      title: 'Quiz-Fractions',
      changes: [{ at: '2026-09-14T08:05:00.000Z', student_ids: ['chan', 'ong'] }],
    })
    expect(event.summary).toBe('Scores recorded · Quiz-Fractions · 2 students')
  })

  it('emits both the creation and every score change on the same column', () => {
    const events = assessmentEvents({
      title: 'Quiz-Fractions',
      total_points: 10,
      created_at: '2026-09-14T08:00:00.000Z',
      changes: [
        { at: '2026-09-14T08:05:00.000Z', student_ids: ['chan'] },
        { at: '2026-09-14T09:00:00.000Z', student_ids: ['ong', 'lim'] },
      ],
    })
    expect(events).toHaveLength(3)
    expect(events.map((e) => e.summary)).toEqual([
      'Added assessment · Quiz-Fractions',
      'Scores recorded · Quiz-Fractions · 1 student',
      'Scores recorded · Quiz-Fractions · 2 students',
    ])
  })

  it('reports a posted quiz sync only for a quiz-linked column', () => {
    const linked = assessmentEvents({ title: 'Chapter 3', source_quiz_id: 'q1', synced_at: '2026-09-14T08:00:00.000Z' })
    expect(linked).toEqual([
      { ts: new Date('2026-09-14T08:00:00.000Z'), kind: 'record', actor: 'You', summary: 'Quiz scores posted · Chapter 3', detail: null },
    ])

    // A hand-typed column can carry a stray synced_at from nowhere real --
    // it must never be read without source_quiz_id proving it came from a sync.
    const handTyped = assessmentEvents({ title: 'Chapter 3', synced_at: '2026-09-14T08:00:00.000Z' })
    expect(handTyped).toEqual([])
  })

  it('is silent on an assessment with no timestamped activity', () => {
    expect(assessmentEvents({ title: 'Untouched' })).toEqual([])
  })

  it('skips a change entry whose timestamp cannot be read', () => {
    const events = assessmentEvents({ title: 'Quiz-Fractions', changes: [{ student_ids: ['chan'] }] })
    expect(events).toEqual([])
  })

  it('falls back to a title when none is set', () => {
    const [event] = assessmentEvents({ created_at: '2026-09-14T08:00:00.000Z' })
    expect(event.summary).toBe('Added assessment · Untitled')
  })
})

describe('overrideEvents', () => {
  const gb = {
    periods: [{ id: 'q1', name: 'Quarter 1' }],
    override_changes: [{ at: '2026-09-14T10:00:00.000Z', period_id: 'q1', student_ids: ['chan'] }],
  }
  const nameById = { chan: 'Chan, Maria' }

  it('names the student and the period from the roster and the gradebook', () => {
    expect(overrideEvents(gb, nameById)).toEqual([
      { ts: new Date('2026-09-14T10:00:00.000Z'), kind: 'record', actor: 'You', summary: 'Override set · Chan, Maria', detail: 'Quarter 1' },
    ])
  })

  it('joins several students touched by the same save', () => {
    const [event] = overrideEvents(
      { ...gb, override_changes: [{ at: '2026-09-14T10:00:00.000Z', period_id: 'q1', student_ids: ['chan', 'ong'] }] },
      { chan: 'Chan, Maria', ong: 'Ong, Rico' },
    )
    expect(event.summary).toBe('Override set · Chan, Maria, Ong, Rico')
  })

  it('falls back when a student or period is not in the map it was given', () => {
    const [event] = overrideEvents(gb, {})
    expect(event.summary).toBe('Override set · A student')
    expect(event.detail).toBe('Quarter 1')
  })

  it('is empty for a gradebook with no override history', () => {
    expect(overrideEvents({ periods: [] })).toEqual([])
    expect(overrideEvents(null)).toEqual([])
  })
})
