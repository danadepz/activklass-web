/**
 * Unit tests for the structural draft validation in ./aiDrafts.js.
 *
 * All pure -- no endpoint is called and no Gemini quota is spent, which is the
 * point: the 20/day generation limit makes these rules untestable any other way.
 *
 * The fixtures are shaped like real draft payloads: topics carry `objectives`
 * (what the generate endpoints return) or `learning_objectives` (what the saved
 * Firestore syllabus carries and the editor round-trips), and both keys are
 * exercised because consumers read `learning_objectives ?? objectives`.
 */
import { describe, expect, it } from 'vitest'
import {
  pruneModules,
  pruneTopics,
  topicProblem,
  validateModuleStructure,
  validateSyllabusStructure,
} from './aiDrafts.js'

const topic = (title, objectives = ['Identify a thing']) => ({
  title,
  objectives,
  melc_code: '',
})

const mod = (title, topics) => ({ title, description: '', topics })

/** Collect warnings the way ai.js does, so the array shape is under test too. */
const collect = () => []

describe('topicProblem', () => {
  it('accepts a topic with a title', () => {
    expect(topicProblem(topic('Quadratic Equations'))).toBeNull()
  })

  it('rejects an empty, blank or missing title', () => {
    expect(topicProblem({ title: '' })).toBe('empty title')
    expect(topicProblem({ title: '   ' })).toBe('empty title')
    expect(topicProblem({ title: '\n\t ' })).toBe('empty title')
    expect(topicProblem({})).toBe('empty title')
    expect(topicProblem(null)).toBe('empty title')
    expect(topicProblem(undefined)).toBe('empty title')
  })

  it('rejects a non-string title that trims to nothing', () => {
    expect(topicProblem({ title: null })).toBe('empty title')
  })

  it('does not reject a topic merely for having no objectives', () => {
    // A teacher can type objectives; they cannot type a row that has no title.
    expect(topicProblem({ title: 'Fractions', objectives: [] })).toBeNull()
  })
})

describe('pruneTopics — blank titles', () => {
  it('drops a blank-titled topic and keeps the rest', () => {
    const warnings = collect()
    const kept = pruneTopics(
      [topic('Fractions'), topic('   '), topic('Decimals')],
      '',
      warnings,
    )
    expect(kept.map((t) => t.title)).toEqual(['Fractions', 'Decimals'])
    expect(warnings).toEqual(['dropped 1 unusable topic(s): topic 2 (empty title).'])
  })

  it('numbers the dropped topics by their position in the original draft', () => {
    const warnings = collect()
    pruneTopics([topic(''), topic('Fractions'), topic(''), topic('Decimals')], '', warnings)
    expect(warnings[0]).toBe(
      'dropped 2 unusable topic(s): topic 1 (empty title), topic 3 (empty title).',
    )
  })

  it('prefixes warnings with the caller-supplied location', () => {
    const warnings = collect()
    pruneTopics([topic('')], 'Quarter 1: ', warnings)
    expect(warnings[0]).toBe('Quarter 1: dropped 1 unusable topic(s): topic 1 (empty title).')
  })

  it('trims a title that is merely padded rather than dropping it', () => {
    const warnings = collect()
    const kept = pruneTopics([topic('  Fractions  ')], '', warnings)
    expect(kept[0].title).toBe('Fractions')
    expect(warnings).toEqual([])
  })

  it('preserves every other field on a kept topic', () => {
    const kept = pruneTopics(
      [{ title: 'Fractions', objectives: ['Add'], melc_code: 'M10AL-Ia-1', week: 3 }],
      '',
      collect(),
    )
    expect(kept[0]).toEqual({
      title: 'Fractions',
      objectives: ['Add'],
      melc_code: 'M10AL-Ia-1',
      week: 3,
    })
  })

  it('handles a missing or non-array topics list', () => {
    expect(pruneTopics(undefined, '', collect())).toEqual([])
    expect(pruneTopics(null, '', collect())).toEqual([])
    expect(pruneTopics('not a list', '', collect())).toEqual([])
    expect(pruneTopics([], '', collect())).toEqual([])
  })

  it('adds no warnings for an empty list — the caller reports that', () => {
    const warnings = collect()
    pruneTopics([], '', warnings)
    expect(warnings).toEqual([])
  })
})

describe('pruneTopics — objectives', () => {
  it('warns when a topic has no objectives at all', () => {
    const warnings = collect()
    const kept = pruneTopics([topic('Fractions', [])], '', warnings)
    expect(kept).toHaveLength(1)
    expect(warnings[0]).toContain('no learning objectives on "Fractions"')
  })

  it('warns when every objective is blank, and strips them', () => {
    const warnings = collect()
    const kept = pruneTopics([topic('Fractions', ['', '   ', '\n'])], '', warnings)
    expect(kept[0].objectives).toEqual([])
    expect(warnings[0]).toContain('no learning objectives on "Fractions"')
  })

  it('strips only the blank entries when some are real', () => {
    const warnings = collect()
    const kept = pruneTopics([topic('Fractions', ['  Add  ', '', 'Subtract'])], '', warnings)
    expect(kept[0].objectives).toEqual(['Add', 'Subtract'])
    expect(warnings).toEqual([])
  })

  it('warns once per list, naming every topic that lacks objectives', () => {
    const warnings = collect()
    pruneTopics(
      [topic('Fractions', []), topic('Decimals', ['Convert']), topic('Percents', [])],
      '',
      warnings,
    )
    // One warning, not one per topic -- a draft with no objectives anywhere
    // would otherwise bury the drops and duplicates.
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('"Fractions", "Percents"')
    expect(warnings[0]).not.toContain('Decimals')
  })

  it('cleans learning_objectives when that is the key the draft carries', () => {
    const warnings = collect()
    const kept = pruneTopics(
      [{ title: 'Fractions', learning_objectives: ['Add', '  '] }],
      '',
      warnings,
    )
    expect(kept[0].learning_objectives).toEqual(['Add'])
    expect(kept[0]).not.toHaveProperty('objectives')
    expect(warnings).toEqual([])
  })

  it('prefers learning_objectives when a draft carries both keys', () => {
    // Consumers read `learning_objectives ?? objectives`, so cleaning the other
    // key would leave the blanks on display and the cleaned copy unread.
    const kept = pruneTopics(
      [{ title: 'Fractions', learning_objectives: ['Add', ''], objectives: ['stale'] }],
      '',
      collect(),
    )
    expect(kept[0].learning_objectives).toEqual(['Add'])
    expect(kept[0].objectives).toEqual(['stale'])
  })

  it('defaults to the objectives key when neither is present', () => {
    const warnings = collect()
    const kept = pruneTopics([{ title: 'Fractions' }], '', warnings)
    expect(kept[0].objectives).toEqual([])
    expect(warnings[0]).toContain('no learning objectives on "Fractions"')
  })

  it('wraps a bare string objective instead of discarding the text', () => {
    const kept = pruneTopics([topic('Fractions', 'Add and subtract fractions')], '', collect())
    expect(kept[0].objectives).toEqual(['Add and subtract fractions'])
  })

  it('drops an objective that is an object rather than stringifying it', () => {
    // String({}) is "[object Object]", which is truthy -- coercing would put
    // that literal text on the teacher's screen as a learning objective.
    const warnings = collect()
    const kept = pruneTopics([topic('Fractions', [{ text: 'Add' }, ['nested'], 'Subtract'])], '', warnings)
    expect(kept[0].objectives).toEqual(['Subtract'])
    expect(warnings).toEqual([])
  })

  it('keeps a numeric objective by coercing it', () => {
    const kept = pruneTopics([topic('Fractions', [1, 'Add'])], '', collect())
    expect(kept[0].objectives).toEqual(['1', 'Add'])
  })

  it('treats a non-list, non-string objectives value as none', () => {
    const warnings = collect()
    const kept = pruneTopics([{ title: 'Fractions', objectives: 42 }], '', warnings)
    expect(kept[0].objectives).toEqual([])
    expect(warnings[0]).toContain('no learning objectives')
  })

  it('does not warn about objectives on a topic it already dropped', () => {
    const warnings = collect()
    pruneTopics([topic('', [])], '', warnings)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('dropped 1 unusable topic(s)')
  })
})

describe('pruneTopics — duplicate titles', () => {
  it('warns about a duplicate title but keeps both topics', () => {
    const warnings = collect()
    const kept = pruneTopics(
      [topic('Fractions'), topic('Decimals'), topic('Fractions')],
      '',
      warnings,
    )
    // Both copies may carry distinct content and distinct MELC codes; deleting
    // one to tidy the tree is the worse error.
    expect(kept).toHaveLength(3)
    expect(warnings[0]).toBe(
      'duplicate topic title(s): "Fractions" (topics 1 and 3). Rename or merge before publishing.',
    )
  })

  it('matches duplicates case-insensitively and ignores spacing', () => {
    const warnings = collect()
    pruneTopics(
      [topic('Quadratic Equations'), topic('quadratic   equations')],
      '',
      warnings,
    )
    expect(warnings[0]).toContain('duplicate topic title(s)')
  })

  it('treats a padded duplicate as a duplicate', () => {
    const warnings = collect()
    pruneTopics([topic('Fractions'), topic('  Fractions  ')], '', warnings)
    expect(warnings[0]).toContain('(topics 1 and 2)')
  })

  it('reports a title repeated three times against the first occurrence', () => {
    const warnings = collect()
    pruneTopics([topic('Fractions'), topic('Fractions'), topic('Fractions')], '', warnings)
    expect(warnings[0]).toContain('(topics 1 and 2)')
    expect(warnings[0]).toContain('(topics 1 and 3)')
  })

  it('does not flag distinct titles', () => {
    const warnings = collect()
    pruneTopics([topic('Fractions'), topic('Decimals'), topic('Percents')], '', warnings)
    expect(warnings).toEqual([])
  })

  it('counts positions from the original draft, including dropped topics', () => {
    const warnings = collect()
    pruneTopics([topic('Fractions'), topic(''), topic('Fractions')], '', warnings)
    expect(warnings.join(' ')).toContain('(topics 1 and 3)')
  })
})

describe('pruneModules', () => {
  it('reports a module that arrived with no topics', () => {
    const warnings = collect()
    const shaped = pruneModules([mod('Quarter 1', [])], warnings)
    expect(shaped[0].topics).toEqual([])
    expect(warnings).toEqual(['Quarter 1 has no topics.'])
  })

  it('distinguishes a module emptied by pruning from one that arrived empty', () => {
    const warnings = collect()
    pruneModules([mod('Quarter 1', [topic(''), topic('  ')])], warnings)
    expect(warnings).toContain('Quarter 1 has no usable topics left — all 2 were dropped.')
  })

  it('reports a missing topics array as no topics', () => {
    const warnings = collect()
    const shaped = pruneModules([{ title: 'Quarter 1' }], warnings)
    expect(shaped[0].topics).toEqual([])
    expect(warnings).toEqual(['Quarter 1 has no topics.'])
  })

  it('warns about a blank module title and labels it by position', () => {
    const warnings = collect()
    const shaped = pruneModules([mod('  ', [topic('')])], warnings)
    expect(shaped[0].title).toBe('')
    expect(warnings[0]).toBe('Module 1 has no title.')
    expect(warnings[1]).toContain('Module 1: dropped 1 unusable topic(s)')
  })

  it('scopes topic warnings to the module they came from', () => {
    const warnings = collect()
    pruneModules(
      [mod('Quarter 1', [topic('')]), mod('Quarter 2', [topic('Fractions', [])])],
      warnings,
    )
    expect(warnings[0]).toContain('Quarter 1: dropped 1 unusable topic(s)')
    expect(warnings[1]).toBe('Quarter 1 has no usable topics left — all 1 were dropped.')
    expect(warnings[2]).toContain('Quarter 2: no learning objectives on "Fractions"')
  })

  it('scopes duplicate detection to one module', () => {
    const warnings = collect()
    // "Review" in every quarter is legitimate; the same title twice inside one
    // quarter is not.
    pruneModules(
      [mod('Quarter 1', [topic('Review')]), mod('Quarter 2', [topic('Review')])],
      warnings,
    )
    expect(warnings).toEqual([])
  })

  it('flags a duplicate within a single module', () => {
    const warnings = collect()
    pruneModules([mod('Quarter 1', [topic('Review'), topic('Review')])], warnings)
    expect(warnings[0]).toContain('Quarter 1: duplicate topic title(s): "Review" (topics 1 and 2)')
  })

  it('never drops a module, so positions stay aligned for MELC labelling', () => {
    const warnings = collect()
    const shaped = pruneModules(
      [mod('Quarter 1', []), mod('Quarter 2', [topic('Fractions')]), mod('Quarter 3', [])],
      warnings,
    )
    expect(shaped).toHaveLength(3)
    expect(shaped.map((m) => m.title)).toEqual(['Quarter 1', 'Quarter 2', 'Quarter 3'])
  })

  it('trims module titles and preserves other module fields', () => {
    const shaped = pruneModules(
      [{ title: '  Quarter 1  ', description: 'Intro', weeks: 9, topics: [topic('Fractions')] }],
      collect(),
    )
    expect(shaped[0]).toMatchObject({ title: 'Quarter 1', description: 'Intro', weeks: 9 })
  })

  it('handles a missing or non-array modules list', () => {
    expect(pruneModules(undefined, collect())).toEqual([])
    expect(pruneModules('nope', collect())).toEqual([])
  })
})

describe('validateSyllabusStructure', () => {
  const good = {
    title: 'Math 10',
    modules: [
      mod('Quarter 1', [topic('Fractions'), topic('Decimals')]),
      mod('Quarter 2', [topic('Percents')]),
    ],
  }

  it('returns the shaped modules and no warnings for a clean draft', () => {
    const { modules, warnings } = validateSyllabusStructure(good)
    expect(warnings).toEqual([])
    expect(modules.map((m) => m.topics.length)).toEqual([2, 1])
  })

  it('drops blank topics across modules and reports every problem at once', () => {
    const draft = {
      modules: [
        mod('Quarter 1', [topic('Fractions'), topic(''), topic('Fractions')]),
        mod('Quarter 2', []),
        mod('', [topic('Percents', [])]),
      ],
    }
    const { modules, warnings } = validateSyllabusStructure(draft)
    expect(modules[0].topics.map((t) => t.title)).toEqual(['Fractions', 'Fractions'])
    const joined = warnings.join(' | ')
    expect(joined).toContain('Quarter 1: dropped 1 unusable topic(s): topic 2 (empty title).')
    expect(joined).toContain('Quarter 1: duplicate topic title(s): "Fractions" (topics 1 and 3)')
    expect(joined).toContain('Quarter 2 has no topics.')
    expect(joined).toContain('Module 3 has no title.')
    expect(joined).toContain('Module 3: no learning objectives on "Percents"')
  })

  it('survives on the modules that still have usable topics', () => {
    const draft = { modules: [mod('Quarter 1', [topic('')]), mod('Quarter 2', [topic('Percents')])] }
    const { modules } = validateSyllabusStructure(draft)
    expect(modules[0].topics).toEqual([])
    expect(modules[1].topics.map((t) => t.title)).toEqual(['Percents'])
  })

  it('throws when no module has a usable topic', () => {
    const draft = { modules: [mod('Quarter 1', [topic('')]), mod('Quarter 2', [])] }
    expect(() => validateSyllabusStructure(draft)).toThrow(
      /returned 2 module\(s\), none with a usable topic/,
    )
  })

  it('throws when the draft has no modules array', () => {
    expect(() => validateSyllabusStructure({})).toThrow(/no modules/)
    expect(() => validateSyllabusStructure(undefined)).toThrow(/no modules/)
    expect(() => validateSyllabusStructure({ modules: 'nope' })).toThrow(/no modules/)
  })

  it('throws rather than returning an empty tree for an empty modules array', () => {
    expect(() => validateSyllabusStructure({ modules: [] })).toThrow(
      /returned 0 module\(s\), none with a usable topic/,
    )
  })

  it('does not mutate the draft it was given', () => {
    const draft = { modules: [mod('Quarter 1', [topic('  Fractions  ', ['', 'Add'])])] }
    const snapshot = structuredClone(draft)
    validateSyllabusStructure(draft)
    expect(draft).toEqual(snapshot)
  })
})

describe('validateModuleStructure', () => {
  it('returns the shaped topics and no warnings for a clean draft', () => {
    const draft = { title: 'Quarter 3', topics: [topic('Fractions'), topic('Decimals')] }
    const { topics, warnings } = validateModuleStructure(draft)
    expect(topics.map((t) => t.title)).toEqual(['Fractions', 'Decimals'])
    expect(warnings).toEqual([])
  })

  it('drops blank topics and warns unprefixed — there is only one module', () => {
    const draft = { topics: [topic('Fractions'), topic(''), topic('Fractions', [])] }
    const { topics, warnings } = validateModuleStructure(draft)
    expect(topics).toHaveLength(2)
    expect(warnings[0]).toBe('dropped 1 unusable topic(s): topic 2 (empty title).')
    expect(warnings[1]).toContain('duplicate topic title(s): "Fractions" (topics 1 and 3)')
    expect(warnings[2]).toContain('no learning objectives on "Fractions"')
  })

  it('throws when no topic is usable', () => {
    expect(() => validateModuleStructure({ topics: [topic(''), topic('  ')] })).toThrow(
      /returned 2 topic\(s\), none of them usable/,
    )
  })

  it('throws when the draft has no topics array', () => {
    expect(() => validateModuleStructure({})).toThrow(/no topics/)
    expect(() => validateModuleStructure(undefined)).toThrow(/no topics/)
  })

  it('does not mutate the draft it was given', () => {
    const draft = { topics: [topic('  Fractions  ', ['', 'Add'])] }
    const snapshot = structuredClone(draft)
    validateModuleStructure(draft)
    expect(draft).toEqual(snapshot)
  })
})
