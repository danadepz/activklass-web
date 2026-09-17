/**
 * T-70 (dawny808-89), the student half: a teacher's per-class Disable leaves
 * the class on the student's list and readable, but nothing in it can be
 * started -- "the student cannot interact with the activities there
 * (view-only)", in the owner's words.
 *
 * Static markup, the house pattern: the page reads everything through one
 * useQuery, stubbed here with the same class twice -- once active, once
 * dropped -- so every difference between the two renders is the fix.
 * The teacher half (a greyed row reading Enable) is in rosterView.test.jsx.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const view = vi.hoisted(() => ({ data: null }))

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'S1', role: 'student', first_name: 'Carlo', last_name: 'Mendoza' } }),
}))
vi.mock('@/lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: () => ({ data: view.data, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ classId: 'C1' }),
}))

import StudentClassDetail from './index.jsx'

const quiz = {
  id: 'Q1', class_id: 'C1', title: 'Quiz 1 - The Scientific Method', status: 'published',
  attempts_allowed: 2, assigned_to: 'all', questions: [{ id: 'a', points: 1 }],
}
function page(dropped) {
  view.data = {
    clazz: { id: 'C1', subject: 'Science 9', section: 'Newton', student_ids: ['S1'], dropped_student_ids: dropped ? ['S1'] : [] },
    teacher: null, entry: null, attendance: [], contestsByDate: {}, gradeContestsByAssessment: {},
    syllabus: null, announcements: [], quizzes: [quiz], attemptsByQuiz: {}, scaffoldedTopicIds: new Set(),
    tasks: [], submissionByTask: {}, dropped,
  }
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={['/student/classes/C1?tab=quizzes']}><StudentClassDetail /></MemoryRouter>,
  )
  return { html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }
}

const BANNER = 'You are no longer active in this class. You can still see your grades and materials, but you cannot take quizzes or hand in work.'
const startLinks = (html) => [...html.matchAll(/<a[^>]*href="([^"]*\/quizzes\/Q1)"[^>]*>(.*?)<\/a>/gs)].map((m) => m[2].replace(/<[^>]+>/g, '').trim())

describe('T-70 — a class the student is dropped from is view-only', () => {
  it('an active student sees no banner and can start the quiz (the control this test watches is real)', () => {
    const { html, text } = page(false)
    expect(text).not.toContain('You are no longer active in this class')
    expect(startLinks(html).length).toBeGreaterThan(0)
  })

  it('a dropped student sees the banner, still sees the class and the quiz, and has no way to start it', () => {
    const { html, text } = page(true)
    expect(text).toContain(BANNER)
    expect(text).toContain('Science 9')
    expect(text).toContain('Quiz 1 - The Scientific Method')
    expect(startLinks(html)).toEqual([])
  })
})
