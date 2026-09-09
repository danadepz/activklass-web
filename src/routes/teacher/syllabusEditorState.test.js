/**
 * The state the syllabus editor opens with (T-39, triplecookiemonster-54).
 *
 * The tester re-assigned her syllabi to their classes after every edit: opening
 * a saved syllabus rebuilt the editor's state through `toDraftState`, which
 * returned title/description/source/modules and dropped `class_ids`. Every
 * checkbox rendered unticked, and save wrote that emptiness back — clearing
 * `classes.syllabus_id`, which is how a student reads a syllabus at all.
 *
 * So what is pinned here is the assignment surviving the round trip into the
 * editor. Without the fix the first test fails on an empty array.
 */
import { describe, it, expect } from 'vitest'
import { toDraftState } from './syllabus'

const STORED = {
  id: 'syl-1',
  title: 'G10 Math Syllabus',
  description: 'Grade 10 mathematics',
  source: 'manual',
  class_ids: ['class-a', 'class-b'],
  modules: [{ id: 'm1', title: 'Module 1', description: 'Intro', topics: [] }],
}

describe('toDraftState — what the editor opens with', () => {
  it('carries the classes a saved syllabus is assigned to', () => {
    expect(toDraftState(STORED, STORED.source).class_ids).toEqual(['class-a', 'class-b'])
  })

  it('opens unassigned when the syllabus has no classes', () => {
    expect(toDraftState({ title: 'g10' }, 'manual').class_ids).toEqual([])
  })

  it('leaves a generated tree unassigned, for the draft path to fill in', () => {
    const generated = { title: 'AI draft', modules: [{ title: 'M1', topics: [] }] }
    expect(toDraftState(generated, 'ai_generated').class_ids).toEqual([])
  })
})
