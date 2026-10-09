/**
 * T-152 (andecobs-218): the Target Classes box wrapped into a ragged block
 * (one row per screen width, not per class) and labeled each row
 * `{section} · {subject}` -- `subject` is the long free-text description,
 * which is why a class whose description was a whole sentence broke the
 * layout in the tester's screenshot.
 *
 * Pinned here: the box is a one-class-per-row stack (not `flex-wrap`), each
 * row reads education level · section · subject code with the description
 * nowhere in it, and a class missing a field (an older one, created before
 * education_level existed) renders without a stray " · " hole.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const classes = [
  {
    id: 'c1',
    education_level: 'Senior High',
    section: 'Diamond',
    subject_code: 'Mathematics',
    subject: 'This is the Filipino Subject, a long free-text description that used to break the row and wrap raggedly across the box.',
  },
  {
    id: 'c2',
    education_level: 'College',
    section: 'BSIT-C',
    subject_code: 'CS101',
    subject: 'Intro to Computing',
  },
  {
    id: 'c3',
    // No education_level -- an older class made before the field existed.
    section: '9-Newton',
    subject_code: 'SCI9',
    subject: 'Science 9',
  },
  {
    id: 'c4',
    education_level: 'Elementary',
    section: '5-Mabini',
    subject_code: 'MATH5',
    subject: 'Mathematics 5',
  },
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

describe('T-152 — Target Classes lists one class per row, named by the right fields', () => {
  const html = renderToStaticMarkup(<GlobalGradingSetupPage />)

  it('stacks the box one class per row instead of wrapping chips', () => {
    expect(html).toMatch(/Target Classes[\s\S]*?class="flex flex-col gap-2 max-h-40 overflow-y-auto/)
  })

  it('reads education level · section · subject code, never the description', () => {
    expect(html).toContain('Senior High · Diamond · Mathematics')
    expect(html).toContain('College · BSIT-C · CS101')
    expect(html).not.toContain('This is the Filipino Subject')
    expect(html).not.toContain('Intro to Computing')
  })

  it('omits a missing field and its separator instead of printing a hole', () => {
    // c3 has no education_level -- the row must read "SCI9 · 9-Newton"
    // shaped as section · subject_code, never "· 9-Newton · SCI9" with a
    // leading/stray separator.
    expect(html).toContain('9-Newton · SCI9')
    expect(html).not.toContain('· 9-Newton ·')
  })
})
