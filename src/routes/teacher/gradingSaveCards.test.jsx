/**
 * Grade Config: a Save & Sync button on each weight card (Grading Periods,
 * Grade Components), not only the one at the top of the page -- the owner
 * asked for the save action to sit beside the weights a teacher is actually
 * editing. All three trigger the same requestSave() gate: an unbalanced
 * group or a bad pass mark errors immediately (nothing to confirm, since the
 * save cannot succeed), a balanced setup asks for confirmation first, since
 * saving recomputes every grade on every selected class right away.
 *
 * Static markup only (house pattern, no DOM events in this repo), so this
 * locks what renders -- three Save & Sync buttons, in the two new cards and
 * the original spot -- not the click-through confirm/error branching, which
 * is not independently testable here either way.
 */
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

describe('Grade Config — Save & Sync lives on each weight card too', () => {
  it('renders three Save & Sync buttons: the page header and both weight cards', () => {
    const html = renderToStaticMarkup(<GlobalGradingSetupPage />)
    /* Counted as BUTTONS, not as occurrences of the string. The Saved
       Templates card (Phase 2) explains in prose that nothing reaches a class
       until you press Save & Sync, so a raw string count now picks up copy
       that is not a button -- which was never what this test meant. */
    const buttons = html.match(/<button[\s\S]*?<\/button>/g) || []
    const count = buttons.filter((b) => b.includes('Save &amp; Sync')).length
    expect(count).toBe(3)
  })
})
