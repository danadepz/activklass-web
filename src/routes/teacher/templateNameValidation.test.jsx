/**
 * T-244: Blank and whitespace-only grading template name validation.
 *
 * Verifies that:
 * 1. An empty template name is rejected with a required validation error.
 * 2. A whitespace-only template name is rejected with a required validation error.
 * 3. The prompt dialog remains open in all invalid input cases (does not settle).
 * 4. A valid template name is accepted, closing the dialog.
 * 5. Exactly one save operation is dispatched upon valid submission with the trimmed name.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = {
  currentValue: '',
  currentError: '',
  errors: [],
  createdTemplates: [],
  cursor: 0,
}

vi.mock('react', async (load) => {
  const actual = await load()
  return {
    ...actual,
    useState: (initial) => {
      const idx = mockState.cursor++
      if (idx % 2 === 0) {
        // First state hook in PromptBody: value
        return [
          mockState.currentValue,
          (next) => {
            mockState.currentValue = typeof next === 'function' ? next(mockState.currentValue) : next
          },
        ]
      }
      // Second state hook in PromptBody: error
      return [
        mockState.currentError,
        (next) => {
          const val = typeof next === 'function' ? next(mockState.currentError) : next
          mockState.currentError = val
          mockState.errors.push(val)
        },
      ]
    },
    useRef: () => ({ current: null }),
    useSyncExternalStore: (_subscribe, get) => get(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { templates: [] } }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@/lib/firebase', () => ({ db: {} }))

vi.mock('@/lib/api', () => ({
  api: vi.fn(async (url, options) => {
    if (url === '/api/grading-templates' && options?.method === 'POST') {
      mockState.createdTemplates.push(options.body)
      return { status: 'success', id: 'new-tmpl-1' }
    }
    return {}
  }),
}))

vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { TemplatesCard } from './grading'
import DialogHost from '@/components/ui/DialogHost'
import { getDialogs, settleDialog } from '@/components/ui/dialogs'
import { api } from '@/lib/api'

function find(element, predicate) {
  if (!element || typeof element !== 'object') return null
  if (predicate(element)) return element
  for (const child of [element.props?.footer, ...[element.props?.children].flat(Infinity)]) {
    const found = find(child, predicate)
    if (found) return found
  }
  return null
}

function getPromptSubmitButton() {
  mockState.cursor = 0
  const host = DialogHost()
  const prompt = typeof host.type === 'function' ? host.type(host.props) : host
  return find(prompt, (e) => e.props?.onClick?.name === 'submit')
}

describe('T-244: Template name validation and save completion', () => {
  beforeEach(() => {
    for (const d of getDialogs()) {
      settleDialog(d.id, null)
    }
    mockState.currentValue = ''
    mockState.currentError = ''
    mockState.errors = []
    mockState.createdTemplates = []
    mockState.cursor = 0
    vi.clearAllMocks()
  })

  it('rejects an empty template name, shows validation error, and keeps dialog open', async () => {
    const buildBody = vi.fn((name) => ({ name, components: [] }))
    const tree = TemplatesCard({ busy: false, buildBody, onUse: vi.fn(), classGradebooks: [] })
    const saveBtn = find(tree, (e) => e.props?.onClick?.name === 'saveAsTemplate')

    mockState.currentValue = ''
    const pendingSave = saveBtn.props.onClick()

    expect(getDialogs()).toHaveLength(1)
    const button = getPromptSubmitButton()
    button.props.onClick()

    expect(mockState.errors).toContain('This field is required.')
    // Dialog remains open
    expect(getDialogs()).toHaveLength(1)
    // No save should have occurred
    expect(buildBody).not.toHaveBeenCalled()
    expect(api).not.toHaveBeenCalled()

    settleDialog(getDialogs()[0].id, null)
    await pendingSave
  })

  it('rejects a whitespace-only template name, shows validation error, and keeps dialog open', async () => {
    const buildBody = vi.fn((name) => ({ name, components: [] }))
    const tree = TemplatesCard({ busy: false, buildBody, onUse: vi.fn(), classGradebooks: [] })
    const saveBtn = find(tree, (e) => e.props?.onClick?.name === 'saveAsTemplate')

    mockState.currentValue = '     '
    const pendingSave = saveBtn.props.onClick()

    expect(getDialogs()).toHaveLength(1)
    const button = getPromptSubmitButton()
    button.props.onClick()

    expect(mockState.errors).toContain('This field is required.')
    // Dialog remains open
    expect(getDialogs()).toHaveLength(1)
    // No save should have occurred
    expect(buildBody).not.toHaveBeenCalled()
    expect(api).not.toHaveBeenCalled()

    settleDialog(getDialogs()[0].id, null)
    await pendingSave
  })

  it('accepts a valid template name, closes dialog, and performs exactly one save with trimmed name', async () => {
    const buildBody = vi.fn((name) => ({ name, grading_structure: 'lecture_only', components: [] }))
    const tree = TemplatesCard({ busy: false, buildBody, onUse: vi.fn(), classGradebooks: [] })
    const saveBtn = find(tree, (e) => e.props?.onClick?.name === 'saveAsTemplate')

    mockState.currentValue = '  Midterm Science 9 Template  '
    const pendingSave = saveBtn.props.onClick()

    expect(getDialogs()).toHaveLength(1)
    const button = getPromptSubmitButton()
    button.props.onClick()

    // Valid submission settles the prompt dialog and closes it
    expect(getDialogs()).toHaveLength(0)

    await pendingSave

    // Exactly one save performed with the trimmed name
    expect(buildBody).toHaveBeenCalledTimes(1)
    expect(buildBody).toHaveBeenCalledWith('Midterm Science 9 Template')
    expect(api).toHaveBeenCalledTimes(1)
    expect(mockState.createdTemplates).toHaveLength(1)
    expect(mockState.createdTemplates[0].name).toBe('Midterm Science 9 Template')
  })
})
