/**
 * T-164 (maykel_64440-237, -238 casing half, -239, -241): Title Case, round
 * two — the two screens T-157 missed: the landing page and the Admin
 * dashboard's new term-dates card.
 *
 * Nine strings across two files, following T-157's convention (headings, nav
 * items, card titles and buttons in Title Case; prose left alone):
 * - 237: "How it works" -> "How It Works", "Sign in" -> "Sign In",
 *        "See how it works" -> "See How It Works"
 * - 238 (casing half only; T-165 owns DESIGNED_FOR's membership):
 *        "Class advisers" -> "Class Advisers"
 * - 239: "Automated grade computation" -> "Automated Grade Computation",
 *        "AI-driven remediation" -> "AI-Driven Remediation",
 *        "Privacy-first by design" -> "Privacy-First By Design"
 * - 241: "Term end dates & automatic archiving" -> "Term End Dates & Automatic Archiving",
 *        the four date labels -> Title Case
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const landingSrc = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')
const usersTabSrc = readFileSync(fileURLToPath(new URL('./admin/UsersTab.jsx', import.meta.url)), 'utf8')

describe('T-164 — Landing page (index.jsx)', () => {
  it('title-cases the nav and hero links (237)', () => {
    expect(landingSrc).toContain('How It Works')
    expect(landingSrc).not.toContain('How it works')
    expect(landingSrc).toContain('Sign In')
    expect(landingSrc).not.toMatch(/>\s*Sign in\s*<\/Link>/)
    expect(landingSrc).toContain('See How It Works →')
    expect(landingSrc).not.toContain('See how it works →')
  })

  it('title-cases the first DESIGNED_FOR entry only, membership untouched (238 casing half)', () => {
    expect(landingSrc).toContain("'Class Advisers',")
    expect(landingSrc).not.toContain("'Class advisers',")
    expect(landingSrc).toContain("'Subject teachers',")
    expect(landingSrc).toContain("'Department heads',")
    expect(landingSrc).toContain("'Registrars',")
    expect(landingSrc).toContain("'CHED faculty',")
  })

  it('title-cases the three feature-card headings (239)', () => {
    expect(landingSrc).toContain('Automated Grade Computation')
    expect(landingSrc).not.toMatch(/>\s*Automated grade computation\s*</)
    expect(landingSrc).toContain('AI-Driven Remediation')
    expect(landingSrc).not.toContain('AI-driven remediation')
    expect(landingSrc).toContain('Privacy-First By Design')
    expect(landingSrc).not.toContain('Privacy-first by design')
  })

  it('leaves the hero paragraph as prose, not a heading (T-157 rule)', () => {
    expect(landingSrc).toContain('Automated grade computation, predictive remediation, and a')
  })
})

describe('T-164 — Admin dashboard term-dates card (UsersTab.jsx)', () => {
  it('title-cases the card title (241)', () => {
    expect(usersTabSrc).toContain('title="Term End Dates & Automatic Archiving"')
    expect(usersTabSrc).not.toContain('title="Term end dates & automatic archiving"')
  })

  it('title-cases all four date labels (241)', () => {
    expect(usersTabSrc).toContain('School Year End (K-12)')
    expect(usersTabSrc).toContain('1st Semester End')
    expect(usersTabSrc).toContain('2nd Semester End')
    expect(usersTabSrc).toContain('Midyear / Summer End')
  })
})
