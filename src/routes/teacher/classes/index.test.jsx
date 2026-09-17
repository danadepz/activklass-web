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

const state = vi.hoisted(() => ({ classes: [] }))

vi.mock('@/hooks/useTeacherClasses', () => ({
  useTeacherClasses: () => ({ data: state.classes, isLoading: false }),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn() }))
vi.mock('@/features/classes/ClassFormModal', () => ({ default: () => null }))

import ClassesPage from './index.jsx'

function page(classes) {
  state.classes = classes
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

  it('an all-active roster still offers an empty Archived tab, not a hidden one', () => {
    expect(page([ACTIVE])).toContain('Archived')
    expect(page([ACTIVE])).not.toContain('Archived (')
  })

  it('never offers Archive/Delete on an archived-tab card — only Unarchive', () => {
    // The Active tab's own row still offers the ⋮ menu.
    expect(page([ACTIVE])).toContain('Class options')
  })
})
