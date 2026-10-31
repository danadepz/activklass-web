/**
 * Phase 2 §3 — the template layer's pure half.
 *
 * The property this file exists to pin is the one §3 asks for directly:
 * **editing a template must never change a class configured from it earlier.**
 * That holds structurally — a template carries a configuration and nothing
 * else, and `setupFromTemplate` only ever produces editor rows — so what is
 * tested here is that the round trip is lossless (component ids survive, which
 * is what keeps recorded scores attached to their columns) and that nothing in
 * this module can reach a class.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({ api: vi.fn(async () => ({ templates: [], available: true })) }))

const {
  countClassesUsing,
  describeTemplate,
  setupFromTemplate,
  templateFromSetup,
} = await import('./gradingTemplates.js')

const LAB_TEMPLATE = {
  id: 't1',
  name: 'College — Lecture with Lab',
  description: 'CIT-U style',
  scope: 'school',
  grading_mode: 'ched_percentage',
  grading_structure: 'lecture_lab',
  lab_weight_percent: 100 / 3,
  passing_percent: 60,
  point_scale_direction: 'inverted',
  periods: [
    { id: 'p-mid', name: 'Midterm', weight_percent: 50 },
    { id: 'p-fin', name: 'Finals', weight_percent: 50 },
  ],
  components: [
    { id: 'c-cs', name: 'Class Standing', weight_percent: 60, track: 'lecture' },
    { id: 'c-lx', name: 'Lab Exercise', weight_percent: 70, track: 'lab', required: true },
    { id: 'c-le', name: 'Lab Exam', weight_percent: 30, track: 'lab', required: true },
  ],
}

describe('a template round-trips without losing identity', () => {
  it('keeps every component and period id', () => {
    const setup = setupFromTemplate(LAB_TEMPLATE)
    expect(setup.components.map((c) => c.id)).toEqual(['c-cs', 'c-lx', 'c-le'])
    expect(setup.periods.map((p) => p.id)).toEqual(['p-mid', 'p-fin'])
  })

  it('keeps the track and required flags that make a lab component a lab component', () => {
    const setup = setupFromTemplate(LAB_TEMPLATE)
    expect(setup.components[1]).toMatchObject({ track: 'lab', required: true })
    expect(setup.components[0].track).toBe('lecture')
    expect(setup.components[0].required).toBeUndefined()
  })

  it('leaves an absent track absent, which lib/grading.js reads as lecture', () => {
    const setup = setupFromTemplate({
      periods: [], components: [{ id: 'c-old', name: 'Written Works', weight_percent: 30 }],
    })
    expect(setup.components[0].track).toBeUndefined()
  })

  it('carries the structure, ratio, pass mark and scale direction', () => {
    const setup = setupFromTemplate(LAB_TEMPLATE)
    expect(setup.grading_structure).toBe('lecture_lab')
    expect(setup.lab_weight_percent).toBeCloseTo(100 / 3, 10)
    expect(setup.passing_percent).toBe(60)
    expect(setup.point_scale_direction).toBe('inverted')
    expect(setup.grading_mode).toBe('ched_percentage')
  })

  it('turns weights into the strings the editors hold', () => {
    const setup = setupFromTemplate(LAB_TEMPLATE)
    expect(setup.components.map((c) => c.weight_percent)).toEqual(['60', '70', '30'])
  })

  it('defaults a template saved before these fields existed to lecture only', () => {
    const setup = setupFromTemplate({ name: 'old', periods: [], components: [] })
    expect(setup.grading_structure).toBe('lecture_only')
    expect(setup.grading_mode).toBe('deped_k12')
    expect(setup.components).toEqual([])
  })

  it('survives a template with no archived components', () => {
    expect(setupFromTemplate(LAB_TEMPLATE).archived_lab_components).toEqual([])
  })
})

describe('building a template body from the form', () => {
  const base = {
    name: 'My setup',
    gradingMode: 'ched_percentage',
    structure: 'lecture_lab',
    labWeight: '33.33',
    passingPercent: '75',
    scaleDirection: 'ched',
    periods: [{ id: 'p1', name: 'Midterm', weight_percent: 100 }],
    components: [{ id: 'c1', name: 'CS', weight_percent: 100, track: 'lecture' }],
  }

  it('sends the laboratory share only when the structure uses one', () => {
    expect(templateFromSetup(base).lab_weight_percent).toBeCloseTo(33.33, 5)
    const lectureOnly = templateFromSetup({ ...base, structure: 'lecture_only' })
    expect(lectureOnly.lab_weight_percent).toBeUndefined()
    expect(lectureOnly.grading_structure).toBe('lecture_only')
  })

  it('defaults the scope to private, never school', () => {
    expect(templateFromSetup(base).scope).toBe('private')
  })

  it('omits an unfinished pass mark rather than sending an empty string', () => {
    expect(templateFromSetup({ ...base, passingPercent: '' }).passing_percent).toBeUndefined()
  })

  it('carries archived laboratory components when the structure is switched off', () => {
    const body = templateFromSetup({
      ...base,
      structure: 'lecture_only',
      archivedLabComponents: [{ id: 'c-lx', name: 'Lab Exercise', weight_percent: 100, track: 'lab' }],
    })
    expect(body.archived_lab_components).toHaveLength(1)
    expect(body.archived_lab_components[0].id).toBe('c-lx')
  })

  it('round-trips form -> body -> form with the ids intact', () => {
    const body = templateFromSetup(base)
    const back = setupFromTemplate(body)
    expect(back.components.map((c) => c.id)).toEqual(['c1'])
    expect(back.periods.map((p) => p.id)).toEqual(['p1'])
    expect(back.grading_structure).toBe('lecture_lab')
  })
})

describe('how many classes use a template', () => {
  const gb = (ids) => ({ components: ids.map((id) => ({ id })) })

  it('counts a class that carries every component of the template', () => {
    const books = [gb(['c-cs', 'c-lx', 'c-le']), gb(['c-cs', 'c-lx', 'c-le', 'extra'])]
    expect(countClassesUsing(LAB_TEMPLATE, books)).toBe(2)
  })

  it('does not count a class that only partly matches', () => {
    expect(countClassesUsing(LAB_TEMPLATE, [gb(['c-cs'])])).toBe(0)
  })

  it('does not count an unconfigured class', () => {
    expect(countClassesUsing(LAB_TEMPLATE, [gb([])])).toBe(0)
  })

  it('is zero with nothing to compare', () => {
    expect(countClassesUsing(LAB_TEMPLATE, [])).toBe(0)
    expect(countClassesUsing(null, [gb(['c-cs'])])).toBe(0)
    expect(countClassesUsing({ components: [] }, [gb(['c-cs'])])).toBe(0)
  })
})

describe('the card summary line', () => {
  it('describes a laboratory template', () => {
    expect(describeTemplate(LAB_TEMPLATE)).toBe('2 periods · 3 components · Lecture with Laboratory')
  })

  it('describes a lecture-only template and singularises', () => {
    expect(describeTemplate({ periods: [{}], components: [{}] }))
      .toBe('1 period · 1 component · Lecture only')
  })
})
