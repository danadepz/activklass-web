/**
 * T-228: A duplicated grade template and its original end up sharing percentages.
 *
 * Reported in Discord ticket andecobs-324 (Derickk, 2026-10-31):
 * Duplicate a grade-configuration template, change the copy's percentages,
 * save and exit. Reopen both: the original now shows the copy's percentages.
 *
 * Source review found no existing UI action to save edited percentages to a
 * template; Save & Sync targets class/preset configuration. The backend source
 * duplicates into a new document ID. The tester's live documents have not been
 * inspected, so these tests do not establish whether their stored data changed.
 *
 * Fix:
 * 1. TemplatesCard now accepts `loadedTemplate` and indicates the active template in the UI
 *    via a banner and an "Active in form" badge on the active template card.
 * 2. TemplatesCard provides a dedicated "Save to <template>" action that invokes
 *    `updateTemplate(t.id, ...)` targeting only that template ID, leaving the original
 *    template in storage untouched.
 * 3. When saving a setup as a template with a name matching an existing owned template,
 *    it prompts to update the existing template rather than silently creating an ambiguous copy.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ direct: false }))
vi.mock('react', async (original) => {
  const real = await original()
  return { ...real, useState: (initial) => hooks.direct ? [initial, vi.fn()] : real.useState(initial) }
})

const origTemplate = {
  id: 'tmpl_orig',
  name: 'College Lecture',
  is_owner: true,
  scope: 'private',
  grading_mode: 'deped_k12',
  grading_structure: 'lecture_only',
  periods: [{ id: 'p1', name: 'Midterm', weight_percent: 50 }, { id: 'p2', name: 'Final', weight_percent: 50 }],
  components: [
    { id: 'c1', name: 'Written Work', weight_percent: 40 },
    { id: 'c2', name: 'Performance Tasks', weight_percent: 60 },
  ],
}

const copyTemplate = {
  id: 'tmpl_copy',
  name: 'College Lecture (copy)',
  is_owner: true,
  scope: 'private',
  grading_mode: 'deped_k12',
  grading_structure: 'lecture_only',
  periods: [{ id: 'p1', name: 'Midterm', weight_percent: 50 }, { id: 'p2', name: 'Final', weight_percent: 50 }],
  components: [
    { id: 'c1', name: 'Written Work', weight_percent: 40 },
    { id: 'c2', name: 'Performance Tasks', weight_percent: 60 },
  ],
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { templates: [origTemplate, copyTemplate] },
    isLoading: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/api', () => ({ api: vi.fn() }))
vi.mock('@/components/ui/dialogs', () => ({
  confirmDialog: vi.fn(async () => true),
  promptDialog: vi.fn(async () => 'College Lecture (copy)'),
}))
vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { TemplatesCard } from './grading.jsx'
import { api } from '@/lib/api'
import { confirmDialog } from '@/components/ui/dialogs'
import { toast } from '@/components/ui/toast'

describe('T-228 — Loaded template tracking and isolated template save', () => {
  it('renders no loaded-template banner or active badge when no template is loaded', () => {
    const html = renderToStaticMarkup(
      <TemplatesCard
        busy={false}
        buildBody={vi.fn()}
        onUse={vi.fn()}
        classGradebooks={[]}
        loadedTemplate={null}
      />
    )
    expect(html).not.toContain('data-testid="loaded-template-banner"')
    expect(html).not.toContain('Active in form')
    expect(html).not.toContain('data-testid="save-loaded-template-btn"')
  })

  it('renders loaded-template banner, active badge, and template-save button when a copy is loaded', () => {
    const html = renderToStaticMarkup(
      <TemplatesCard
        busy={false}
        buildBody={vi.fn()}
        onUse={vi.fn()}
        classGradebooks={[]}
        loadedTemplate={copyTemplate}
      />
    )
    expect(html).toContain('data-testid="loaded-template-banner"')
    expect(html).toContain('College Lecture (copy)')
    expect(html).toContain('Active in form')
    expect(html).toContain('data-testid="save-loaded-template-btn"')
    expect(html).toContain('Save to “College Lecture (copy)”')
    expect(html).toContain('data-testid="save-template-row-btn"')
  })

  it('renders active badge only on the specific loaded template row', () => {
    const htmlOrig = renderToStaticMarkup(
      <TemplatesCard
        busy={false}
        buildBody={vi.fn()}
        onUse={vi.fn()}
        classGradebooks={[]}
        loadedTemplate={origTemplate}
      />
    )
    expect(htmlOrig).toContain('data-testid="loaded-template-banner"')
    expect(htmlOrig).toContain('Save to “College Lecture”')
    expect(htmlOrig.split('Active in form').length - 1).toBe(1)
  })
})

// Exercise the real button callbacks and API wrapper; only hook storage and the
// transport are substituted. The original/copy records below are independent fixtures.
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}
function controls(props = {}) {
  hooks.direct = true
  try {
    return nodes(TemplatesCard({ busy: false, onUse: vi.fn(), classGradebooks: [],
      loadedTemplate: copyTemplate, buildBody: () => ({ ...structuredClone(copyTemplate),
        components: [{ id: 'c1', name: 'Written Work', weight_percent: 70 },
                     { id: 'c2', name: 'Performance Tasks', weight_percent: 30 }] }), ...props }))
  } finally { hooks.direct = false }
}
const button = (tree, id) => {
  const found = tree.find(n => n.type === 'button' && n.props['data-testid'] === id)
  expect(found, `Available action: ${id}`).toBeDefined()
  return found
}

beforeEach(() => {
  vi.clearAllMocks()
  api.mockReset()
  confirmDialog.mockResolvedValue(true)
})

describe('T-228 — actual save actions', () => {
  it('saves the copy by its own ID and reopens original and copy with distinct percentages', async () => {
    const stored = { tmpl_orig: structuredClone(origTemplate), tmpl_copy: structuredClone(copyTemplate) }
    api.mockImplementation(async (path, options) => {
      const id = path.split('/').at(-1)
      if (options?.method === 'PUT') stored[id] = { ...stored[id], ...structuredClone(options.body), id }
      return structuredClone(stored[id])
    })
    const onUpdated = vi.fn()
    await button(controls({ onLoadedTemplateUpdated: onUpdated }), 'save-loaded-template-btn').props.onClick()
    expect(api).toHaveBeenCalledTimes(1)
    expect(api.mock.calls[0][0]).toBe('/api/grading-templates/tmpl_copy')
    const original = await api('/api/grading-templates/tmpl_orig')
    const copy = await api('/api/grading-templates/tmpl_copy')
    expect(original.components.map(c => c.weight_percent)).toEqual([40, 60])
    expect(copy.components.map(c => c.weight_percent)).toEqual([70, 30])
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: 'tmpl_copy' }))
  })

  it('does not announce a save or change the loaded template when the request fails', async () => {
    api.mockRejectedValue(new Error('Could not save. Please try again.'))
    const onUpdated = vi.fn()
    await button(controls({ onLoadedTemplateUpdated: onUpdated }), 'save-loaded-template-btn').props.onClick()
    expect(toast.success).not.toHaveBeenCalled()
    expect(onUpdated).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Could not save. Please try again.')
  })

  it('keeps the loaded copy selected when saving the current setup to another template', async () => {
    api.mockResolvedValue({ status: 'success' })
    const onUpdated = vi.fn()
    const tree = controls({ onLoadedTemplateUpdated: onUpdated })
    const saveOriginal = tree.find(n => n.type === 'button' && n.props['data-testid'] === 'save-template-row-btn')
    await saveOriginal.props.onClick()
    expect(api.mock.calls[0][0]).toBe('/api/grading-templates/tmpl_orig')
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('preserves school sharing when saving updated percentages', async () => {
    api.mockResolvedValue({ status: 'success' })
    const onUpdated = vi.fn()
    await button(controls({ loadedTemplate: { ...copyTemplate, scope: 'school' },
      onLoadedTemplateUpdated: onUpdated }), 'save-loaded-template-btn').props.onClick()
    expect(api.mock.calls[0][1].body.scope).toBe('school')
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ scope: 'school' }))
  })

  it('does not submit an invalid setup', async () => {
    await button(controls({ buildBody: () => null }), 'save-loaded-template-btn').props.onClick()
    expect(api).not.toHaveBeenCalled()
  })
})
