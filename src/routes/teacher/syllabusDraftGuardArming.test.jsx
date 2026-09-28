/**
 * T-102 (triplecookiemonster-130) — independent verification lock.
 *
 * Kristine generated a Grade 3 Mathematics syllabus with AI and came back a
 * week later to an empty list. Nothing was lost because nothing was ever
 * saved: generating only puts a draft in this screen's React state, and
 * `save()` -> `setDoc(doc(db, 'syllabi', id))` is the single write. The fix is
 * the guard that makes leaving an unsaved draft cost a deliberate "discard".
 *
 * This file pins the ARM/DISARM contract of that guard from the outside, so a
 * later edit cannot quietly take it back:
 *
 *   armed   — an unsaved AI-generated draft is on screen: an ordinary click on
 *             an in-app link is intercepted, and the href the teacher aimed at
 *             comes back so "Discard and leave" lands there instead of
 *             trapping her on the draft.
 *   disarmed — NO unsaved AI draft (an existing saved syllabus opened for
 *             ordinary editing, or a manually added one): the same click is
 *             not intercepted and the banner is not rendered. A guard that
 *             nags on every syllabus screen is worse than the bug it fixes.
 *
 * Only the draft state is varied between the two halves of every pair below;
 * everything else is held identical, so each assertion is about the arming and
 * nothing else. No DOM library exists in this repo, so the page's document and
 * window listeners cannot be fired for real -- `draftLeaveTarget` is the pure
 * decision those listeners delegate to, and `renderToStaticMarkup` covers the
 * banner half.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  SyllabusEditor,
  UNSAVED_DRAFT_LEAVE_PROMPT,
  draftLeaveTarget,
  toDraftState,
} from './syllabus'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

/**
 * The shape the capture-phase listener hands `draftLeaveTarget`: a plain
 * primary-button click whose target sits inside an in-app <a href>.
 */
function navLinkClick(href) {
  const anchor = {
    target: '',
    hasAttribute: () => false,
    getAttribute: (name) => (name === 'href' ? href : null),
  }
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { closest: () => anchor },
  }
}

const ON_SYLLABUS = '/teacher/syllabus'

describe('T-102 exit guard arming — an unsaved AI draft, and only that, arms it', () => {
  it('intercepts leaving while an unsaved AI draft is on screen', () => {
    expect(
      draftLeaveTarget({
        isAiDraft: true,
        event: navLinkClick('/teacher/quizzes'),
        currentPathname: ON_SYLLABUS,
      }),
    ).toBe('/teacher/quizzes')
  })

  it('stays silent on a saved syllabus opened for ordinary editing — the same click, no draft', () => {
    expect(
      draftLeaveTarget({
        isAiDraft: false,
        event: navLinkClick('/teacher/quizzes'),
        currentPathname: ON_SYLLABUS,
      }),
    ).toBeNull()
  })

  it('arms on every in-app destination while a draft is unsaved, and none of them without one', () => {
    const destinations = ['/teacher/dashboard', '/teacher/classes', '/teacher/reports', '/teacher/account']
    for (const href of destinations) {
      const event = navLinkClick(href)
      expect(draftLeaveTarget({ isAiDraft: true, event, currentPathname: ON_SYLLABUS })).toBe(href)
      expect(draftLeaveTarget({ isAiDraft: false, event, currentPathname: ON_SYLLABUS })).toBeNull()
    }
  })

  it('hands back the href the teacher aimed at, so "Discard and leave" leaves instead of trapping her', () => {
    // Regression shape: a guard that returns a truthy-but-wrong target (or
    // always the current page) confirms and then goes nowhere.
    const target = draftLeaveTarget({
      isAiDraft: true,
      event: navLinkClick('/teacher/grade-config'),
      currentPathname: ON_SYLLABUS,
    })
    expect(target).toBe('/teacher/grade-config')
    expect(target).not.toBe(ON_SYLLABUS)
  })

  it('offers keeping the draft as well as discarding it, in the one prompt every exit path shows', () => {
    expect(UNSAVED_DRAFT_LEAVE_PROMPT.title).toMatch(/isn't saved yet/i)
    expect(UNSAVED_DRAFT_LEAVE_PROMPT.confirmLabel).toMatch(/discard/i)
    expect(UNSAVED_DRAFT_LEAVE_PROMPT.cancelLabel).toMatch(/keep editing/i)
  })
})

function editorHtml(isAiDraft) {
  const initial = {
    ...toDraftState(
      { title: 'Mathematics 3: Multiplication & Division of Whole Numbers', modules: [] },
      isAiDraft ? 'ai_generated' : 'manual',
    ),
    teacher_id: 'teacher-1',
  }
  return renderToStaticMarkup(
    <SyllabusEditor
      syllabusId="draft-under-test"
      initial={initial}
      isAiDraft={isAiDraft}
      isNewDraft={isAiDraft}
      classes={[]}
      onSaved={() => {}}
      onCancel={() => {}}
    />,
  )
}

describe('T-102 banner arming — "not saved yet" is visible without opening the collapsed help', () => {
  it('leads with "Not saved yet" and offers Save right beside it, for an unsaved AI draft', () => {
    const html = editorHtml(true)
    const lead = html.indexOf('Not saved yet')
    expect(lead).toBeGreaterThan(-1)
    expect(html.slice(lead, lead + 500)).toContain('Save Syllabus')
    // The point of the rewrite: the unstored fact leads, rather than trailing
    // behind "review and edit below" as it did when Kristine read it.
    const collapsedHelp = html.indexOf('Generate makes a draft, not a syllabus')
    if (collapsedHelp > -1) expect(lead).toBeLessThan(collapsedHelp)
  })

  it('renders no such banner for a syllabus that is already stored', () => {
    const html = editorHtml(false)
    expect(html).not.toContain('Not saved yet')
    expect(html).not.toContain('AI-generated draft lives on this screen')
  })
})
