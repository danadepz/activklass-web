/**
 * The Quizzes list card counts what the quiz actually holds (T-37, andecobs-53).
 *
 * The card read two stored fields, `question_count` and `total_points`, that
 * nothing in this client ever writes: quizzes are Firestore-direct here, and
 * the only writer of `question_count` in the project is the Flask model, which
 * this path never touches. So every card fell through to `?? 0` and reported a
 * published five-question quiz as ITEMS 0 / POINTS 0 — permanently, for every
 * quiz made in the web app. It surfaced in the tester's screenshot of a
 * different report rather than as a complaint of its own.
 *
 * The list query already returns whole documents, so `questions` is on the
 * object the card renders. What is pinned here is the card counting them, and
 * still preferring a stored value when the backend did write one.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const state = { quizzes: [], classes: [] }

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', () => ({
  Link: ({ children }) => children,
  useNavigate: () => () => {},
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), getDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/hooks/useQuizzes', () => ({
  quizzesKey: () => ['fs-quizzes'],
  useQuizzes: () => ({ data: state.quizzes, isLoading: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: state.classes }) }))
vi.mock('@/hooks/useSyllabi', () => ({ useSyllabi: () => ({ data: [] }) }))
vi.mock('@/hooks/useMySubscription', () => ({ useMySubscription: () => ({ locks: {} }) }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))
vi.mock('@/lib/ai', () => ({ draftToQuestions: vi.fn(), generateQuiz: vi.fn(), QUIZ_TYPES: [] }))

import QuizzesIndexPage, { GenerateQuizModal } from './quizzes.jsx'

const q = (over) => ({
  id: 'q1', title: 'Chapter 5 Quiz', status: 'published', class_ids: [], ...over,
})

/** ITEMS and POINTS as the card renders them, read out of the first render. */
function counts(quiz) {
  state.quizzes = [quiz]
  const html = renderToStaticMarkup(<QuizzesIndexPage />)
  const grab = (label) => {
    const m = html.match(new RegExp(`>${label}</div><div[^>]*>([^<]*)</div>`))
    expect(m, `no ${label} cell rendered`).toBeTruthy()
    return m[1].trim()
  }
  return { items: grab('Items'), points: grab('Points') }
}

describe('Quizzes list card counts (T-37)', () => {
  it('counts the questions on the quiz, not a field nothing writes', () => {
    // The tester's quiz: five questions, seven points, card said 0 / 0.
    const questions = [
      { points: 2 }, { points: 1 }, { points: 1 }, { points: 2 }, { points: 1 },
    ]
    expect(counts(q({ questions }))).toEqual({ items: '5', points: '7' })
  })

  it('still shows zero for a quiz that genuinely has no questions', () => {
    expect(counts(q({ questions: [] }))).toEqual({ items: '0', points: '0' })
  })

  it('does not fall over on a quiz with no questions field at all', () => {
    expect(counts(q({}))).toEqual({ items: '0', points: '0' })
  })

  it('prefers a stored count when the backend actually wrote one', () => {
    // A quiz that came through Flask carries its own counts; those win.
    const stored = q({ questions: [{ points: 1 }], question_count: 9, total_points: 40 })
    expect(counts(stored)).toEqual({ items: '9', points: '40' })
  })

  it('treats a question with no points as zero rather than NaN', () => {
    expect(counts(q({ questions: [{ points: 3 }, {}] }))).toEqual({ items: '2', points: '3' })
  })
})

/**
 * The card names the class and its subject (T-36, andecobs-53).
 *
 * The second half of the same ticket that produced T-37, and visible in the
 * same screenshot: the chip read "Newton" while `subject` sat unused on the
 * class object beside `section`. He asked for both, "morag ma same same pud sa
 * atong LMS sa UC". The Assign modal in this very file already wrote them
 * together, so the wording was settled before the fix.
 *
 * The header half of the ticket is locked in `quizAssignmentLabel.test.js`.
 */

/** The assignment chips as the card renders them. */
function chips(quiz, classes) {
  state.quizzes = [quiz]
  state.classes = classes
  const html = renderToStaticMarkup(<QuizzesIndexPage />)
  return [...html.matchAll(/<span class="text-xs[^"]*rounded border[^"]*">([^<]*)<\/span>/g)]
    .map((m) => m[1].trim())
}

const klass = (id, section, subject) => ({ id, section, subject, teacher_id: 'T1' })

describe('Quizzes list card names the class (T-36)', () => {
  it('carries the section and the subject, not the section alone', () => {
    // His screenshot: a chip reading just "Newton".
    const got = chips(q({ class_ids: ['c1'] }), [klass('c1', 'Newton', 'Science 9')])
    expect(got).toContain('Newton · Science 9')
    expect(got).not.toContain('Newton')
  })

  it('uses the separator this product already uses, not a comma or brackets', () => {
    const got = chips(q({ class_ids: ['c1'] }), [klass('c1', 'Newton', 'Science 9')])
    expect(got.join(' ')).not.toMatch(/Newton,|Newton \(/)
  })

  it('keeps one chip per class when a quiz is assigned to several', () => {
    const got = chips(q({ class_ids: ['c1', 'c2'] }), [
      klass('c1', 'Newton', 'Science 9'),
      klass('c2', 'Curie', 'Physics 11'),
    ])
    expect(got).toEqual(expect.arrayContaining(['Newton · Science 9', 'Curie · Physics 11']))
  })

  it('shows the section alone when the class has no subject on it', () => {
    // Seeded and older classes can lack the field; "Newton · undefined" would
    // be worse than what he complained about.
    const got = chips(q({ class_ids: ['c1'] }), [klass('c1', 'Newton', undefined)])
    expect(got).toContain('Newton')
    expect(got.join(' ')).not.toMatch(/undefined/)
  })

  it('leaves "Not assigned" exactly as it was', () => {
    expect(chips(q({ class_ids: [] }), [])).toContain('Not assigned')
  })
})

/**
 * The Generate Quiz with AI dialog walks a first-time teacher through it, and
 * no longer names a model (T-59, andecobs-78).
 *
 * The sister of T-58 on the syllabus dialog. His screenshot was the dialog
 * as it opened -- class picked, Topic Description empty, 10 questions,
 * "Apply", Multiple choice -- and one paragraph of guidance that was both
 * wrong ("local Llama 3, with a math fallback": the backend had been on
 * another model for weeks) and a vendor name in text a teacher reads, which
 * CLAUDE.md forbids outright. Nothing said the topic list comes from the
 * picked class, that a syllabus topic fences the questions to its learning
 * objectives, what "Bloom's level" means, or that the draft opens in the
 * editor to be reviewed before it is published.
 *
 * Pinned: the guide block, open, with its four steps; the relabelled
 * thinking-level select and its hint; and no model or vendor named. The
 * modal is exported for this -- it opens on a click, which a static render
 * cannot do (the same reason register.jsx lifted WrongPathNudge).
 */
const openGenerate = (classes = [klass('c1', 'Curie', 'Special Science Program')]) =>
  renderToStaticMarkup(<GenerateQuizModal classes={classes} onClose={() => {}} />)

const guideOf = (html) => html.match(/<details[^>]*>[\s\S]*?<\/details>/)?.[0] ?? ''

describe('Generate Quiz with AI — the guide a first-time teacher opens on to (T-59)', () => {
  it('names no model or vendor anywhere in the dialog', () => {
    // The sentence he read said "local Llama 3". The backend is not on it,
    // and a teacher-facing string names no vendor either way.
    expect(openGenerate()).not.toMatch(/llama|gemini|openai|anthropic|claude|firebase|math fallback/i)
  })

  it('opens with a "How to get a good draft" block, unfolded', () => {
    const html = openGenerate()
    expect(html).toMatch(/<details open/)
    expect(guideOf(html)).toContain('<summary')
    expect(guideOf(html)).toContain('How to get a good draft')
  })

  it('walks the four steps in order: class, syllabus topic, count/level/types, then the editor', () => {
    const steps = [...guideOf(openGenerate()).matchAll(/<li>([\s\S]*?)<\/li>/g)]
      .map((m) => m[1].replace(/\s+/g, ' ').trim())
    expect(steps).toHaveLength(4)
    expect(steps[0]).toMatch(/^Pick the class first/)
    expect(steps[0]).toContain('syllabus topics fill the list')
    expect(steps[1]).toMatch(/^Pick a syllabus topic rather than typing one/)
    expect(steps[1]).toContain('learning objectives')
    expect(steps[1]).toContain('the editor flags any that stray')
    expect(steps[2]).toMatch(/how many questions.*thinking level.*question types/)
    expect(steps[2]).toContain('Essays are marked by you')
    expect(steps[3]).toMatch(/^Generate draft opens the quiz in the editor/)
    expect(steps[3]).toContain('then publish')
  })

  it('calls the select "Thinking level (Bloom\'s)" and says what the levels mean', () => {
    const html = openGenerate()
    expect(html).toContain('Thinking level (Bloom&#x27;s)')
    expect(html).not.toMatch(/>Bloom&#x27;s level</)
    expect(html).toContain('Remember recalls facts, Apply uses them, Create makes something new.')
  })

  /* The other two pieces of help were to stay as they were: the no-syllabus
     Tip when the class has no topics to offer. Both classes here have none
     (useSyllabi is stubbed empty), so the Tip must still show under the
     guide, not be replaced by it. */
  it('keeps the "build a syllabus first" tip for a class with no topics', () => {
    expect(openGenerate()).toContain('build a syllabus first')
  })
})
