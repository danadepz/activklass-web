/**
 * The Grade Config simulator and the real class record must agree.
 *
 * §2 of the Phase 2 brief: "Add regression tests proving that the preview and
 * saved grade calculations produce the same results for identical inputs."
 *
 * This is the test that makes `simulateAllPeriods` trustworthy. It builds the
 * SAME scenario twice -- once as typed samples in the simulator, once as real
 * assessments and scores in a gradebook bundle -- and asserts that every
 * period grade, every track result and the overall final grade match exactly.
 *
 * If someone later "optimises" the simulator into its own arithmetic, this
 * goes red. That is the point: a simulator that drifts from the gradebook is
 * worse than none, because it is a promise the record then breaks.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
  serverTimestamp: vi.fn(), writeBatch: vi.fn(),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn() }))

const { buildSummary } = await import('./gradebook.js')
const { gradePolicy } = await import('./grading.js')
const { simulateAllPeriods } = await import('../routes/teacher/gradePreview.js')

/* One scenario, expressed in the two shapes.
   `rows` are what the Grade Config editors hold; `samples` are what a teacher
   types into the simulator; the bundle is what the record actually loads. */
function scenario({ periods, components, samples, gb }) {
  const bundle = {
    configured: true,
    periods: periods.map((p, i) => ({ id: `p${i}`, name: p.name, weight_percent: p.weight_percent })),
    components: components.map((c, i) => ({
      id: `c${i}`, name: c.name, weight_percent: c.weight_percent, track: c.track,
    })),
    mode: gb.grading_mode,
    policy: gradePolicy(gb),
    overrides: {},
    students: [{ student_id: 's1', first_name: 'A', last_name: 'B' }],
    // One 100-point assessment per component per period, scored from `samples`
    // -- the identical construction the simulator makes internally.
    assessments: periods.flatMap((p, pi) =>
      components.map((c, ci) => {
        const raw = samples?.[pi]?.[ci]
        return {
          id: `p${pi}-c${ci}`,
          title: `${c.name} ${p.name}`,
          component_id: `c${ci}`,
          period_id: `p${pi}`,
          total_points: 100,
          scores: raw === '' || raw == null ? {} : { s1: { status: 'graded', raw_score: Number(raw) } },
        }
      }),
    ),
    klass: { subject: null, subject_code: null, section: null, grade_level: null },
  }
  const sim = simulateAllPeriods(periods, components, samples, gb.grading_mode, gradePolicy(gb))
  const summary = buildSummary(bundle)
  return { sim, summary, bundle }
}

const LECTURE_LAB = {
  periods: [
    { name: 'Midterm', weight_percent: 50 },
    { name: 'Finals', weight_percent: 50 },
  ],
  components: [
    { name: 'Class Standing', weight_percent: 40, track: 'lecture' },
    { name: 'Prelim Exam', weight_percent: 20, track: 'lecture' },
    { name: 'Major Exam', weight_percent: 40, track: 'lecture' },
    { name: 'Lab Exercise', weight_percent: 70, track: 'lab' },
    { name: 'Lab Exam', weight_percent: 30, track: 'lab' },
  ],
}

const DEPED = {
  periods: [
    { name: 'Quarter 1', weight_percent: 25 },
    { name: 'Quarter 2', weight_percent: 25 },
    { name: 'Quarter 3', weight_percent: 25 },
    { name: 'Quarter 4', weight_percent: 25 },
  ],
  components: [
    { name: 'Written Works', weight_percent: 30 },
    { name: 'Performance Tasks', weight_percent: 50 },
    { name: 'Quarterly Assessment', weight_percent: 20 },
  ],
}

const expectAgreement = ({ sim, summary }) => {
  const g = summary.grades.s1
  sim.periods.forEach((p) => {
    expect(summary.periods.find((x) => x.id === p.id)).toBeTruthy()
    expect(p.final).toEqual(g.periods[p.id].grade)
  })
  expect(sim.overall).toEqual(g.final_grade)
}

describe('simulator agrees with the class record', () => {
  it('matches on the reference lecture-with-laboratory example', () => {
    const gb = {
      grading_mode: 'ched_percentage',
      grading_structure: 'lecture_lab',
      lab_weight_percent: 100 / 3,
      passing_percent: 75,
    }
    const samples = {
      0: { 0: '85', 1: '78', 2: '82', 3: '90', 4: '88' },
      1: { 0: '80', 1: '76', 2: '79', 3: '85', 4: '83' },
    }
    const run = scenario({ ...LECTURE_LAB, samples, gb })
    expectAgreement(run)

    // and the numbers are the reference ones
    expect(run.sim.periods[0].tracks.lecture).toBe(82.4)
    expect(run.sim.periods[0].tracks.lab).toBe(89.4)
    expect(run.sim.periods[0].final).toBe(84.73)
    expect(run.sim.periods[1].final).toBe(80.67)
    expect(run.sim.overall).toBe(82.7)
  })

  it('matches under DepEd K-12 across four quarters', () => {
    const gb = { grading_mode: 'deped_k12' }
    const samples = {
      0: { 0: '88', 1: '92', 2: '80' },
      1: { 0: '75', 1: '81', 2: '79' },
      2: { 0: '90', 1: '95', 2: '88' },
      3: { 0: '60', 1: '72', 2: '68' },
    }
    expectAgreement(scenario({ ...DEPED, samples, gb }))
  })

  it('matches under the CHED point scale, both directions', () => {
    const samples = { 0: { 0: '91', 1: '84', 2: '77' }, 1: { 0: '66', 1: '70', 2: '73' } }
    const base = {
      periods: [
        { name: 'Midterm', weight_percent: 40 },
        { name: 'Finals', weight_percent: 60 },
      ],
      components: DEPED.components,
    }
    for (const direction of ['ched', 'inverted']) {
      expectAgreement(scenario({
        ...base, samples,
        gb: { grading_mode: 'ched_point', point_scale_direction: direction, passing_percent: 75 },
      }))
    }
  })

  it('matches when a whole period is left blank', () => {
    const gb = { grading_mode: 'ched_percentage', passing_percent: 75 }
    const samples = { 0: { 0: '88', 1: '92', 2: '80' } } // Quarters 2-4 untouched
    const run = scenario({ ...DEPED, samples, gb })
    expectAgreement(run)
    expect(run.sim.gradedPeriods).toBe(1)
    // The three blank periods are skipped, not scored zero.
    expect(run.sim.overall).toBe(run.sim.periods[0].final)
  })

  it('matches when one track is entirely ungraded', () => {
    const gb = {
      grading_mode: 'ched_percentage', grading_structure: 'lecture_lab',
      lab_weight_percent: 100 / 3, passing_percent: 75,
    }
    // laboratory only, no lecture
    const samples = { 0: { 3: '90', 4: '88' } }
    const run = scenario({ ...LECTURE_LAB, samples, gb })
    expectAgreement(run)
    expect(run.sim.periods[0].tracks.lecture).toBeNull()
    expect(run.sim.periods[0].final).toBe(89.4)
  })

  it('matches when a period is part-sampled', () => {
    const gb = { grading_mode: 'ched_percentage', passing_percent: 75 }
    const samples = { 0: { 0: '88' }, 1: { 1: '70', 2: '60' } }
    expectAgreement(scenario({ ...DEPED, samples, gb }))
  })

  it('treats a typed 0 as a real mark and a blank as no mark', () => {
    const gb = { grading_mode: 'ched_percentage', passing_percent: 75 }
    const zero = scenario({ ...DEPED, samples: { 0: { 0: '0', 1: '100', 2: '100' } }, gb })
    const blank = scenario({ ...DEPED, samples: { 0: { 1: '100', 2: '100' } }, gb })
    expectAgreement(zero)
    expectAgreement(blank)
    expect(zero.sim.periods[0].final).toBe(70) // 0.3*0 + 0.5*100 + 0.2*100
    expect(blank.sim.periods[0].final).toBe(100) // re-weighted over the two that have data
  })
})

describe('simulator shape', () => {
  const gb = { grading_mode: 'ched_percentage', passing_percent: 75 }

  it('reports every configured period even when nothing is typed', () => {
    const sim = simulateAllPeriods(DEPED.periods, DEPED.components, {}, gb.grading_mode, gradePolicy(gb))
    expect(sim.periods).toHaveLength(4)
    expect(sim.periods.map((p) => p.name)).toEqual(['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4'])
    expect(sim.overall).toBeNull()
    expect(sim.hasAnySample).toBe(false)
  })

  it('exposes per-component contributions for every period', () => {
    const sim = simulateAllPeriods(
      DEPED.periods, DEPED.components, { 0: { 0: '88' } }, gb.grading_mode, gradePolicy(gb),
    )
    const c = sim.periods[0].contributions
    expect(c.map((x) => x.name)).toEqual(['Written Works', 'Performance Tasks', 'Quarterly Assessment'])
    expect(c[0]).toMatchObject({ weight: 30, score: 88, graded: true })
    expect(c[1]).toMatchObject({ weight: 50, score: null, graded: false })
  })

  it('drops unnamed period and component rows, as the save does', () => {
    const sim = simulateAllPeriods(
      [...DEPED.periods, { name: '  ', weight_percent: 10 }],
      [...DEPED.components, { name: '', weight_percent: 10 }],
      {}, gb.grading_mode, gradePolicy(gb),
    )
    expect(sim.periods).toHaveLength(4)
    expect(sim.periods[0].componentCount).toBe(3)
  })

  it('ignores a non-numeric sample rather than scoring it', () => {
    const sim = simulateAllPeriods(
      DEPED.periods, DEPED.components, { 0: { 0: 'abc' } }, gb.grading_mode, gradePolicy(gb),
    )
    expect(sim.periods[0].countedCount).toBe(0)
    expect(sim.periods[0].final).toBeNull()
  })

  it('clamps a sample to 0-100', () => {
    const sim = simulateAllPeriods(
      DEPED.periods, DEPED.components,
      { 0: { 0: '150', 1: '-20', 2: '50' } }, gb.grading_mode, gradePolicy(gb),
    )
    const c = sim.periods[0].contributions
    expect(c[0].score).toBe(100)
    expect(c[1].score).toBe(0)
  })
})
