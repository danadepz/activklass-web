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

import QuizzesIndexPage from './quizzes.jsx'

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
