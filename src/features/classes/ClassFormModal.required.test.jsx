/**
 * New Class marks its required fields before you submit (andecobs-41 / T-25).
 *
 * The tester's screenshot was the post-submit banner naming the fields he had
 * missed; he wanted to know *before* clicking Create. The convention already
 * existed on the roster forms -- a red asterisk after the label -- and New
 * Class, the form with the most required fields, was the one without it.
 *
 * So this pins the set, not just the presence: the asterisks must match the
 * validator's required fields exactly (no more, no fewer), the two College-only
 * fields show theirs only when College is selected, and the "* required" legend
 * sits at the top. Static markup, the house pattern -- what the tester saw is
 * the first render, before anything is typed.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(), collection: vi.fn(), doc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn(),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/lib/attachments', () => ({ uploadAttachment: vi.fn() }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [] }) }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import ClassFormModal from './ClassFormModal.jsx'
import { emptyClassForm } from '@/lib/classForm'

const render = (initial) => renderToStaticMarkup(
  <ClassFormModal mode="create" initial={initial} onClose={() => {}} onSaved={() => {}} />
)

/** Label text of every field that carries the red asterisk. */
function starredLabels(html) {
  const re = /<span class="text-sm font-medium text-slate-700[^"]*">([^<]*)<span class="text-red-500" aria-hidden="true"> \*<\/span><\/span>/g
  return [...html.matchAll(re)].map((m) => m[1].trim())
}

const K12_REQUIRED = [
  'Subject Code / Identifier', 'Section / Room', 'Subject Description', 'Schedule Days',
  'Grade / Year Level', 'Max Students', 'School Year',
]
const COLLEGE_ONLY = ['Course Units', 'Semester']

describe('New Class required markers (T-25)', () => {
  it('marks exactly the validator\'s required fields on a K-12 class', () => {
    const html = render(emptyClassForm())
    expect(starredLabels(html)).toEqual(K12_REQUIRED)
  })

  it('adds Units and Semester -- and only those -- when College is selected', () => {
    const html = render({ ...emptyClassForm(), education_level: 'College' })
    expect(starredLabels(html)).toEqual([...K12_REQUIRED, ...COLLEGE_ONLY])
  })

  it('does not mark the College-only fields on a K-12 class', () => {
    const html = render(emptyClassForm())
    for (const label of COLLEGE_ONLY) expect(html).not.toContain(`${label}<span class="text-red-500"`)
  })

  it('says what the asterisk means, above the form', () => {
    const html = render(emptyClassForm())
    expect(html).toMatch(/<span class="text-red-500">\*<\/span> required/)
  })

  it('hides the marker from screen readers -- the inputs already say required', () => {
    const html = render(emptyClassForm())
    const stars = html.match(/<span class="text-red-500" aria-hidden="true"> \*<\/span>/g) ?? []
    expect(stars.length).toBe(K12_REQUIRED.length)
  })
})
