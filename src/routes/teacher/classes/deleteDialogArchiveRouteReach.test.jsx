/**
 * T-101 (verification lock) — the Delete dialog must offer Archive as a route
 * the teacher can actually take, and must not have loosened Delete to do it.
 *
 * maykel (maykel_64440-129) asked for a Gmail-style Trash. Archive already is
 * one (T-71): it hides the class, keeps roster/records/quizzes, and Unarchive
 * brings it back. He never found it, so he reached for the irreversible path.
 * 6a7d68e names Archive inside the Delete dialog.
 *
 * This pins the BEHAVIOUR rather than the wording, in three parts, because
 * the offer is only worth anything if all three hold:
 *   1. Archive is named and explained ABOVE the type-to-confirm field.
 *   2. The offer is a REAL CONTROL, not prose — prose that says "Archive"
 *      without a way to reach it leaves the teacher exactly where maykel was.
 *      The shipped test beside this one asserts only that the word appears,
 *      so downgrading the button to plain text keeps it green; this does not.
 *   3. Delete is untouched: the exact subject code still gates it, the input
 *      still asks for that code, and the confirm button still renders
 *      disabled until it is typed. No restore path, no soft-delete.
 *
 * Static markup, hooks left alone, house pattern (see capacityCardOver.test.jsx
 * and the sibling deleteOffersArchive.test.jsx) -- there is no DOM library in
 * this repo, so the control is checked as rendered markup, not by clicking.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DeleteConfirmModal } from './index.jsx'

const cls = { id: 'c1', section: 'BSIT-C', subject_code: 'CS101' }

const render = (props = {}) =>
  renderToStaticMarkup(
    <DeleteConfirmModal
      cls={cls}
      onClose={() => {}}
      onDeleted={() => {}}
      onArchiveInstead={() => {}}
      {...props}
    />,
  )

// The irreversible half of the dialog starts here; everything the teacher is
// meant to read first has to appear before it.
const CONFIRM_GATE = 'to confirm deletion'

describe('T-101 — the Delete dialog routes to Archive without weakening Delete', () => {
  it('offers Archive as a control the teacher can press, not just as prose', () => {
    const html = render()
    // A <button> (or link) whose own text is Archive -- a reachable route.
    const control = html.match(/<(button|a)\b[^>]*>Archive<\/\1>/)
    expect(
      control,
      'the Delete dialog names Archive but offers no control to take it',
    ).not.toBeNull()
    // …and it is offered before the teacher is asked to type the code.
    expect(html.indexOf(control[0])).toBeLessThan(html.indexOf(CONFIRM_GATE))
  })

  it('says what Archive keeps and that it is reversible, above the confirm field', () => {
    const html = render()
    const offerAt = html.indexOf('keeps the roster and records')
    expect(offerAt).toBeGreaterThan(-1)
    expect(html).toContain('bring it back any time')
    expect(offerAt).toBeLessThan(html.indexOf(CONFIRM_GATE))
  })

  it('still gates Delete behind the exact subject code', () => {
    const html = render()
    // The code the teacher must type is the subject code, spelled out…
    expect(html).toContain(`<strong>CS101</strong> ${CONFIRM_GATE}`)
    // …the field asks for that same code…
    expect(html).toContain('placeholder="CS101"')
    // …and the confirm button is disabled until it is typed.
    expect(html).toMatch(/<button[^>]*\bdisabled\b[^>]*>Delete class<\/button>/)
  })

  it('still calls Delete final — no restore path was smuggled in', () => {
    const html = render()
    expect(html).toContain('cannot be undone')
    expect(html).not.toMatch(/restore|recover|30 days|Trash/i)
  })
})
