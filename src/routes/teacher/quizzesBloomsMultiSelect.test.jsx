/**
 * Feature 2: the Generate Quiz dialog's Bloom's "Thinking level" is a
 * checkbox list, not a single <select>. Nothing stores the pick -- it reaches
 * the AI only through generateQuiz's existing `hints.bloomsLevel` text, so
 * this pins (a) all six levels render as checkboxes with the right ones
 * ticked, (b) the selection summary, and (c) the exact text the generator
 * receives for one level, several levels, and none.
 *
 * Same harness as quizzesGenerateContext.test.jsx: no jsdom, so the form's
 * onSubmit is captured from the JSX runtime and the dialog's `form` state
 * (its 2nd useState call) is seeded directly.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { automaticBloomAllocation, BLOOMS_ORDER } from '@/lib/bloomsAllocation'

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

import { GenerateQuizModal, BLOOMS_LEVELS, bloomsHint } from './quizzes.jsx'

const klass = { id: 'c1', section: 'Curie', subject: 'Science' }
const baseForm = { topic_id: '', topic: 'Cell structure', count: 10, types: ['mcq', 'short_answer', 'essay'], save_to_bank: false, extra_context: '', allocation_mode: 'automatic' }

function render(blooms_levels) {
  captured.onSubmit = null
  stateCallCount = 0
  const selected = blooms_levels ?? []
  seedForm = blooms_levels === undefined ? null : {
    ...baseForm,
    blooms_levels: selected,
    bloom_allocation: selected.length && selected.length <= 10
      ? automaticBloomAllocation(10, selected)
      : Object.fromEntries(BLOOMS_ORDER.map((level) => [level, 0])),
  }
  return renderToStaticMarkup(<GenerateQuizModal classes={[klass]} onClose={() => {}} initialClassId="c1" />)
}

async function sentHint(blooms_levels) {
  generateQuiz.mockClear()
  render(blooms_levels)
  await captured.onSubmit({ preventDefault: () => {} })
  expect(generateQuiz).toHaveBeenCalledTimes(1)
  return generateQuiz.mock.calls[0][0].hints.bloomsLevel
}

const checkboxes = (html) => html.match(/<input type="checkbox"[^>]*>/g) ?? []

describe("Bloom's levels list", () => {
  it('has all six levels, in order, numbered 1 to 6', () => {
    expect(BLOOMS_LEVELS.map((b) => `Level ${b.level} – ${b.label}`)).toEqual([
      'Level 1 – Remembering', 'Level 2 – Understanding', 'Level 3 – Applying',
      'Level 4 – Analyzing', 'Level 5 – Evaluating', 'Level 6 – Creating',
    ])
  })

  it('bloomsHint joins picks in level order regardless of click order, and is empty for none', () => {
    expect(bloomsHint(['create', 'remember', 'apply'])).toBe('Level 1 – Remembering, Level 3 – Applying, Level 6 – Creating')
    expect(bloomsHint([])).toBe('')
    expect(bloomsHint(['not-a-level'])).toBe('')
  })
})

describe("Generate Quiz dialog -- Bloom's checklist (Feature 2)", () => {
  it('opens with all Balanced levels selected and no assessment profile selector', () => {
    const html = render(undefined)
    expect(html).toContain('<legend')
    expect(html).toContain('Thinking level (Bloom&#x27;s)')
    for (const b of BLOOMS_LEVELS) expect(html).toContain(`${b.label}</span>`)
    expect(html).toContain('6 levels selected: Remembering, Understanding, Applying, Analyzing, Evaluating, Creating')
    expect(html).not.toContain('Assessment preset')
    expect(html).not.toMatch(/<select[^>]*capitalize/) // the old single select is gone
  })

  it('ticks exactly the selected levels and summarises them', () => {
    const html = render(['remember', 'analyze', 'create'])
    expect(html).toContain('3 levels selected: Remembering, Analyzing, Creating')
    // save_to_bank is false in the seed, so the only ticked boxes are Bloom's.
    expect(checkboxes(html).filter((c) => c.includes('checked'))).toHaveLength(3)
  })

  it('shows allocation validation when nothing is selected', () => {
    expect(render([])).toContain('Select at least one Bloom level.')
  })

  it('keeps the help line the earlier copy tests pin', () => {
    expect(render(undefined)).toContain('Remembering recalls facts, Applying uses them, Creating makes something new.')
  })
})

describe("Generate Quiz dialog -- what reaches the generator", () => {
  it('one level: the same single-level hint as before, now labelled', async () => {
    expect(await sentHint(['apply'])).toBe('Level 3 – Applying')
  })

  it('several levels: one comma-separated line through the existing hint', async () => {
    expect(await sentHint(['evaluate', 'understand'])).toBe('Level 2 – Understanding, Level 5 – Evaluating')
  })

  it('sends the allocation alongside the legacy human readable hint', async () => {
    await sentHint(['apply'])
    expect(generateQuiz.mock.calls[0][0].bloomAllocation).toEqual({ remember: 0, understand: 0, apply: 10, analyze: 0, evaluate: 0, create: 0 })
    expect(generateQuiz.mock.calls[0][0].bloomsLevels).toEqual(['apply'])
  })
})
