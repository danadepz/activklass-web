import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// No DOM renderer is installed. Drive the real RecordGrid's input/save
// handlers, retaining hook state across explicit renders. Deferred batch
// promises reproduce edits between request creation and completion.
const h = vi.hoisted(() => ({
  state: [], effects: [], cursor: 0, effectCursor: 0, pendingEffects: [],
  navigate: vi.fn(), commit: vi.fn(), update: vi.fn(), confirm: vi.fn(),
  sync: vi.fn(), notify: vi.fn(), refetch: vi.fn(),
  bundle: null, buildRecord: vi.fn(), changeLock: vi.fn(),
}))
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal(),
  useState(initial) {
    const index = h.cursor++
    const state = h.state
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
    return [state[index], (next) => {
      state[index] = typeof next === 'function' ? next(state[index]) : next
    }]
  },
  useRef(initial) {
    const index = h.cursor++
    return h.state[index] ??= { current: initial }
  },
  useCallback(fn, deps) {
    const index = h.cursor++
    const previous = h.state[index]
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
      h.state[index] = { fn, deps }
    }
    return h.state[index].fn
  },
  useEffect(fn, deps) {
    const index = h.effectCursor++
    const previous = h.effects[index]
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
      h.pendingEffects.push(() => {
        previous?.cleanup?.()
        h.effects[index] = { deps, cleanup: fn() }
      })
    }
  },
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...await importOriginal(), useNavigate: () => h.navigate,
  useParams: () => ({ classId: 'test-class' }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: h.bundle, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: h.refetch }),
}))
vi.mock('@/hooks/useQuizzes', () => ({ useQuizzes: () => ({ data: [] }) }))
vi.mock('@/hooks/useQuizRecordSync', () => ({
  useAutoPostScores: () => ({ skipped: [], status: 'done' }),
  useSweepOrphanedQuizzes: () => ({ locked: [], status: 'done' }),
}))
vi.mock('@/lib/quizToRecord', () => ({ describeSweepResult: () => '', quizzesToAutoPost: () => [] }))
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'test-teacher' } }) }))
vi.mock('@/components/ui/useAsyncAction', () => ({ useAsyncAction: () => [vi.fn(), false] }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: h.confirm, promptDialog: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ notifyStudents: h.notify }))
vi.mock('@/lib/gradebook', () => ({
  syncEntries: h.sync, buildPeriodRecord: h.buildRecord, buildSummary: vi.fn(), loadBundle: vi.fn(),
}))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...await importOriginal(),
  doc: (...path) => path.slice(1).join('/'),
  writeBatch: () => ({ update: h.update, commit: h.commit }),
  getDoc: async () => ({ exists: () => true, data: () => ({}) }),
  updateDoc: h.changeLock,
}))

import ClassRecordPage, { RecordGrid } from './record'

let tree, record, winListeners, docListeners, pageMode, pageTree, parentHooks, gridKey
function nodes(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => nodes(child, predicate))
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)]
}
function render() {
  if (pageMode) return renderPage()
  h.cursor = 0
  h.effectCursor = 0
  tree = RecordGrid({ classId: 'test-class', record, refetch: h.refetch })
  h.pendingEffects.splice(0).forEach((effect) => effect())
}
// Preserve parent and child hook stores separately. A changed React key or
// Summary actually drops the child's state/listeners, matching reconciliation
// rather than merely checking that a confirmation helper returned true.
function renderPage() {
  const gridHooks = { state: h.state, effects: h.effects }
  h.state = parentHooks.state; h.effects = parentHooks.effects
  h.cursor = 0; h.effectCursor = 0
  pageTree = ClassRecordPage()
  h.pendingEffects.splice(0).forEach((effect) => effect())
  h.state = gridHooks.state; h.effects = gridHooks.effects
  const grid = nodes(pageTree, (n) => n.type === RecordGrid)[0]
  if (!grid || grid.key !== gridKey) {
    h.effects.forEach((effect) => effect?.cleanup?.())
    h.state = []; h.effects = []
    gridKey = grid?.key
  }
  h.cursor = 0; h.effectCursor = 0
  tree = grid ? RecordGrid(grid.props) : pageTree
  h.pendingEffects.splice(0).forEach((effect) => effect())
}
function startPage() {
  pageMode = true
  render()
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('')
  if (node == null || typeof node === 'boolean') return ''
  return typeof node === 'object' ? text(node.props?.children) : String(node)
}
async function transition(label) {
  const button = nodes(pageTree, (n) => n.type === 'button' && text(n).trim() === label)[0]
  expect(button).toBeDefined()
  await button.props.onClick()
  render()
}
const scores = () => nodes(tree, (n) => n.type === 'input' && !n.props.title)
const overrides = () => nodes(tree, (n) => n.type === 'input' && n.props.title?.startsWith('Type a grade'))
function edit(index, value, override = false) {
  const input = (override ? overrides() : scores())[index]
  expect(input.props.disabled).toBe(false)
  input.props.onChange({ target: { value } })
  render()
}
function save() {
  const button = nodes(tree, (n) => n.type === 'button' && n.props.onClick?.name === 'saveAll')[0]
  expect(button.props.disabled).toBe(false)
  const result = button.props.onClick()
  render()
  return result
}
function deferredSave() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  h.commit.mockReturnValueOnce(promise)
  return { resolve, reject }
}
function unload() {
  const event = { preventDefault: vi.fn(), returnValue: undefined }
  winListeners.get('beforeunload')?.(event)
  return event
}
function link(href = '/teacher/classes', extra = {}, anchorExtra = {}) {
  return {
    defaultPrevented: false, button: 0,
    target: { closest: () => ({
      target: '', hasAttribute: () => false, getAttribute: () => href, ...anchorExtra,
    }) },
    preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra,
  }
}
function click(event) { docListeners.get('click')?.(event) }

beforeEach(() => {
  h.state = []; h.effects = []; h.pendingEffects = []
  pageMode = false; pageTree = null; gridKey = null
  parentHooks = { state: [], effects: [] }
  vi.clearAllMocks()
  h.commit.mockResolvedValue(undefined)
  h.sync.mockResolvedValue(undefined)
  h.notify.mockResolvedValue(undefined)
  h.confirm.mockResolvedValue(false)
  winListeners = new Map(); docListeners = new Map()
  const target = (listeners) => ({
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name) },
  })
  vi.stubGlobal('window', { ...target(winListeners), location: { pathname: '/teacher/classes/test-class/record' } })
  vi.stubGlobal('document', target(docListeners))
  record = {
    period: { id: 'p', name: 'Term', locked: false }, mode: 'ched_percentage',
    policy: { grading_structure: 'lecture_only' },
    components: [{ id: 'c', name: 'Work', weight_percent: 100 }],
    assessments: ['a', 'b'].map((id) => ({ id, title: id, component_id: 'c', total_points: 5 })),
    students: [{ student_id: 's', first_name: 'Test', last_name: 'Student' }],
    grades: {}, scores: {},
  }
  h.bundle = {
    configured: true, mode: record.mode, assessments: [],
    periods: [record.period, { id: 'q', name: 'Next Term', locked: false }],
  }
  h.buildRecord.mockImplementation((bundle, periodId) => ({
    ...record, period: bundle.periods.find((p) => p.id === periodId),
  }))
  h.changeLock.mockImplementation(async (_path, data) => {
    h.bundle = { ...h.bundle, periods: data.periods }
  })
  render()
})
afterEach(() => {
  h.effects.forEach((effect) => effect?.cleanup?.())
  vi.unstubAllGlobals()
})

describe('T-238 manual save preserves edits made while pending', () => {
  it('A: same field 2 -> save -> 4 stays dirty and is included in the next save', async () => {
    edit(0, '2')
    const pending = deferredSave(), saving = save()
    edit(0, '4')
    pending.resolve(); await saving; render()
    expect(scores()[0].props.value).toBe('4')
    expect(unload().preventDefault).toHaveBeenCalledOnce()
    expect(h.update.mock.calls[0][1]['scores.s'].raw_score).toBe(2)
    await save(); render()
    expect(h.update.mock.calls[1][1]['scores.s'].raw_score).toBe(4)
    expect(unload().preventDefault).not.toHaveBeenCalled()
  })

  it('B: a new field in a different assessment survives the earlier save', async () => {
    edit(0, '2')
    const pending = deferredSave(), saving = save()
    edit(1, '5')
    pending.resolve(); await saving; render()
    expect(scores()[0].props.value).toBe('')
    expect(scores()[1].props.value).toBe('5')
    expect(unload().preventDefault).toHaveBeenCalledOnce()
    await save()
    expect(h.update.mock.calls[1][0]).toBe('gradebooks/test-class/assessments/b')
  })

  it('preserves a new student field within the same assessment', async () => {
    record.students.push({ student_id: 's2', first_name: 'Another', last_name: 'Student' }); render()
    edit(0, '2')
    const pending = deferredSave(), saving = save()
    edit(2, '5')
    pending.resolve(); await saving; render()
    expect(scores()[2].props.value).toBe('5')
    await save()
    expect(h.update.mock.calls[1][1]['scores.s2'].raw_score).toBe(5)
  })

  it('C/E: unchanged saved values clear and disarm both leave guards', async () => {
    expect(unload().preventDefault).not.toHaveBeenCalled()
    const cleanLink = link(); click(cleanLink)
    expect(cleanLink.preventDefault).not.toHaveBeenCalled()
    edit(0, '2')
    expect(unload().preventDefault).toHaveBeenCalledOnce()
    await save(); render()
    expect(scores()[0].props.value).toBe('') // empty persisted fixture: dirty overlay is gone
    expect(unload().preventDefault).not.toHaveBeenCalled()
    expect(docListeners.has('click')).toBe(false)
    expect(h.sync).toHaveBeenCalledWith('test-class')
  })

  it('D: failed saves retain values and the warning', async () => {
    edit(0, '2')
    const pending = deferredSave(), saving = save()
    edit(1, '5')
    pending.reject(new Error('Offline')); await saving; render()
    expect(scores().map((n) => n.props.value)).toEqual(['2', '5'])
    expect(unload().preventDefault).toHaveBeenCalledOnce()
    expect(h.refetch).not.toHaveBeenCalled()
    expect(h.sync).not.toHaveBeenCalled()
  })

  it('preserves newer overrides and new override fields while clearing saved ones', async () => {
    record.students.push({ student_id: 's2', first_name: 'Another', last_name: 'Student' }); render()
    edit(0, '70', true)
    const pending = deferredSave(), saving = save()
    edit(0, '80', true); edit(1, '90', true)
    pending.resolve(); await saving; render()
    expect(overrides().map((n) => n.props.value)).toEqual(['80', '90'])
    expect(h.update.mock.calls[0][1]['overrides.p.s']).toBe(70)
    await save(); render()
    expect(overrides().map((n) => n.props.value)).toEqual(['', ''])
    expect(unload().preventDefault).not.toHaveBeenCalled()
  })

  it.each(['', 'M', 'X'])('preserves the exact newer score string %j', async (newValue) => {
    edit(0, '2')
    const pending = deferredSave(), saving = save()
    edit(0, newValue)
    pending.resolve(); await saving; render()
    expect(scores()[0].props.value).toBe(newValue)
    expect(unload().preventDefault).toHaveBeenCalledOnce()
    await save(); render()
    expect(unload().preventDefault).not.toHaveBeenCalled()
  })

  it('still rejects scores above the maximum without clearing the edit', async () => {
    edit(0, '6'); await save(); render()
    expect(h.commit).not.toHaveBeenCalled()
    expect(scores()[0].props.value).toBe('6')
    expect(unload().preventDefault).toHaveBeenCalledOnce()
  })

  it('leaves locked scores and overrides disabled', () => {
    record.period.locked = true; render()
    expect([...scores(), ...overrides()].every((n) => n.props.disabled)).toBe(true)
  })
})

describe('T-238 unsaved in-app link protection', () => {
  it('keeps edits on cancellation and navigates only after explicit discard', async () => {
    edit(0, '2')
    const event = link(); click(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    await Promise.resolve()
    expect(h.navigate).not.toHaveBeenCalled()
    expect(scores()[0].props.value).toBe('2')
    h.confirm.mockResolvedValueOnce(true)
    click(link()); await Promise.resolve()
    expect(h.navigate).toHaveBeenCalledWith('/teacher/classes')
  })

  it('keeps the link warning armed after a newer edit survives a save', async () => {
    edit(0, '2')
    const pending = deferredSave(), saving = save()
    edit(0, '4'); pending.resolve(); await saving; render()
    const event = link(); click(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(h.confirm).toHaveBeenCalledOnce()
  })

  it('does not intercept new tabs, downloads, modified clicks or the current path', () => {
    edit(0, '2')
    for (const event of [link('/teacher/classes', { ctrlKey: true }),
      link('/teacher/classes', {}, { target: '_blank' }),
      link('/teacher/classes', {}, { hasAttribute: () => true }),
      link(window.location.pathname), link('//other.example'), link('https://other.example')]) {
      click(event)
      expect(event.preventDefault).not.toHaveBeenCalled()
    }
    expect(h.confirm).not.toHaveBeenCalled()
  })
})

describe('T-238 destructive same-page transitions', () => {
  it.each(['Summary', 'Next Term', 'Lock Period'])(
    '%s: cancel keeps the keyed grid and all scores/overrides; accept performs the transition',
    async (label) => {
      startPage()
      edit(0, '2'); edit(0, '70', true)
      const originalKey = gridKey
      await transition(label) // default confirmation answer is Cancel
      expect(gridKey).toBe(originalKey)
      expect(scores()[0].props.value).toBe('2')
      expect(overrides()[0].props.value).toBe('70')
      expect(h.changeLock).not.toHaveBeenCalled()
      expect(h.bundle.periods[0].locked).toBe(false)
      expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unsaved Class Record Changes' }))
      expect(unload().preventDefault).toHaveBeenCalledOnce()

      h.confirm.mockResolvedValue(true)
      await transition(label)
      if (label === 'Summary') {
        expect(nodes(pageTree, (n) => n.type === RecordGrid)).toHaveLength(0)
      } else if (label === 'Next Term') {
        expect(gridKey).toBe('test-class-q-false')
        expect(scores()[0].props.value).toBe('')
      } else {
        expect(h.changeLock).toHaveBeenCalledWith('gradebooks/test-class', expect.objectContaining({ periods: expect.any(Array) }))
        expect(h.bundle.periods[0].locked).toBe(true)
        expect(gridKey).toBe('test-class-p-true')
        expect(scores()[0].props.disabled).toBe(true)
      }
      expect(h.commit).not.toHaveBeenCalled() // discard never auto-saves
      expect(unload().preventDefault).not.toHaveBeenCalled()
    },
  )

  it.each(['Summary', 'Next Term'])('%s: clean transition needs no confirmation', async (label) => {
    startPage()
    await transition(label)
    expect(h.confirm).not.toHaveBeenCalled()
    expect(gridKey).toBe(label === 'Summary' ? undefined : 'test-class-q-false')
  })

  it('clean lock/unlock keeps only its existing lock confirmation, with no unsaved warning', async () => {
    startPage()
    h.confirm.mockResolvedValue(true)
    await transition('Lock Period')
    expect(h.bundle.periods[0].locked).toBe(true)
    expect(h.confirm).toHaveBeenCalledTimes(1)
    expect(h.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Lock this period?' }))
    await transition('Unlock Period')
    expect(h.bundle.periods[0].locked).toBe(false)
    expect(h.confirm).toHaveBeenCalledTimes(2)
    expect(h.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Unlock this period?' }))
  })

  it('clicking the already-active period does not prompt or remount', async () => {
    startPage(); edit(0, '2')
    const originalKey = gridKey
    await transition('Term')
    expect(h.confirm).not.toHaveBeenCalled()
    expect(gridKey).toBe(originalKey)
    expect(scores()[0].props.value).toBe('2')
  })

  it('saving the final dirty edit disarms the parent transition guard', async () => {
    startPage(); edit(0, '2')
    await save(); render()
    await transition('Next Term')
    expect(h.confirm).not.toHaveBeenCalled()
    expect(gridKey).toBe('test-class-q-false')
  })

  it('the parent guard stays armed for an edit surviving the older save', async () => {
    startPage(); edit(0, '2')
    const pending = deferredSave(), saving = save()
    edit(0, '4'); pending.resolve(); await saving; render()
    const originalKey = gridKey
    await transition('Next Term')
    expect(gridKey).toBe(originalKey)
    expect(scores()[0].props.value).toBe('4')
    expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unsaved Class Record Changes' }))
  })
})
