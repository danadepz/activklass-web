import { describe, expect, it } from 'vitest'
import { topicOptions, topicPatch } from './quizTopics'

const classes = [
  { id: 'c-newton', section: 'Newton', syllabus_id: null },
  { id: 'c-bsit', section: 'BSIT-C', syllabus_id: 'syl-1' },
  { id: 'c-bsit2', section: 'BSIT-D', syllabus_id: 'syl-1' },
]
const syl1 = { id: 'syl-1', data: { modules: [
  { id: 'm1', title: 'Exposure', topics: [{ id: 't-11', title: 'Framing' }, { id: 't-12', title: 'Light' }] },
] } }
const seeded = { id: null, data: { modules: [
  { id: 'm-a', title: 'Living Things', topics: [{ id: 't-a1', title: 'Respiration' }] },
] } }

describe('topicOptions', () => {
  it('lists every sub-module of the assigned class, labelled Module · Sub-module', () => {
    const opts = topicOptions(['c-bsit'], classes, { 'c-bsit': syl1 })
    expect(opts.map((o) => o.label)).toEqual(['Exposure · Framing', 'Exposure · Light'])
    expect(opts[0]).toMatchObject({ id: 't-11', module_id: 'm1', syllabus_id: 'syl-1' })
  })

  it('reads the seed\'s per-class syllabus too, with a null syllabus_id', () => {
    const opts = topicOptions(['c-newton'], classes, { 'c-newton': seeded })
    expect(opts).toEqual([{ id: 't-a1', label: 'Living Things · Respiration', module_id: 'm-a', syllabus_id: null }])
  })

  it('lists a syllabus shared by two classes once, with no class prefix', () => {
    const opts = topicOptions(['c-bsit', 'c-bsit2'], classes, { 'c-bsit': syl1, 'c-bsit2': syl1 })
    expect(opts).toHaveLength(2)
    expect(opts[0].label).toBe('Exposure · Framing')
  })

  it('prefixes the class section when the options come from different syllabi', () => {
    const opts = topicOptions(['c-newton', 'c-bsit'], classes, { 'c-newton': seeded, 'c-bsit': syl1 })
    expect(opts.map((o) => o.label)).toEqual([
      'Newton: Living Things · Respiration',
      'BSIT-C: Exposure · Framing',
      'BSIT-C: Exposure · Light',
    ])
  })

  it('is empty with no assigned class, or a class with no syllabus', () => {
    expect(topicOptions([], classes, {})).toEqual([])
    expect(topicOptions(['c-newton'], classes, { 'c-newton': { id: null, data: null } })).toEqual([])
  })
})

describe('topicPatch', () => {
  const opts = topicOptions(['c-bsit'], classes, { 'c-bsit': syl1 })

  it('writes the topic, its module and its syllabus', () => {
    expect(topicPatch('t-12', opts)).toEqual({ topic_id: 't-12', module_id: 'm1', syllabus_id: 'syl-1' })
  })

  it('clearing unfiles the quiz entirely', () => {
    expect(topicPatch('', opts, { topic_id: 't-12', module_id: 'm1', syllabus_id: 'syl-1' }))
      .toEqual({ topic_id: null, module_id: null, syllabus_id: null })
  })

  it('keeps a topic that is no longer among the options rather than dropping it', () => {
    // The class it came from was unticked; the link stays until the teacher
    // picks something else or clears it on purpose.
    expect(topicPatch('t-elsewhere', opts, { topic_id: 't-elsewhere', module_id: 'm9', syllabus_id: 'syl-9' }))
      .toEqual({ topic_id: 't-elsewhere', module_id: 'm9', syllabus_id: 'syl-9' })
  })
})
