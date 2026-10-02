/**
 * T-110 (triplecookiemonster-141, items 5 & 6, Kristine 2026-10-01): pins two
 * facts from source, the house pattern used by student/_layout.test.jsx --
 * reading the file as text rather than rendering it, since TeacherLayout
 * pulls in several Firestore-backed queries that a static render would need
 * to stub just to reach the chrome being tested.
 *
 * 1. Announcement sits LAST in NAV_ITEMS (both the desktop nav and the mobile
 *    menu render from this one array), not merely present in it.
 * 2. The always-visible profile card -- the NavLink to /teacher/account in
 *    the header, bounded from its own opening tag to the "Hamburger" comment
 *    that follows its close -- shows the account id and the avatar circle,
 *    and no longer the teacher's name or the SubscriptionChip "plan" pill.
 *    The mobile hamburger dropdown's own Account row (a different, click-
 *    to-open element, not in Kristine's screenshot) is deliberately left
 *    out of scope and still carries the name -- bounded out of the slice
 *    below so this test does not touch it.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./_layout.jsx', import.meta.url)), 'utf8')

function navItemLabels() {
  const block = src.slice(src.indexOf('const NAV_ITEMS = ['), src.indexOf('\n]') + 2)
  return [...block.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1])
}

/** The header's own profile card, not the mobile dropdown's separate Account row. */
function headerCardSlice() {
  const start = src.indexOf('to="/teacher/account"')
  const end = src.indexOf('Hamburger — mobile only', start)
  return src.slice(start, end)
}

describe('T-110 — Announcement moves to the end of the nav', () => {
  it('is the last entry, not merely present', () => {
    const labels = navItemLabels()
    expect(labels[labels.length - 1]).toBe('Announcement')
    expect(labels.indexOf('Announcement')).toBeGreaterThan(labels.indexOf('Reports'))
  })

  it('every other label and route is unchanged, just reordered', () => {
    expect(navItemLabels().sort()).toEqual(
      ['Announcement', 'Dashboard', 'Grade Config', 'My Classes', 'Quizzes', 'Reports', 'Students', 'Syllabus'].sort(),
    )
    expect(src).toContain("{ to: '/teacher/announcements', label: 'Announcement' }")
  })
})

describe('T-110 — the header profile card shows initials and account id, not the name or the plan', () => {
  it('no longer renders the teacher\'s name', () => {
    expect(headerCardSlice()).not.toMatch(/profile\.first_name/)
  })

  it('no longer renders the SubscriptionChip plan pill', () => {
    expect(headerCardSlice()).not.toMatch(/<SubscriptionChip/)
  })

  it('still renders the initials and the account id', () => {
    const card = headerCardSlice()
    expect(card).toMatch(/\{initials\}/)
    expect(card).toMatch(/profile\.login_id \?\? profile\.email/)
  })

  it('still links to /teacher/account', () => {
    expect(headerCardSlice()).toMatch(/^to="\/teacher\/account"/)
  })

  it('the avatar ring reads its colour only from lib/subscription.js\'s kind map', () => {
    expect(src).toMatch(/import \{ SUBSCRIPTION_RING_COLOR \} from '@\/lib\/subscription'/)
    expect(headerCardSlice()).toMatch(/boxShadow: ringColor/)
  })
})

describe('T-110 — the mobile hamburger dropdown is deliberately out of scope', () => {
  it('still carries the name on its own Account row (not the card Kristine flagged)', () => {
    const afterCard = src.slice(src.indexOf('Hamburger — mobile only'))
    expect(afterCard).toMatch(/profile\.first_name/)
  })
})
