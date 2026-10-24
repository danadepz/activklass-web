/**
 * T-193 (andecobs-298, Derickk): two things on the announcement composer --
 * the confirm dialog's primary button, "Post announcement", wrapped onto two
 * lines, and once a title and message were typed there was no way to empty
 * the form again. The dialog's own Cancel just closes the dialog and leaves
 * the text.
 *
 * Fix: the confirm dialog's label is now "Post" -- the dialog is already
 * titled "Post this announcement?", so it reads unambiguously beside
 * "Cancel". A new Clear control, shown only once something has been typed
 * or chosen away from the blank defaults, resets every field (title,
 * message, category, target class, expiry, linked resource) in one call --
 * no confirmation, since an unposted draft is not data (same shape as
 * T-188's "Clear File" on the bulk-upload screen).
 *
 * Static markup, the house pattern for this page (no DOM library in this
 * project) -- `bulkUploadClear.test.jsx` is the model: capture a handler
 * prop as React builds the tree, then call it directly, rather than driving
 * a real click. `AnnouncementsPage`'s own `useState` calls are intercepted
 * in the order the component makes them -- filterCat, form, formErr,
 * deletingId -- so a draft can be seeded without a real keystroke, and the
 * Clear button's and the form's own handlers can be invoked directly.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const captured = { clearOnClick: null, submitHandler: null }
const grab = (type, props) => {
  if (type === 'button' && props?.id === 'ann-clear') captured.clearOnClick = props.onClick
  if (type === 'form' && props?.onSubmit) captured.submitHandler = props.onSubmit
}
vi.mock('react/jsx-runtime', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    jsx: (type, props, ...rest) => { grab(type, props); return real.jsx(type, props, ...rest) },
    jsxs: (type, props, ...rest) => { grab(type, props); return real.jsxs(type, props, ...rest) },
  }
})
vi.mock('react/jsx-dev-runtime', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    jsxDEV: (type, props, ...rest) => { grab(type, props); return real.jsxDEV(type, props, ...rest) },
  }
})

// AnnouncementsPage's own useState calls, in the order it makes them:
// (1) filterCat (2) form (3) formErr (4) deletingId. Slot 2 can be seeded
// with a draft so the Clear control renders without a real keystroke, and
// every setter is wrapped so a call on it is recorded.
const seed = { form: null }
let order = 0
let setterCalls = []
vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useState: (init) => {
      order += 1
      const slot = order
      const initial = slot === 2 && seed.form ? seed.form : init
      const [value, setValue] = real.useState(initial)
      const wrapped = (...args) => {
        setterCalls.push([slot, args[0]])
        return setValue(...args)
      }
      return [value, wrapped]
    },
  }
})

const { confirmDialogMock } = vi.hoisted(() => ({ confirmDialogMock: vi.fn(async () => true) }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), getDocs: vi.fn(), query: vi.fn(), serverTimestamp: vi.fn(), where: vi.fn(), writeBatch: vi.fn(),
}))
vi.mock('@/lib/notifications', () => ({ notifyStudents: vi.fn() }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/hooks/useTeacherClasses', () => ({
  useTeacherClasses: () => ({ data: [{ id: 'c1', student_ids: ['s1', 's2'] }] }),
}))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: confirmDialogMock }))
vi.mock('@/components/ui/Skeleton', () => ({ SkeletonList: () => null }))

import AnnouncementsPage from './announcements.jsx'

const DRAFT = {
  title: 'Quiz moved',
  content: 'See you Friday instead.',
  category: 'urgent',
  class_id: 'c1',
  expires_at: '2026-12-01',
  linked_resource_type: 'quiz',
  linked_resource_id: 'q1',
}
const BLANK_FORM = {
  title: '', content: '', category: 'general', class_id: '',
  expires_at: '', linked_resource_type: '', linked_resource_id: '',
}

function render(formSeed) {
  seed.form = formSeed
  order = 0
  setterCalls = []
  captured.clearOnClick = null
  captured.submitHandler = null
  confirmDialogMock.mockClear()
  return renderToStaticMarkup(<AnnouncementsPage />)
}

beforeEach(() => {
  seed.form = null
  order = 0
  setterCalls = []
  captured.clearOnClick = null
  captured.submitHandler = null
  confirmDialogMock.mockClear()
})

describe('T-193 — the announcement composer can be cleared', () => {
  it('offers no Clear control on the blank composer', () => {
    const html = render()
    expect(html).not.toContain('>Clear<')
    expect(captured.clearOnClick).toBeNull()
  })

  it('renders Clear once a draft exists', () => {
    const html = render(DRAFT)
    expect(html).toContain('>Clear<')
    expect(captured.clearOnClick).toBeTruthy()
  })

  it('clicking Clear resets every field — what the tester reported', () => {
    render(DRAFT)
    expect(captured.clearOnClick, 'the Clear button\'s onClick was not captured').toBeTruthy()

    captured.clearOnClick()

    // setForm(EMPTY_FORM), setFormErr('') — the two calls handleClear makes.
    expect(setterCalls).toContainEqual([2, BLANK_FORM])
    expect(setterCalls).toContainEqual([3, ''])
  })
})

describe('T-193 — the confirm dialog label fits one line', () => {
  it('asks to "Post", not "Post announcement", beside Cancel', async () => {
    render(DRAFT)
    expect(captured.submitHandler, 'the form\'s onSubmit was not captured').toBeTruthy()

    await captured.submitHandler({ preventDefault: () => {} })

    expect(confirmDialogMock).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: 'Post' }))
    expect(confirmDialogMock).not.toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: 'Post announcement' }))
  })
})
