/**
 * T-165 (maykel_64440-238, second half -- the casing half is T-164): who the
 * landing page's "Designed for" strip says ActivKlass is for.
 *
 * DECIDED 2026-10-11 by the owner (this card's own recommendation, taken as
 * written): the strip is about who the product is FOR, not who signs up on
 * this page. That is what makes Institutions, Parents and Students belong on
 * it despite none of them registering here. CHED Faculty stays against
 * maykel's Remove list -- it is the only line on the landing page saying the
 * product serves college, and Grade Config ships a full CHED Tertiary mode
 * with a 1.0-5.0 point scale, so removing it would be a regression, not a
 * tidy-up. Subject teachers, Department heads and Registrars are dropped as
 * redundant with Class Advisers.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const landingSrc = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')

describe('T-165 — DESIGNED_FOR (index.jsx)', () => {
  it('reads exactly the five decided entries, in the decided order', () => {
    const match = landingSrc.match(/const DESIGNED_FOR = \[([\s\S]*?)\]/)
    expect(match, 'DESIGNED_FOR array not found').toBeTruthy()
    const entries = [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1])
    expect(entries).toEqual(['Institutions', 'Class Advisers', 'CHED Faculty', 'Parents', 'Students'])
  })

  it('keeps CHED Faculty -- the only line on the page saying the product serves college', () => {
    expect(landingSrc).toContain("'CHED Faculty',")
  })

  it('drops the three job titles Class Advisers already covers', () => {
    expect(landingSrc).not.toContain("'Subject teachers'")
    expect(landingSrc).not.toContain("'Department heads'")
    expect(landingSrc).not.toContain("'Registrars'")
  })
})
