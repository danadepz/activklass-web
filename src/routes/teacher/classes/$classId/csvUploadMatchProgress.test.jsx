/**
 * Bulk Upload's "Matching students…" line sat completely still for the whole
 * match (T-89, triplecookiemonster-110). Kristine: *"Static ra ang 'matching
 * students...' — Expected: Dynamic para makahibaw ang teacher na naglihok ang
 * system"*. Nothing on screen told a teacher apart a working upload from a
 * stuck one, and the wait is real: the match loop is sequential and awaits one
 * Flask round-trip per CSV row (two for rows that also carry an email), so a
 * 45-row file is ~14s of apparently-nothing.
 *
 * The line now carries the spinner idiom from RouteFallback.jsx inside a
 * role="status" aria-live="polite" wrapper and reads "Matching students… N of
 * M", bumped once per row. There is no DOM library in this repo, so the
 * animation itself cannot be observed here -- what is locked instead is the
 * contract that makes the line *move*: the count is rendered from the live
 * progress state, so two different progress values must produce two different
 * lines. A regression back to one static string collapses them into one.
 *
 * State is seeded through the house useState mock (see csvUploadAccountKind
 * .test.jsx) rather than by driving the file input, because `busy` and
 * `matchProgress` only exist mid-flight. CsvUploadModal is rendered on its own,
 * with no Router around it, so the only useState calls the mock sees are its
 * own four, in source order: preview(null), error(null), busy(false),
 * matchProgress({done,total}).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  preview: undefined,
  error: undefined,
  busy: false,
  progress: null,
  nullSeen: 0,
}))

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useState: (init) => {
      if (init === null) {
        state.nullSeen += 1
        if (state.nullSeen === 1 && state.preview !== undefined) return real.useState(state.preview)
        if (state.nullSeen === 2 && state.error !== undefined) return real.useState(state.error)
      }
      if (init === false && state.busy) return real.useState(true)
      if (state.progress && init && typeof init === 'object' && init.done === 0 && init.total === 0) {
        return real.useState(state.progress)
      }
      return real.useState(init)
    },
  }
})

// A school-issued teacher: keeps the wording branch that renders no <Link>,
// so this file needs no Router (see T-91 for the solo half).
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'T1', role: 'teacher', school_id: 'S1' }, school: null }),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }))
vi.mock('@/lib/roster', async (importOriginal) => ({
  ...(await importOriginal()),
  findStudentsByNumber: vi.fn(),
  findStudentByEmail: vi.fn(),
  addToRoster: vi.fn(),
}))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { CsvUploadModal } from './index.jsx'

function render() {
  return renderToStaticMarkup(
    <CsvUploadModal classId="C1" enrolledIds={[]} maxStudents={0} onClose={() => {}} onDone={() => {}} />,
  )
}

/** Render the modal mid-match, `done` rows of `total` finished. */
function renderMatching(done, total) {
  state.preview = null
  state.busy = true
  state.progress = { done, total }
  state.nullSeen = 0
  return render()
}

beforeEach(() => {
  state.preview = undefined
  state.error = undefined
  state.busy = false
  state.progress = null
  state.nullSeen = 0
})

describe('T-89 — the matching line reports progress instead of sitting still', () => {
  it('names how many rows are done, and says something different as the count climbs', () => {
    const early = renderMatching(0, 45)
    const middle = renderMatching(12, 45)
    const late = renderMatching(44, 45)

    expect(early).toContain('Matching students… 0 of 45')
    expect(middle).toContain('Matching students… 12 of 45')
    expect(late).toContain('Matching students… 44 of 45')

    // The point of the ticket: the line must not read the same at every stage.
    expect(new Set([early, middle, late]).size).toBe(3)
  })

  it('spins and announces itself, so the wait reads as work in progress', () => {
    const html = renderMatching(12, 45)
    expect(html).toMatch(/<p[^>]*role="status"[^>]*aria-live="polite"/)
    expect(html).toMatch(/<span[^>]*class="[^"]*animate-spin[^"]*"/)
  })

  it('still says what it is doing before the row count is known', () => {
    const html = renderMatching(0, 0)
    expect(html).toContain('Matching students…')
    expect(html).not.toMatch(/Matching students… \d+ of \d+/)
    expect(html).toMatch(/<span[^>]*class="[^"]*animate-spin[^"]*"/)
  })
})

describe('T-89 — the line is not left running once the match is over', () => {
  it('is gone when the preview arrives, even when nothing matched at all', () => {
    state.busy = false
    state.preview = {
      matched: [],
      already: [],
      unmatched: [
        { label: 'Nobody01, Verify01', id: 'T89-ZZ-9001', reason: 'no student account' },
        { label: 'Nobody02, Verify02', id: 'T89-ZZ-9002', reason: 'no student account' },
      ],
    }

    const html = render()
    expect(html).not.toContain('Matching students')
    expect(html).not.toContain('animate-spin')
    expect(html).toContain('no student account')
    expect(html).toContain('Add 0 students to class')
  })

  it('is gone when the match fails part-way, leaving the error and no spinner', () => {
    state.busy = false
    state.preview = null
    state.error = 'Cannot reach the ActivKlass server.'

    const html = render()
    expect(html).toContain('Cannot reach the ActivKlass server.')
    expect(html).not.toContain('Matching students')
    expect(html).not.toContain('animate-spin')
  })
})
