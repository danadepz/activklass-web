/**
 * T-97 (andecobs-123, andecobs-124) -- verification lock.
 *
 * Derick reported the same thing twice, twenty minutes apart: a long list
 * grows the page instead of scrolling inside its own card. Two screens carry
 * the fix -- the student Dashboard's "Up next" panel and the class Logs tab.
 *
 * There is no DOM library here to measure geometry, so this pins the
 * markup contract that produces the scroll region on BOTH screens: a bounded
 * (max-height), scrollable (overflow-y:auto), keyboard-focusable (tabindex 0)
 * container that actually WRAPS the list -- not one that merely sits beside
 * it, which would leave the page growing exactly as before.
 *
 * The containment check walks balanced <div> nesting to find where the region
 * really closes, so a region that stops short of the list fails here.
 *
 * `history.jsx` fires async Firestore reads at module scope, so it is read as
 * source -- the same reason `historyWiring.test.js` reads rather than mounts it.
 * `UpNextPanel` renders for real through the house `renderToStaticMarkup` pattern.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { fromQuiz, fromTask } from '@/lib/deliverables'

const state = vi.hoisted(() => ({ data: null, isLoading: false, isError: false }))

vi.mock('@/hooks/useStudentDeliverables', () => ({
  useStudentDeliverables: () => ({ data: state.data, isLoading: state.isLoading, isError: state.isError }),
}))

import UpNextPanel from './student/deliverables/UpNextPanel'

/**
 * Return the substring spanning the element that owns `marker`, from its
 * opening `<div` to its matching `</div>`, by counting nested divs. Works on
 * rendered HTML and on JSX source (a self-closing `<div ... />` opens nothing).
 */
const elementAt = (text, marker) => {
  const at = text.indexOf(marker)
  if (at < 0) return null
  const open = text.lastIndexOf('<div', at)
  if (open < 0) return null

  let i = open
  let depth = 0
  while (i < text.length) {
    const nextOpen = text.indexOf('<div', i + 1)
    const nextClose = text.indexOf('</div>', i + 1)
    if (nextClose < 0) return null

    if (nextOpen >= 0 && nextOpen < nextClose) {
      // Only a tag that is not self-closing adds a level.
      const tagEnd = text.indexOf('>', nextOpen)
      if (tagEnd >= 0 && text[tagEnd - 1] !== '/') depth += 1
      i = nextOpen
    } else {
      if (depth === 0) return text.slice(open, nextClose + 6)
      depth -= 1
      i = nextClose
    }
  }
  return null
}

const NOW = new Date(2026, 8, 13, 10, 0)
const at = (days, h = 23, m = 59) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + days)
  d.setHours(h, m, 0, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
const cls = { classId: 'demo-sci9-newton', className: 'SCI9 · Science 9', now: NOW }
const items = [
  fromTask({ id: 'late', class_id: 'demo-sci9-newton', topic_id: 't2', kind: 'activity', title: 'Lab report', due_at: at(-2), status: 'published' }, cls),
  fromQuiz({ id: 'q-today', title: 'Quiz today', status: 'published', closes_at: at(0) }, cls),
  fromTask({ id: 'week', class_id: 'demo-sci9-newton', topic_id: 't4', kind: 'exam', title: 'Quarter exam', due_at: at(4, 8, 0), status: 'published' }, cls),
  fromTask({ id: 'far', class_id: 'demo-sci9-newton', topic_id: null, kind: 'assignment', title: 'Portfolio', due_at: at(20), status: 'published' }, cls),
  fromQuiz({ id: 'q-soon', title: 'Quiz opening later', status: 'published', opens_at: at(2, 8, 0), closes_at: at(9) }, cls),
  fromQuiz({ id: 'q-done', title: 'Quiz finished', status: 'published', closes_at: at(3) }, { ...cls, attempts: [{ status: 'submitted', total_score: 5 }] }),
]

describe('T-97 -- long lists scroll inside their card instead of growing the page', () => {
  it('bounds the student Dashboard quizzes list and wraps every section in the scroll region', () => {
    state.data = { items, failed: [] }
    state.isLoading = false
    state.isError = false
    const html = renderToStaticMarkup(<MemoryRouter><UpNextPanel now={NOW} /></MemoryRouter>)

    const marker = 'data-scroll-region="up-next-list"'
    expect(html.indexOf(marker), 'no scroll region on the student dashboard list').toBeGreaterThan(-1)

    const region = elementAt(html, marker)
    expect(region, 'could not find the scroll region element').not.toBeNull()

    const openTag = region.slice(0, region.indexOf('>') + 1)
    expect(openTag).toMatch(/max-height:\s*480px/)
    expect(openTag).toMatch(/overflow-y:\s*auto/)
    expect(openTag).toMatch(/tabindex="0"/)

    // Every bucket, including the folded Finished list, must live INSIDE the
    // region. A region that closes before them leaves the card growing.
    for (const title of ['Overdue', 'Due today', 'This week', 'Later', 'Not open yet', 'Finished']) {
      expect(region, `section ${title} is outside the scroll region`).toContain(`data-section="${title}"`)
    }
    // The rows themselves, not just the headings.
    expect(region).toContain('data-deliverable="task:late"')
    expect(region).toContain('data-deliverable="quiz:q-done"')
  })

  it('bounds the class Logs timeline and wraps the day groups in the scroll region', () => {
    const src = readFileSync(
      fileURLToPath(new URL('./teacher/classes/$classId/history.jsx', import.meta.url)),
      'utf8',
    )

    const marker = 'data-scroll-region="class-logs"'
    expect(src.indexOf(marker), 'no scroll region in the Logs tab').toBeGreaterThan(-1)

    const region = elementAt(src, marker)
    expect(region, 'could not find the scroll region element in history.jsx').not.toBeNull()

    const openTag = region.slice(0, region.indexOf('>') + 1)
    expect(openTag).toMatch(/maxHeight:\s*560/)
    expect(openTag).toMatch(/overflowY:\s*'auto'/)
    expect(openTag).toMatch(/tabIndex=\{0\}/)

    // The mapped day groups must be inside the region, not after it.
    expect(region, 'the day groups are rendered outside the scroll region').toContain('groups.map(')
  })
})
