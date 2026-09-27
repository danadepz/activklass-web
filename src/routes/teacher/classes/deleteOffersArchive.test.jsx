/**
 * T-101 (maykel_64440-129): the Delete dialog never mentioned Archive, so a
 * teacher who only wanted a class out of their list reached for the
 * irreversible path instead of the reversible one that already did what
 * they wanted. This pins that the dialog names Archive and offers it above
 * the type-to-confirm field -- and that Delete itself is untouched: the
 * subject code gate still exists and the Archive offer does not replace it.
 *
 * Static render, house pattern (see index.test.jsx) -- DeleteConfirmModal is
 * exported directly so this can render it without driving the page through
 * the ⋮ menu click that normally opens it.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DeleteConfirmModal } from './index.jsx'

const cls = { id: 'c1', section: 'BSIT-C', subject_code: 'CS101' }

function render(props = {}) {
  return renderToStaticMarkup(
    <DeleteConfirmModal cls={cls} onClose={() => {}} onDeleted={() => {}} onArchiveInstead={() => {}} {...props} />,
  )
}

describe('Delete dialog offers Archive first (T-101)', () => {
  it('names Archive above the type-to-confirm field', () => {
    const html = render()
    const archiveAt = html.indexOf('Archive')
    const confirmFieldAt = html.indexOf('to confirm deletion')
    expect(archiveAt).toBeGreaterThan(-1)
    expect(confirmFieldAt).toBeGreaterThan(-1)
    expect(archiveAt).toBeLessThan(confirmFieldAt)
  })

  it('explains Archive keeps the roster and records and is reversible', () => {
    const html = render()
    expect(html).toContain('keeps the roster and records')
    expect(html).toContain('bring it back any time')
  })

  it('still requires the exact subject code, and still calls it final', () => {
    const html = render()
    expect(html).toContain('CS101')
    expect(html).toContain('cannot be undone')
  })
})
