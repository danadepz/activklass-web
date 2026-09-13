/**
 * The Generate Syllabus with AI dialog walks a first-time teacher through it
 * (T-58, andecobs-77).
 *
 * The tester's screenshot was the bare dialog -- every field empty, one
 * sentence under the title -- and his point was the cost of that: a teacher
 * fills in what looks required, gets a thin draft, and generates again, and
 * each run spends one of the day's AI generations. Nothing said that picking
 * a class fills four fields, that Grade / Year Level is what changes the form,
 * what Duration and Notes do to the draft, or that Generate hands back a
 * draft to edit before Save.
 *
 * Pinned here is what he would now see on opening it, before typing anything:
 * the guide block, folded, with its four steps; the hint under Grade / Year
 * Level; the hint under Notes; the Duration line saying what the backend
 * prompt really does with the number (one topic a week over N weeks --
 * services/ai/syllabus_gen.py); and no vendor or model named anywhere in it.
 *
 * Static markup, the house pattern (quizzes.test.jsx is the model). The modal
 * is exported for exactly this reason -- it opens on a click, which a static
 * render cannot do, so the page cannot be rendered into it.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), deleteDoc: vi.fn(), doc: vi.fn(), getDocs: vi.fn(), query: vi.fn(),
  where: vi.fn(), writeBatch: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(),
}))
vi.mock('@/lib/ai', () => ({ generateSyllabus: vi.fn(), MELC_STATUS_LABEL: {} }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [] }) }))
vi.mock('@/hooks/useSyllabi', () => ({ useSyllabi: () => ({ data: [], isLoading: false }) }))
vi.mock('./GenerateModuleModal', () => ({ default: () => null }))
vi.mock('@/lib/attachments', () => ({ uploadAttachment: vi.fn(), isSafeLink: () => true }))
vi.mock('@/components/AttachmentField', () => ({ default: () => null }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/Skeleton', () => ({ SkeletonList: () => null }))
vi.mock('@/components/ui/useAsyncAction', () => ({ useAsyncAction: (fn) => [fn, false] }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))

import { GenerateModal } from './syllabus.jsx'

const open = () => renderToStaticMarkup(<GenerateModal classes={[]} onClose={() => {}} onDraft={() => {}} />)

/** The guide block alone -- the <details> and what is inside it. */
const guide = (html) => html.match(/<details[^>]*>[\s\S]*?<\/details>/)?.[0] ?? ''

describe('Generate Syllabus with AI — the guide a first-time teacher opens on to (T-58)', () => {
  it('opens with a "How to get a good draft" block, folded, its summary line visible', () => {
    // Folded by default since 2026-09-13 (owner): open, it pushed the form
    // down on every visit. The summary is what a first-timer unfolds.
    const html = open()
    expect(html).toMatch(/<details class/)
    expect(html).not.toMatch(/<details open/)
    expect(guide(html)).toContain('<summary')
    expect(guide(html)).toContain('How to get a good draft')
  })

  it('walks the four steps in order: class first, curriculum, duration and notes, then edit the draft', () => {
    const g = guide(open())
    const steps = [...g.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/\s+/g, ' ').trim())
    expect(steps).toHaveLength(4)
    expect(steps[0]).toMatch(/^Pick your class first/)
    expect(steps[0]).toContain('fills the code, name, level and curriculum')
    // Since 2026-09-13 the pick also rides into the editor's Apply to Classes.
    expect(steps[0]).toContain('opens already applied to it')
    expect(steps[1]).toMatch(/^Check the curriculum/)
    expect(steps[1]).toContain('MELC code')
    expect(steps[1]).toContain('leaves codes blank')
    expect(steps[1]).toMatch(/quarter.*strand.*program/)
    expect(steps[2]).toMatch(/^Duration/)
    expect(steps[2]).toContain('Notes')
    expect(steps[3]).toContain('a draft, not a syllabus')
    expect(steps[3]).toContain('Save Syllabus')
  })

  /* What duration_weeks really does in the backend prompt: "modules for a
     {N}-week semester", "roughly one topic per instructional week". Not a
     date range, which is what a teacher would otherwise assume. */
  it('says Duration plans about one topic a week over that many weeks', () => {
    expect(guide(open())).toMatch(/one topic per week over that many weeks/)
  })

  it('hints under Grade / Year Level that it decides the curriculum and the fields shown', () => {
    const html = open()
    const at = html.indexOf('Grade / Year Level')
    expect(at).toBeGreaterThan(-1)
    const after = html.slice(at)
    const hint = after.indexOf('Decides the suggested curriculum and which fields show below.')
    expect(hint).toBeGreaterThan(-1)
    // The hint belongs to that field, not to the next one down.
    expect(hint).toBeLessThan(after.indexOf('Curriculum</label>'))
  })

  it('hints under Notes what to put there', () => {
    const html = open()
    const at = html.indexOf('Additional Instructions (Notes)')
    expect(at).toBeGreaterThan(-1)
    expect(html.slice(at)).toMatch(/Optional\. Topics to emphasise or skip/)
  })

  it('names no vendor or model anywhere in the dialog', () => {
    expect(open()).not.toMatch(/gemini|llama|openai|anthropic|claude|firebase/i)
  })
})

/**
 * Clear form (2026-09-13, owner request). Picking a class fills five fields
 * at once, so a wrong pick used to mean emptying each by hand. A static
 * render cannot click it; what it can pin is that the control is there, is
 * disabled until something is entered (so an empty form never shows a button
 * that does nothing), is type="button" (so it can never submit), and sits
 * apart from Cancel / Generate rather than as a third primary.
 */
describe('Generate Syllabus with AI — Clear form', () => {
  it('opens with a disabled "Clear form" button ahead of Cancel', () => {
    const html = open()
    const clear = html.match(/<button[^>]*>Clear form<\/button>/)?.[0]
    expect(clear).toBeTruthy()
    expect(clear).toContain('type="button"')
    expect(clear).toContain(' disabled=""')
    expect(html.indexOf('Clear form')).toBeLessThan(html.indexOf('>Cancel<'))
  })
})

/**
 * The "For class" pick carries through (2026-09-13, owner request). The
 * picker filled four fields and then the draft opened with no class ticked
 * under Apply to Classes, so the teacher ticked the same class again. Now
 * onDraft receives the picked class as a second argument and the page opens
 * the editor with it in class_ids. A static render cannot click Generate; it
 * can pin that the label says what the pick now does.
 */
describe('Generate Syllabus with AI — the picked class carries into the editor', () => {
  it('says beside the picker that the draft is applied to the picked class', () => {
    const html = renderToStaticMarkup(
      <GenerateModal classes={[{ id: 'c1', subject_code: 'SCI9', subject: 'Science 9', section: 'Newton' }]} onClose={() => {}} onDraft={() => {}} />,
    )
    expect(html).toContain('applies the draft to this class')
  })
})
