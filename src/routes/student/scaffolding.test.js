import { describe, it, expect } from 'vitest'
import { findTopic, resourceState, topicAnchorId, topicHref, topicLocation } from './scaffolding'

const syllabus = {
  modules: [
    { id: 'm1', title: 'Number Sense', topics: [{ id: 't1', title: 'Fractions' }] },
    {
      id: 'm2',
      title: 'Data Structures',
      topics: [
        { id: 't2', title: 'Arrays', resources: [] },
        { id: 't3', title: 'Linked Lists', resources: [{ id: 'r1', resource_type: 'link', url: 'https://x' }, { id: 'r2', resource_type: 'rich_text', content_markdown: 'hi' }] },
      ],
    },
  ],
}

describe('scaffolding — where a scaffolded topic sits in the modules', () => {
  it('finds the topic with its module and 1-based positions', () => {
    const found = findTopic(syllabus, 't3')
    expect(found.module.id).toBe('m2')
    expect(found.topic.id).toBe('t3')
    expect(found.moduleNo).toBe(2)
    expect(found.topicNo).toBe(2)
  })

  it('labels the location the way the Modules tab does', () => {
    const loc = topicLocation(syllabus, 't3')
    expect(loc.moduleLabel).toBe('Module 2')
    expect(loc.moduleTitle).toBe('Data Structures')
    expect(loc.topicLabel).toBe('Sub-module 2')
    expect(loc.topicTitle).toBe('Linked Lists')
    expect(loc.resourceCount).toBe(2)
  })

  it('falls back to the positional name when a title is blank', () => {
    const syl = { modules: [{ id: 'm', title: '', topics: [{ id: 't', title: '' }] }] }
    const loc = topicLocation(syl, 't')
    expect(loc.moduleTitle).toBe('Module 1')
    expect(loc.topicTitle).toBe('Sub-module 1')
  })

  it('is null for a missing topic, a missing syllabus, or no topic id', () => {
    expect(topicLocation(syllabus, 'nope')).toBeNull()
    expect(topicLocation(null, 't1')).toBeNull()
    expect(topicLocation(syllabus, null)).toBeNull()
  })

  it('numbers modules as the student sees them, after unpublished ones are filtered', () => {
    // loadSyllabus drops unpublished modules before this code runs, so the
    // numbering must follow the filtered list, not the teacher's full one.
    const filtered = { modules: syllabus.modules.filter((m) => m.id !== 'm1') }
    expect(topicLocation(filtered, 't2').moduleLabel).toBe('Module 1')
  })

  it('builds the link and the anchor the class page reads', () => {
    expect(topicHref('c9', 't3')).toBe('/student/classes/c9?tab=topics&topic=t3')
    expect(topicHref('c9', null)).toBe('/student/classes/c9?tab=topics')
    expect(topicAnchorId('t3')).toBe('topic-t3')
  })
})

describe('scaffolding — whether a resource opens', () => {
  it('opens an uploaded file by its download URL, and explains one that never uploaded', () => {
    expect(resourceState({ resource_type: 'file', url: 'https://firebasestorage.googleapis.com/x.pdf' })).toEqual({ available: true })
    const dead = resourceState({ resource_type: 'file', url: '' })
    expect(dead.available).toBe(false)
    expect(dead.reason).toMatch(/never uploaded/)
  })

  it('needs an address for a link and text for a study note', () => {
    expect(resourceState({ resource_type: 'link', url: 'https://x' }).available).toBe(true)
    expect(resourceState({ resource_type: 'link', url: '' }).available).toBe(false)
    expect(resourceState({ resource_type: 'rich_text', content_markdown: ' ' }).available).toBe(false)
    expect(resourceState({ resource_type: 'video' }).available).toBe(false)
  })
})
