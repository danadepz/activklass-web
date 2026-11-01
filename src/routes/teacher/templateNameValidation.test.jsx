import { describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ errors: [] }))
vi.mock('react', async (load) => ({ ...(await load()), useState: (value) => [value, (next) => state.errors.push(next)], useRef: () => ({ current: null }), useSyncExternalStore: (_subscribe, get) => get() }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { templates: [] } }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/api', () => ({ api: vi.fn() }))
import { TemplatesCard } from './grading'
import DialogHost from '@/components/ui/DialogHost'
import { getDialogs, settleDialog } from '@/components/ui/dialogs'
function find(element, predicate) {
  if (!element || typeof element !== 'object') return null
  if (predicate(element)) return element
  for (const child of [element.props?.footer, ...[element.props?.children].flat(Infinity)]) {
    const found = find(child, predicate)
    if (found) return found
  }
  return null
}
it('TC-GRADE-17: blank template names show validation and leave the dialog open', async () => {
  const tree = TemplatesCard({ busy: false, buildBody: vi.fn(), onUse: vi.fn(), classGradebooks: [] })
  const save = find(tree, (e) => e.props?.onClick?.name === 'saveAsTemplate')
  const pending = save.props.onClick()
  const host = DialogHost()
  // Render the PromptBody selected by the real dialog host and submit its footer.
  const prompt = typeof host.type === 'function' ? host.type(host.props) : host
  const button = find(prompt, (e) => e.props?.onClick?.name === 'submit')
  button.props.onClick()
  expect(state.errors).toContain('This field is required.')
  expect(getDialogs()).toHaveLength(1)
  settleDialog(getDialogs()[0].id, null)
  await pending
})
