/**
 * T-154 (andecobs-220): Grade Config's Target Classes picker is one of the
 * four screens the ticket named as degraded by an unbounded class field --
 * `classLabel()` (grading.jsx, T-152) can still carry an old, unbounded
 * section or subject_code, and the row it renders into had no overflow
 * styling at all.
 *
 * Pinned here, in its own file rather than T-152's `gradingTargetClasses.
 * test.jsx`, since that file is a different ticket's in-flight work: the
 * row clamps to one line with an ellipsis and keeps the full label in a
 * `title` attribute. Static markup, same mocking shape as that file.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const huge = 'Lorem ipsum dolor sit amet. '.repeat(2000)
const classes = [
  { id: 'c1', education_level: 'High School', section: huge, subject_code: 'SCI9' },
]

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', () => ({ useParams: () => ({}) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: vi.fn() }))
vi.mock('@/lib/gradebook', () => ({ syncEntries: vi.fn() }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: classes, isLoading: false }) }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import GlobalGradingSetupPage from './grading.jsx'

describe('Target Classes row clamps a long label (T-154)', () => {
  const html = renderToStaticMarkup(<GlobalGradingSetupPage />)

  it('clamps the row to one line instead of letting it stretch the picker', () => {
    expect(html).toMatch(/overflow:hidden;text-overflow:ellipsis;white-space:nowrap[^"]*">High School · Lorem ipsum/)
  })

  it('keeps the full label reachable via title=', () => {
    // classLabel() trims each segment before joining, so the trailing space
    // in `huge` (from the repeated phrase) is not in the rendered title.
    expect(html).toContain(`title="High School · ${huge.trim()} · SCI9"`)
  })
})
