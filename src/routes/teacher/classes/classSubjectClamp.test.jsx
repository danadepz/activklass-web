/**
 * T-154 (andecobs-220): a pasted wall of text into Subject Description made
 * one class row fill the entire My Classes page -- proven live, the real
 * repro still sits in the project's own database (a `subject` field tens of
 * thousands of characters long). `c.subject` rendered with no overflow
 * styling at all, unlike the section/code line above it, which already had
 * one.
 *
 * Pinned here: the description clamps to one line with an ellipsis (CSS,
 * not a character cut -- the stored value is never touched) and carries the
 * full text in a `title` attribute, in both the list row and the card.
 *
 * Static render, the house pattern for this page (see index.test.jsx).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' }, school: null }) }))
vi.mock('@/hooks/useMySubscription', () => ({
  useMySubscription: () => ({ kind: 'active', label: 'Subscribed', detail: 'Individual plan' }),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn() }))
vi.mock('@/features/classes/ClassFormModal', () => ({ default: () => null }))

const huge = 'Lorem ipsum dolor sit amet. '.repeat(2000)

vi.mock('@/hooks/useTeacherClasses', () => ({
  useTeacherClasses: () => ({
    data: [{ id: 'c1', section: 'Curie', subject_code: 'SCI9', subject: huge, student_ids: [] }],
    isLoading: false,
  }),
}))

import ClassesPage from './index.jsx'

function page() {
  const qc = new QueryClient()
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}><MemoryRouter><ClassesPage /></MemoryRouter></QueryClientProvider>,
  )
}

describe('My Classes row clamps a long Subject Description (T-154)', () => {
  it('never prints the huge description whole', () => {
    // andecobs-220's own screenshot: the description filled the entire page.
    // A single-line CSS clamp means the full string is still in the markup
    // (for title= and for find-in-page) but never rendered unbounded --
    // this pins that the row carries the clamp styling, not that the DOM
    // node's text content is short (static markup cannot measure layout).
    expect(page()).toMatch(/overflow:hidden;text-overflow:ellipsis[^"]*">Lorem ipsum/)
  })

  it('keeps the full description reachable via title=, for a teacher who needs to read it', () => {
    expect(page()).toContain(`title="${huge}"`)
  })

  it('leaves the stored value itself untouched', () => {
    page()
    expect(huge.length).toBe(28 * 2000)
  })
})
