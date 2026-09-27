/**
 * T-102 (triplecookiemonster-130): an AI-generated syllabus draft is lost
 * without warning if the teacher leaves before saving.
 *
 * Generating with AI was always documented as "makes a draft, not a
 * syllabus" -- but nothing stopped a teacher from leaving the screen (a
 * sidebar link, the "Back to Syllabus List" button, a tab close) with a full
 * generated draft on screen, and it vanished with no confirm and no error.
 * Confirmed against the live project: the tester's Grade 3 syllabus was never
 * written at all, exactly as the source said it would be.
 *
 * What is pinned here:
 * - `draftLeaveTarget` is the pure decision behind the in-app click guard --
 *   armed only while an unsaved AI draft is on screen (isAiDraft), and only
 *   for a plain click on an in-app link that actually leaves the page. This
 *   is what a real click-through in the browser exercises; a plain unit test
 *   can drive it with a constructed event because it never touches the DOM.
 * - `UNSAVED_DRAFT_LEAVE_PROMPT` is the one message both the click guard and
 *   the "Back to Syllabus List" / Cancel buttons show, so it is pinned once.
 * - The on-screen banner leads with "Not saved yet" and puts Save beside it,
 *   and only appears while isAiDraft is true -- an existing syllabus opened
 *   for editing, or a manually-added blank one, never shows it.
 *
 * Without the fix, `draftLeaveTarget` and `UNSAVED_DRAFT_LEAVE_PROMPT` do not
 * exist and `SyllabusEditor` is not exported, so every test below fails on
 * the import alone.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SyllabusEditor, UNSAVED_DRAFT_LEAVE_PROMPT, draftLeaveTarget, toDraftState } from './syllabus'

/** A plain object shaped like the click event `draftLeaveTarget` reads -- no DOM needed. */
function clickOn(href, overrides = {}) {
  const anchor = {
    target: overrides.targetBlank ? '_blank' : '',
    hasAttribute: (name) => !!overrides.download && name === 'download',
    getAttribute: () => href,
  }
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { closest: () => (overrides.notAnAnchor ? null : anchor) },
    ...overrides,
  }
}

describe('draftLeaveTarget — the exit guard is armed only by an unsaved AI draft', () => {
  it('targets an in-app link while a draft is unsaved', () => {
    expect(draftLeaveTarget({
      isAiDraft: true,
      event: clickOn('/teacher/quizzes'),
      currentPathname: '/teacher/syllabus',
    })).toBe('/teacher/quizzes')
  })

  it('does not nag when there is no unsaved draft (an existing or manual syllabus)', () => {
    expect(draftLeaveTarget({
      isAiDraft: false,
      event: clickOn('/teacher/quizzes'),
      currentPathname: '/teacher/syllabus',
    })).toBeNull()
  })

  it('ignores a link back to the page it is already on', () => {
    expect(draftLeaveTarget({
      isAiDraft: true,
      event: clickOn('/teacher/syllabus'),
      currentPathname: '/teacher/syllabus',
    })).toBeNull()
  })

  it('ignores another origin, a new-tab link and a download link', () => {
    const base = { isAiDraft: true, currentPathname: '/teacher/syllabus' }
    expect(draftLeaveTarget({ ...base, event: clickOn('//example.com') })).toBeNull()
    expect(draftLeaveTarget({ ...base, event: clickOn('/file.pdf', { targetBlank: true }) })).toBeNull()
    expect(draftLeaveTarget({ ...base, event: clickOn('/file.pdf', { download: true }) })).toBeNull()
  })

  it('ignores a modified click (ctrl/cmd/shift/alt or a non-primary button) and a non-link click', () => {
    const base = { isAiDraft: true, currentPathname: '/teacher/syllabus' }
    expect(draftLeaveTarget({ ...base, event: clickOn('/teacher/quizzes', { ctrlKey: true }) })).toBeNull()
    expect(draftLeaveTarget({ ...base, event: clickOn('/teacher/quizzes', { button: 1 }) })).toBeNull()
    expect(draftLeaveTarget({ ...base, event: clickOn('/teacher/quizzes', { notAnAnchor: true }) })).toBeNull()
  })
})

describe('UNSAVED_DRAFT_LEAVE_PROMPT — the one message every exit path shows', () => {
  it('leads with "not saved yet" and offers to keep editing, never naming a vendor', () => {
    expect(UNSAVED_DRAFT_LEAVE_PROMPT.title).toMatch(/isn't saved yet/i)
    expect(UNSAVED_DRAFT_LEAVE_PROMPT.confirmLabel).toMatch(/discard/i)
    expect(UNSAVED_DRAFT_LEAVE_PROMPT.cancelLabel).toMatch(/keep editing/i)
    const whole = `${UNSAVED_DRAFT_LEAVE_PROMPT.title} ${UNSAVED_DRAFT_LEAVE_PROMPT.message}`
    expect(whole).not.toMatch(/firebase|firestore|gemini|anthropic/i)
  })
})

function editor(isAiDraft) {
  const initial = {
    ...toDraftState({ title: 'Grade 3 Mathematics', modules: [] }, isAiDraft ? 'ai_generated' : 'manual'),
    teacher_id: 'T1',
  }
  return renderToStaticMarkup(
    <SyllabusEditor
      syllabusId="draft-1"
      initial={initial}
      isAiDraft={isAiDraft}
      isNewDraft={isAiDraft}
      classes={[]}
      onSaved={() => {}}
      onCancel={() => {}}
    />,
  )
}

describe('SyllabusEditor banner — the on-screen half of the same fix', () => {
  it('leads with "Not saved yet" and puts a Save button beside it, for an unsaved AI draft', () => {
    const html = editor(true)
    const at = html.indexOf('Not saved yet')
    expect(at).toBeGreaterThan(-1)
    // "Save Syllabus" appears once in this banner and again at the foot of the
    // form; the banner's own copy must be the one immediately after the lead.
    expect(html.slice(at, at + 400)).toContain('Save Syllabus')
  })

  it('does not nag an ordinary syllabus (no unsaved AI draft on screen)', () => {
    expect(editor(false)).not.toContain('Not saved yet')
  })
})
