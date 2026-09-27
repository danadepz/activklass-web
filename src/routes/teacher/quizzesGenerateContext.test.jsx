/**
 * Generate Quiz with AI gets a place to type the extra context the generator
 * already accepts (T-96, andecobs-122). `lib/ai.js`'s `generateQuiz` already
 * forwards a free-text `instructions` argument into `buildQuizNotes`; nothing
 * in this dialog ever collected one. This pins that a typed line reaches
 * `generateQuiz`'s own `instructions` argument, and that leaving the field
 * blank sends nothing extra -- the same generation as before the field
 * existed.
 *
 * No jsdom in this project -- the house pattern (`quizzes.test.jsx` and its
 * siblings) is `renderToStaticMarkup`, which strips event handlers from its
 * output entirely, so a static render alone cannot drive a submit. This
 * mocks `react/jsx-runtime` just enough to capture the dialog's own
 * `<form>`'s `onSubmit` prop as React builds the tree, then calls it
 * directly with a fake event -- alongside the "seed one specific hook call"
 * trick `scaffoldQuizLinks.test.jsx` already uses to reach state a static
 * render cannot otherwise put the component into.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const captured = { onSubmit: null }
const grab = (type, props) => {
  if (type === 'form' && props?.onSubmit) captured.onSubmit = props.onSubmit
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

// GenerateQuizModal's own useState calls, in the order it makes them:
// (1) selectedClassId (2) form (3) error (4) generating. Only the second is
// ever seeded here.
let seedForm = null
let stateCallCount = 0
vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useState: (init) => {
      stateCallCount += 1
      if (stateCallCount === 2 && seedForm) return real.useState(seedForm)
      return real.useState(init)
    },
  }
})

const generateQuiz = vi.fn(async () => ({ title: 'Draft', questions: [] }))
vi.mock('@/lib/ai', () => ({
  draftToQuestions: vi.fn(() => []),
  generateQuiz: (...args) => generateQuiz(...args),
  QUIZ_TYPES: [],
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', () => ({
  Link: ({ children }) => children,
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), getDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(async () => {}), deleteDoc: vi.fn(),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/hooks/useQuizzes', () => ({
  quizzesKey: () => ['fs-quizzes'],
  useQuizzes: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [] }) }))
vi.mock('@/hooks/useSyllabi', () => ({ useSyllabi: () => ({ data: [] }) }))
vi.mock('@/hooks/useMySubscription', () => ({ useMySubscription: () => ({ locks: {} }) }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))

import { GenerateQuizModal } from './quizzes.jsx'

const klass = { id: 'c1', section: 'Curie', subject: 'Science' }

async function submitWith(extra_context) {
  captured.onSubmit = null
  stateCallCount = 0
  seedForm = {
    topic_id: '', topic: 'Cell structure', count: 10, blooms_level: 'apply',
    types: ['mcq'], save_to_bank: false, extra_context,
  }
  renderToStaticMarkup(<GenerateQuizModal classes={[klass]} onClose={() => {}} initialClassId="c1" />)
  expect(captured.onSubmit, 'the dialog\'s <form onSubmit> was not captured').toBeTruthy()
  await captured.onSubmit({ preventDefault: () => {} })
}

describe('Generate Quiz with AI -- extra context reaches the generator (T-96)', () => {
  it('sends what the teacher typed as the instructions generateQuiz already accepts', async () => {
    generateQuiz.mockClear()
    await submitWith('Focus on plant cells, skip mitosis.')
    expect(generateQuiz).toHaveBeenCalledTimes(1)
    expect(generateQuiz.mock.calls[0][0].instructions).toBe('Focus on plant cells, skip mitosis.')
  })

  it('sends nothing extra when the field is left blank -- generates exactly as before', async () => {
    generateQuiz.mockClear()
    await submitWith('')
    expect(generateQuiz).toHaveBeenCalledTimes(1)
    expect(generateQuiz.mock.calls[0][0].instructions || '').toBe('')
  })
})
