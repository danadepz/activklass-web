/**
 * T-96 verification lock (andecobs-122, Derick) -- the Generate Quiz with AI
 * dialog must have a place to TYPE extra context, and what is typed must
 * reach `generateQuiz`.
 *
 * `quizzesGenerateContext.test.jsx` (written with the fix) pins the second
 * half: it seeds the dialog's form state and proves the submit handler
 * forwards it. It cannot see the first half -- seeding state bypasses the
 * input entirely, so deleting the textarea from the dialog leaves that file
 * green while the tester's symptom is back. This file pins both halves at
 * once, on the one state key, so neither can be removed alone:
 *
 *   1. the dialog renders a multi-line field whose value is the form state
 *      the submit handler reads (typed text shows up in the markup);
 *   2. that same value arrives as `generateQuiz`'s `instructions` argument;
 *   3. it does NOT leak into the quiz document's own student-facing
 *      `instructions` field -- the card's explicit "do not wire these two
 *      together" warning.
 *
 * No jsdom in this repo, so the house pattern is `renderToStaticMarkup` plus
 * `vi.mock`. Static markup keeps a controlled field's value (as the
 * textarea's children) but drops event handlers, so the submit is reached by
 * capturing the dialog's own <form onSubmit> as React builds the tree, the
 * same trick `quizzesGenerateContext.test.jsx` uses.
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

// GenerateQuizModal's own useState calls in order: (1) selectedClassId
// (2) form (3) error (4) generating. Only the second is ever seeded.
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
const setDoc = vi.fn(async () => {})
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
  doc: vi.fn(), getDoc: vi.fn(), serverTimestamp: vi.fn(),
  setDoc: (...args) => setDoc(...args), deleteDoc: vi.fn(),
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
const TYPED = 'Keep every question about DNA base pairing.'

// Render the dialog with the generate form seeded, and hand back both what the
// teacher would SEE and the submit the "Generate draft" button would run.
function openDialogWith(extraContext) {
  captured.onSubmit = null
  stateCallCount = 0
  seedForm = {
    topic_id: '', topic: 'Cell structure', count: 10, blooms_level: 'apply',
    types: ['mcq'], save_to_bank: false, extra_context: extraContext,
  }
  const html = renderToStaticMarkup(
    <GenerateQuizModal classes={[klass]} onClose={() => {}} initialClassId="c1" />,
  )
  expect(captured.onSubmit, "the dialog's <form onSubmit> was not captured").toBeTruthy()
  return { html, submit: captured.onSubmit }
}

describe('Generate Quiz with AI -- the extra-context field a teacher can type in (T-96)', () => {
  it('renders a multi-line field holding what was typed, labelled as draft-only context', () => {
    const { html } = openDialogWith(TYPED)

    // The field is there and is multi-line -- a place to type, which is the
    // whole of what the tester asked for.
    const textareas = html.match(/<textarea[\s\S]*?<\/textarea>/g) ?? []
    expect(textareas, 'the dialog has no <textarea> to type extra context into').toHaveLength(1)

    // ...and it shows the form state the submit handler reads, so the input
    // and the payload are provably the same field rather than two that merely
    // look alike.
    expect(textareas[0]).toContain(TYPED)

    // It reads as context for the draft, not as instructions to students.
    expect(html).toMatch(/Extra context for the AI/)
    expect(html).toMatch(/not shown to students/)
  })

  it('sends what was typed to generateQuiz as its instructions argument', async () => {
    generateQuiz.mockClear()
    const { submit } = openDialogWith(TYPED)
    await submit({ preventDefault: () => {} })

    expect(generateQuiz).toHaveBeenCalledTimes(1)
    expect(generateQuiz.mock.calls[0][0].instructions).toBe(TYPED)
  })

  it('leaves it out entirely when the field is blank -- the generation of before', async () => {
    generateQuiz.mockClear()
    const { html, submit } = openDialogWith('')
    expect(html).toMatch(/<textarea/)
    await submit({ preventDefault: () => {} })

    expect(generateQuiz).toHaveBeenCalledTimes(1)
    expect(generateQuiz.mock.calls[0][0].instructions || '').toBe('')
  })

  it("never becomes the quiz's own student-facing instructions", async () => {
    setDoc.mockClear()
    const { submit } = openDialogWith(TYPED)
    await submit({ preventDefault: () => {} })

    expect(setDoc).toHaveBeenCalled()
    const saved = setDoc.mock.calls[0][1]
    expect(saved.instructions).toBe('')
    expect(JSON.stringify(saved)).not.toContain(TYPED)
  })
})
