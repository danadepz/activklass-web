/**
 * A teacher-set pass mark and a point scale that runs either way
 * (T-45 Tiers 1 + 2, maykel_64440-39).
 *
 * maykel described his school's CMRS and asked for, among other things, "a
 * passing score the teacher sets (e.g. 60 %)" and "a scale direction to
 * choose: CIT-U style, 5.0 = best, 1.0 = fail, or standard CHED, 1.0 = best,
 * 5.0 = fail — with a failing-range transmutation table generated from those
 * two settings", plus a live formula preview and a simulator. Tiers 1 and 2
 * built exactly that; Tiers 3 and 4 (templates, lecture/lab structures,
 * per-term weights) are NOT built and are not covered here.
 *
 * What is pinned, and why each would fail quietly:
 *
 *   1. A gradebook that never stored the two fields must map every percent to
 *      exactly the point it always did. The fixing pane's own grading.test.js
 *      proves this for five score sets; this walks the whole 0–100 line
 *      against the classic ladder, because the stretch is arithmetic and an
 *      off-by-one at a band edge would pass five spot checks.
 *   2. The bands must tile 0–100 with no gap and no overlap for every pass
 *      mark, in both directions, and the pass/fail test must agree with the
 *      band a percent lands in. The table on Grade Config and the grade on the
 *      record are computed from the same bands, so a disagreement here would
 *      be a record that contradicts its own settings page.
 *   3. His own example: pass 60, 5.0 highest → "93.6 and above → 5.00 …
 *      60 and above → 3.00, below 60 → 1.00". Verified in the browser at
 *      those exact numbers; pinned so the table cannot drift from them.
 *   4. The simulator computes through the same function the record uses, and
 *      its sentence names the band, the direction and the pass rule.
 *   5. DepEd K-12 ignores the pass mark entirely (DO 8 s. 2015 fixes 75). A
 *      teacher setting 60 for her college class must not move her Grade 9
 *      class's pass line — seen on the Newton record as "≥ 75" beside
 *      BSIT-C's "≤ 3.00".
 */
import { describe, expect, it } from 'vitest'

import {
  chedPointEquivalent,
  gradePolicy,
  isPassingGrade,
  pointScaleBands,
} from './grading.js'
import { describeFormula, simulateGrade } from '../routes/teacher/gradePreview.js'

const INV = { passing_percent: 60, point_scale_direction: 'inverted' }
const STD60 = { passing_percent: 60, point_scale_direction: 'ched' }

/* The ladder every gradebook used before the fields existed. */
const CLASSIC = [[96, 1.0], [94, 1.25], [91, 1.5], [88, 1.75], [85, 2.0], [82, 2.25], [79, 2.5], [76, 2.75], [75, 3.0]]
const classicPoint = (p) => (CLASSIC.find(([lower]) => p >= lower) ?? [0, 5.0])[1]

describe('a gradebook without the fields computes exactly as before (T-45)', () => {
  it('maps every percent from 0 to 100, in quarter steps, to the classic ladder', () => {
    const diffs = []
    for (let p = 0; p <= 100; p += 0.25) {
      if (chedPointEquivalent(p, {}) !== classicPoint(p)) diffs.push(p)
    }
    expect(diffs).toEqual([])
    // and with no policy argument at all, the way every old call site calls it
    for (const p of [74.99, 75, 75.5, 96, 100]) expect(chedPointEquivalent(p)).toBe(classicPoint(p))
  })

  it('fills the defaults for absent, empty, or out-of-range values', () => {
    for (const src of [undefined, null, {}, { passing_percent: null }, { passing_percent: 0 }, { passing_percent: 100 }, { passing_percent: 'x' }]) {
      expect(gradePolicy(src)).toEqual({ passing_percent: 75, point_scale_direction: 'ched' })
    }
    expect(gradePolicy({ point_scale_direction: 'sideways' }).point_scale_direction).toBe('ched')
    expect(gradePolicy({ passing_percent: '60' }).passing_percent).toBe(60)
  })

  it('passes at exactly 75 / 3.0 in every mode by default, as before', () => {
    expect(isPassingGrade(75, 'ched_percent')).toBe(true)
    expect(isPassingGrade(74.99, 'ched_percent')).toBe(false)
    expect(isPassingGrade(3.0, 'ched_point')).toBe(true)
    expect(isPassingGrade(3.25, 'ched_point')).toBe(false)
    expect(isPassingGrade(75, 'deped_k12')).toBe(true)
    expect(isPassingGrade(null, 'ched_point')).toBeNull()
  })
})

describe("the tester's own example: pass 60, 5.0 is highest (T-45)", () => {
  const bands = pointScaleBands(INV)

  it('generates the table he described', () => {
    expect(bands[0]).toMatchObject({ point: 5, from: 93.6, to: null })
    expect(bands.at(-2)).toMatchObject({ point: 3, from: 60 })
    expect(bands.at(-1)).toMatchObject({ point: 1, from: 0, to: 60 })
    expect(bands.map((b) => b.point)).toEqual([5, 4.75, 4.5, 4.25, 4, 3.75, 3.5, 3.25, 3, 1])
  })

  it('grades the way the browser showed: 90 / 55 / 62 → 4.50 / 1 / 3.25, and standard → 1.50 / 5 / 2.75', () => {
    expect([90, 55, 62].map((p) => chedPointEquivalent(p, INV))).toEqual([4.5, 1, 3.25])
    expect([90, 55, 62].map((p) => chedPointEquivalent(p, STD60))).toEqual([1.5, 5, 2.75])
  })

  it('reads the pass rule the right way round for each direction', () => {
    expect(isPassingGrade(3.0, 'ched_point', INV)).toBe(true)
    expect(isPassingGrade(3.25, 'ched_point', INV)).toBe(true)
    expect(isPassingGrade(1.0, 'ched_point', INV)).toBe(false)
    expect(isPassingGrade(3.25, 'ched_point', STD60)).toBe(false)
    expect(isPassingGrade(1.0, 'ched_point', STD60)).toBe(true)
  })
})

describe('the bands are one consistent ruler for every pass mark, both ways (T-45)', () => {
  it('tile 0–100 with no gap and no overlap, and agree with isPassingGrade at the edge', () => {
    for (const direction of ['ched', 'inverted']) {
      for (let pp = 1; pp <= 99; pp += 1) {
        const policy = { passing_percent: pp, point_scale_direction: direction }
        const b = pointScaleBands(policy)
        expect(b.at(-1).from).toBe(0)
        expect(b.at(-1).to).toBe(pp)
        for (let i = 1; i < b.length; i += 1) expect(b[i].to).toBe(b[i - 1].from)
        expect(direction === 'inverted' ? b.at(-1).point < b[0].point : b.at(-1).point > b[0].point).toBe(true)
        for (const p of [pp - 0.01, pp, 100]) {
          const pt = chedPointEquivalent(p, policy)
          expect(isPassingGrade(pt, 'ched_point', policy), `${direction} pass ${pp} at ${p}`).toBe(p >= pp)
        }
      }
    }
  })

  it('at 75 the stretch is the identity — the classic ladder, digit for digit', () => {
    expect(pointScaleBands({ passing_percent: 75 }).map((b) => [b.from, b.point]))
      .toEqual([...CLASSIC.map(([f, p]) => [f, p]), [0, 5]])
  })

  it('3.0 is the pass line in both directions and nothing in between is ever produced', () => {
    for (const direction of ['ched', 'inverted']) {
      const pts = pointScaleBands({ passing_percent: 60, point_scale_direction: direction }).map((b) => b.point)
      expect(pts).toContain(3)
      expect(pts.every((p) => Number.isInteger(p * 4))).toBe(true)  // quarter points only
    }
  })
})

describe('DepEd K-12 never reads the pass mark (T-45)', () => {
  it('a teacher-set 60 does not move a Grade 9 pass line off 75', () => {
    expect(isPassingGrade(74, 'deped_k12', INV)).toBe(false)
    expect(isPassingGrade(75, 'deped_k12', INV)).toBe(true)
    expect(isPassingGrade(60, 'deped_k12', { passing_percent: 60 })).toBe(false)
  })

  it('the percent modes do read it', () => {
    expect(isPassingGrade(60, 'ched_percent', { passing_percent: 60 })).toBe(true)
    expect(isPassingGrade(59.9, 'ched_percent', { passing_percent: 60 })).toBe(false)
  })
})

describe('the simulator is the record\'s own arithmetic, in words (T-45 Tier 2)', () => {
  const rows = [{ name: 'Class Standing', weight_percent: 60 }, { name: 'Major Exam', weight_percent: 40 }]

  it('85 and 70 at 60/40 is 79, and the sentence names the band and the direction', () => {
    const sim = simulateGrade(rows, { 0: '85', 1: '70' }, 'ched_point', STD60)
    expect(sim.initial).toBe(79)
    expect(sim.final).toBe(2)
    expect(describeFormula(sim, 'ched_point', STD60).join(' ')).toMatch(/\(60 × 85 \+ 40 × 70\) ÷ \(60 \+ 40\) = 79/)
    expect(describeFormula(sim, 'ched_point', STD60).join(' ')).toMatch(/76 and above.*2\.00.*1\.0 is highest.*3\.00 or lower/)
  })

  it('flips with the direction and re-bands with the pass mark, exactly as the browser did', () => {
    const inv = simulateGrade(rows, { 0: '85', 1: '70' }, 'ched_point', INV)
    expect(inv.final).toBe(4)
    expect(describeFormula(inv, 'ched_point', INV).join(' ')).toMatch(/4\.00.*5\.0 is highest.*3\.00 or higher/)
    const strict = simulateGrade(rows, { 0: '85', 1: '70' }, 'ched_point', { passing_percent: 80, point_scale_direction: 'inverted' })
    expect(strict.final).toBe(1)
    expect(describeFormula(strict, 'ched_point', strict.policy ?? { passing_percent: 80, point_scale_direction: 'inverted' }).join(' ')).toMatch(/below 80.*1\.00/)
  })

  it('gives the same point the record would give for the same percent', () => {
    for (const policy of [{}, STD60, INV, { passing_percent: 80, point_scale_direction: 'inverted' }]) {
      for (const [a, b] of [[85, 70], [100, 100], [50, 50], [60, 60], [95, 92]]) {
        const sim = simulateGrade(rows, { 0: String(a), 1: String(b) }, 'ched_point', policy)
        expect(sim.final).toBe(chedPointEquivalent(sim.initial, policy))
      }
    }
  })
})
