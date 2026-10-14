/**
 * T-180: Casing & UI Copy Convention guide.
 *
 * Asserts that docs/UI-COPY.md exists, documents Title Case and sentence-case
 * rules, standardises (Optional), cites the four preceding rounds
 * (T-157, T-164, T-176, T-178), and is registered in OWNERSHIP.md under
 * the UI/UX lane.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = resolve(__dirname, '..')
const uiCopyPath = resolve(rootDir, 'docs', 'UI-COPY.md')
const ownershipPath = resolve(rootDir, 'OWNERSHIP.md')

describe('T-180 — UI Copy & Casing Convention (docs/UI-COPY.md)', () => {
  it('exists as docs/UI-COPY.md', () => {
    expect(existsSync(uiCopyPath)).toBe(true)
  })

  it('documents Title Case rules for headings, card titles, field labels, buttons, menu options, empty states', () => {
    const content = readFileSync(uiCopyPath, 'utf8')

    expect(content).toContain('Title Case')
    expect(content).toMatch(/headings/i)
    expect(content).toMatch(/card titles/i)
    expect(content).toMatch(/field labels/i)
    expect(content).toMatch(/buttons/i)
    expect(content).toMatch(/menu.*option|dropdown.*option/i)
    expect(content).toMatch(/empty-state/i)
  })

  it('documents sentence case rules for body copy, helper copy, and metric subtexts', () => {
    const content = readFileSync(uiCopyPath, 'utf8')

    expect(content).toMatch(/sentence case/i)
    expect(content).toMatch(/helper copy/i)
    expect(content).toMatch(/metric subtexts/i)
  })

  it('records the settled (Optional) spelling with capital O', () => {
    const content = readFileSync(uiCopyPath, 'utf8')

    expect(content).toContain('(Optional)')
    expect(content).toMatch(/capital\s+[`'"]?O[`'"]?/i)
  })

  it('cross-references all four preceding rounds of casing tickets', () => {
    const content = readFileSync(uiCopyPath, 'utf8')

    expect(content).toContain('T-157')
    expect(content).toContain('T-164')
    expect(content).toContain('T-176')
    expect(content).toContain('T-178')
  })
})

describe('T-180 — Ownership Registration (OWNERSHIP.md)', () => {
  it('registers docs/UI-COPY.md under UI/UX lane', () => {
    const ownership = readFileSync(ownershipPath, 'utf8')

    expect(ownership).toContain('docs/UI-COPY.md')
    expect(ownership).toMatch(/UI\/UX lane[\s\S]*?docs\/UI-COPY\.md/)
    expect(ownership).toContain('T-180')
  })
})
