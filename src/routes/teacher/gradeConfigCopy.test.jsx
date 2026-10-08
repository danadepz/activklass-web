import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const preset = {
  grading_mode: 'deped_k12',
  periods: [
    { id: 'q1', name: 'Quarter 1', weight_percent: 50 },
    { id: 'q2', name: 'Quarter 2', weight_percent: 50 },
  ],
  components: [
    { id: 'ww', name: 'Written Works', weight_percent: 40 },
    { id: 'pt', name: 'Performance Tasks', weight_percent: 60 },
  ],
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: preset, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', () => ({ useParams: () => ({}) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: vi.fn() }))
vi.mock('@/lib/gradebook', () => ({ syncEntries: vi.fn() }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [], isLoading: false }) }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import GlobalGradingSetupPage from './grading.jsx'

describe('Grade Config copy and layout (T-144: triplecookiemonster-202..205)', () => {
  it('centers the layout container with mx-auto (#202)', () => {
    const html = renderToStaticMarkup(<GlobalGradingSetupPage />)
    expect(html).toContain('max-w-4xl mx-auto')
  })

  it('renders updated Target Classes copy (#203)', () => {
    const html = renderToStaticMarkup(<GlobalGradingSetupPage />)
    expect(html).toContain('Choose the classes that will use these grading settings.')
  })

  it('renders updated Grading Type copy (#204)', () => {
    const html = renderToStaticMarkup(<GlobalGradingSetupPage />)
    expect(html).toContain(
      "Choose a grading system based on your institution&#x27;s standards (DepEd K-12 uses transmutation tables; CHED uses raw percentages or a 1.0–5.0 scale)."
    )
  })

  it('renders DepEd fixed passing score notice (#205)', () => {
    const html = renderToStaticMarkup(<GlobalGradingSetupPage />)
    expect(html).toContain('Passing score is fixed at')
    expect(html).toContain('75')
    expect(html).toContain('following DepEd guidelines')
  })
})
