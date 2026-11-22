/**
 * Grade Config: a Save & Sync button on each weight card (Grading Periods,
 * Grade Components), not only the one at the top of the page -- the owner
 * asked for the save action to sit beside the weights a teacher is actually
 * editing. All three trigger the same requestSave() gate: an unbalanced
 * group or a bad pass mark errors immediately (nothing to confirm, since the
 * save cannot succeed), a balanced setup asks for confirmation first, since
 * saving recomputes every grade on every selected class right away.
 *
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Button from '@/components/ui/Button'
import { getDialogs, settleDialog } from '@/components/ui/dialogs'
import { dismissToast, getToasts } from '@/components/ui/toast'
import { useQuery } from '@tanstack/react-query'

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
  useQuery: vi.fn(({ queryKey }) => ({ data: queryKey[0] === 'fs-grading-preset' ? preset : undefined })),
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

import GlobalGradingSetupPage from './grading.jsx'

function renderSaveButton() {
  const buttons = vi.spyOn(Button, 'render')
  renderToStaticMarkup(<GlobalGradingSetupPage />)
  const [save] = buttons.mock.calls.find(([props]) => props.children?.includes?.('Save & Sync'))
  return save.onClick
}

afterEach(() => {
  getToasts().forEach(({ id }) => dismissToast(id))
  getDialogs().forEach(({ id }) => settleDialog(id, false))
  vi.restoreAllMocks()
  vi.useRealTimers()
})

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

  it('shows one three-second warning when invalid weights are saved repeatedly', async () => {
    vi.useFakeTimers()
    useQuery.mockReturnValueOnce({ data: { ...preset, periods: [{ name: 'Prelim', weight_percent: 300 }] } })
    const save = renderSaveButton()
    await save()
    await save()
    expect(getToasts().map((item) => item.message)).toEqual([
      'Every weight must be above 0%, and each group must total 100%.',
    ])
    expect(getDialogs()).toHaveLength(0)
    vi.advanceTimersByTime(3000)
    expect(getToasts()).toHaveLength(0)
  })

  it('keeps a valid save confirmation open until the teacher answers', async () => {
    vi.useFakeTimers()
    const answer = renderSaveButton()()
    vi.advanceTimersByTime(60000)
    expect(getDialogs()).toHaveLength(1)
    const [dialog] = getDialogs()
    expect(dialog.confirmLabel).toBe('Save & Sync')
    settleDialog(dialog.id, false)
    await answer
    expect(getDialogs()).toHaveLength(0)
  })
})
