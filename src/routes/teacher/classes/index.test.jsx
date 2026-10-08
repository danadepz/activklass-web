/**
 * T-71 (dawny808-90, slice 3 only): an Archived tab on My Classes. Before
 * this, archiving a class only ever hid it -- the sole way back was the
 * Archive toast's own Undo, gone the moment the page reloaded, or the
 * Admin SDK. useTeacherClasses already fetches every class unfiltered; the
 * tab is a second filter on that same array, not a second query.
 *
 * Static render, house pattern (see SubscriptionBadge.test.jsx) -- the
 * hooks are hard-coded, no interaction is simulated.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  classes: [],
  school: null,
  subscription: { kind: 'active', label: 'Subscribed', detail: 'Individual plan' },
}))

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'T1', role: 'teacher' }, school: state.school }),
}))
vi.mock('@/hooks/useTeacherClasses', () => ({
  useTeacherClasses: () => ({ data: state.classes, isLoading: false }),
}))
vi.mock('@/hooks/useMySubscription', () => ({
  useMySubscription: () => state.subscription,
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn() }))
vi.mock('@/features/classes/ClassFormModal', () => ({ default: () => null }))

import ClassesPage from './index.jsx'

function page(classes, subscription) {
  state.classes = classes
  state.subscription = subscription ?? { kind: 'active', label: 'Subscribed', detail: 'Individual plan' }
  const qc = new QueryClient()
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}><MemoryRouter><ClassesPage /></MemoryRouter></QueryClientProvider>,
  )
}

const ACTIVE = { id: 'c1', section: 'A', subject_code: 'SCI9', student_ids: [] }
const ARCHIVED = { id: 'c2', section: 'B', subject_code: 'SCI8', student_ids: [], archived_at: { seconds: 1 } }

describe('My Classes — Active/Archived tabs (T-71)', () => {
  it('the Active tab (the default) shows only non-archived classes', () => {
    const html = page([ACTIVE, ARCHIVED])
    expect(html).toContain('SCI9')
    expect(html).not.toContain('SCI8')
  })

  it('names the Archived tab with a count', () => {
    expect(page([ACTIVE, ARCHIVED, { ...ARCHIVED, id: 'c3' }])).toContain('Archived (2)')
  })

  // T-134 (triplecookiemonster-178, option C, decided 2026-10-08): this
  // reverses what T-71 originally asserted here -- the Archived tab now
  // hides itself when there is nothing archived, rather than always
  // offering an empty one. The tab must still exist the moment anything
  // IS archived (below) -- it's the only route back to it.
  it('hides the Archived tab entirely when nothing is archived', () => {
    expect(page([ACTIVE])).not.toContain('Archived')
  })

  it('shows the Archived tab again the moment something is', () => {
    const html = page([ACTIVE, ARCHIVED])
    expect(html).toContain('Archived (1)')
  })

  it('never offers Archive/Delete on an archived-tab card — only Unarchive', () => {
    // The Active tab's own row still offers the ⋮ menu.
    expect(page([ACTIVE])).toContain('Class options')
  })
})

describe('My Classes — subtitle and trial card (T-134)', () => {
  it('179: the subtitle reads as Kristine asked', () => {
    expect(page([])).toContain('Manage your classes and student rosters.')
  })

  it('180: a running trial shows "Free trial · N days remaining" and an amber Upgrade-in-Account line, her exact wording', () => {
    const html = page([], { kind: 'trial', label: 'Free trial', detail: '7 days left' })
    expect(html).toContain('Free trial · 7 days remaining')
    expect(html).toContain('Upgrade anytime in')
    expect(html).toMatch(/<a[^>]+href="\/teacher\/account"[^>]*>Account<\/a>/)
    // Amber (goldDeep), not red: decided 2026-10-08 unanimous, red means expired.
    expect(html).toMatch(/color:#8B6A00/i)
    expect(html).not.toMatch(/color:#C0392B/i)
  })

  it('shows nothing when the teacher is not on a trial', () => {
    const html = page([], { kind: 'active', label: 'Subscribed', detail: 'Individual plan' })
    expect(html).not.toContain('Free trial')
    expect(html).not.toContain('Upgrade anytime in')
  })
})
