/**
 * T-83 (andecobs-108, andecobs-113): the quiz links on Scaffold Topics used to
 * throw the teacher out to the public landing page.
 *
 * Derickk reported it twice as being logged out -- "Clicked 'Go to Quizzes'
 * button ... Issue: Logged out. Expected: Quizzes Screen" (#108) and "Clicking
 * 'open in quiz editor' will logout the user" (#113). The session was never
 * touched: both links pointed at /teacher/classes/<classId>/quizzes[/<quizId>],
 * which matches no route, so App.jsx's catch-all replaced the URL with "/" --
 * the landing page, whose header reads "Sign in".
 *
 * What is locked here is the tester's symptom, not the string that changed: a
 * link on this page must point at a URL the teacher's route table actually
 * serves. The route table below is read from App.jsx's <Route path=...> lines,
 * so a link this page renders that no route can match fails here the same way
 * it bounced him to the landing page.
 *
 * Static markup, the house pattern -- no DOM library. The editor that carries
 * "open in quiz editor" lives in the page's own fourth `useState(null)`
 * (`editingPlan`), which a static render can never click open, so that one call
 * is seeded; the assertion that the dialog rendered at all proves the seed
 * landed.
 */
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ editingPlan: null, nulls: 0 }))

/* Seed the FOURTH null-initialised useState of the render — ScaffoldTopicsPage
   calls useState(null) for busy, recoveringPlan, error, then editingPlan. */
vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useState: (init) => {
      if (init === null) {
        state.nulls += 1
        if (state.nulls === 4 && state.editingPlan) return real.useState(state.editingPlan)
      }
      return real.useState(init)
    },
  }
})

vi.mock('@/lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(), collection: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
  query: vi.fn(), serverTimestamp: vi.fn(), where: vi.fn(),
}))
vi.mock('@/lib/ai', () => ({ draftToQuestions: vi.fn(), generateQuiz: vi.fn() }))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn() }))
vi.mock('@/features/classes/remediation', () => ({
  REMEDIATION_PUBLISHED: 'published',
  createRemediationPlan: vi.fn(), deleteRemediationPlan: vi.fn(),
  loadClassRemediations: vi.fn(), publishRemediation: vi.fn(),
  unpublishRemediation: vi.fn(), updateRemediationPlan: vi.fn(),
}))
vi.mock('@/features/classes/gradeRecovery', () => ({
  applyRecoveryToAssessment: vi.fn(), loadRecoveryTargets: vi.fn(), previewRecovery: vi.fn(),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const scaffoldData = vi.hoisted(() => ({ current: null }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: () => ({ data: scaffoldData.current, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ classId: 'C1' }),
  useNavigate: () => vi.fn(),
}))

import ScaffoldTopicsPage from './scaffolds.jsx'

/* ---------------------------------------------------------------- routes -- */

/* Every teacher URL App.jsx can serve, as a matcher. Built from the file so a
   link this page renders is checked against the real route table, not a copy
   of it that could drift. The teacher block is everything from the /teacher
   layout route to the end of that <Route>, and paths nest under their parent. */
function teacherRoutes() {
  const src = readFileSync(new URL('../../../../App.jsx', import.meta.url), 'utf8')
  const lines = src.split('\n')
  const start = lines.findIndex((l) => l.includes('path="/teacher"'))
  expect(start).toBeGreaterThan(-1)
  const paths = []
  let nested = null // the classes/:classId child block
  for (const line of lines.slice(start + 1)) {
    if (line.includes('path="/superadmin"') || line.includes('path="/student"')) break
    const m = line.match(/<Route\s+path="([^"]+)"/)
    if (m) {
      const p = m[1]
      paths.push(nested ? `${nested}/${p}` : p)
      if (line.includes('element={ClassLayout}')) nested = p
    }
    if (nested && line.includes('</Route>')) nested = null
    if (line.match(/<Route\s+index/)) paths.push(nested ?? '')
  }
  expect(paths).toContain('quizzes')
  expect(paths).toContain('quizzes/:quizId')
  return paths.map((p) => new RegExp(`^/teacher${p ? `/${p}` : ''}/?$`.replace(/:[^/]+(?=\/|\$)/g, '[^/]+')))
}

const ROUTES = teacherRoutes()
const served = (href) => ROUTES.some((r) => r.test(href))

/* Every in-app href the rendered page offers, minus the layout's own navbar. */
function pageLinks(html) {
  const body = html.slice(html.indexOf('Scaffold Topics'))
  return [...body.matchAll(/<a[^>]+href="(\/[^"]*)"/g)].map((m) => m[1])
}

/* ------------------------------------------------------------------ data -- */

const weakTopic = {
  id: 't1', title: 'Atomic Structure', moduleTitle: 'Matter and Its Properties',
  mastery: 8, quizCount: 1, attemptCount: 2, studentsAffected: 1,
  affectedNames: ['Aquino, Beatriz'], affectedIds: ['S1'],
}

const base = {
  rows: [], topics: [], topicCount: 0, linkedQuizzes: 0,
  clazz: { subject: 'Science 9' }, nameById: { S1: 'Aquino, Beatriz' }, rosterIds: ['S1'],
  remediation: { plans: [], legacy: [] }, attemptsByQuiz: {}, quizzes: [],
}

const plan = {
  id: 'P1', class_id: 'C1', topic_id: 't1', topic: 'Atomic Structure',
  title: 'Remediation · Atomic Structure', guidance: '',
  recommended_quiz_id: 'Q9', target_student_ids: ['S1'], status: 'draft', assignments: [],
}

function render(data, editingPlan = null) {
  scaffoldData.current = data
  state.editingPlan = editingPlan
  state.nulls = 0
  return renderToStaticMarkup(<MemoryRouter><ScaffoldTopicsPage /></MemoryRouter>)
}

beforeEach(() => {
  scaffoldData.current = null
  state.editingPlan = null
  state.nulls = 0
})

/* ----------------------------------------------------------------- tests -- */

describe('T-83 — Scaffold Topics quiz links keep the teacher signed in', () => {
  it('#108: "Go to Quizzes" in the empty state opens a URL the teacher routes serve', () => {
    const html = render({ ...base, topicCount: 2, linkedQuizzes: 1 })
    // T-140 (triplecookiemonster-197): reworded to Kristine's wording.
    expect(html).toContain('No topic mastery yet.')

    const go = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>\s*Go to Quizzes\s*<\/a>/g)].map((m) => m[1])
    expect(go).toEqual(['/teacher/quizzes'])
    expect(served(go[0])).toBe(true)
  })

  it('#113: "open in quiz editor" on a plan\'s practice quiz opens a URL the teacher routes serve', () => {
    const html = render({ ...base, rows: [weakTopic], topics: [weakTopic], topicCount: 1, linkedQuizzes: 1 }, plan)
    expect(html).toContain('Edit remediation') // the seeded dialog really rendered

    const open = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>\s*open in quiz editor\s*<\/a>/g)].map((m) => m[1])
    expect(open).toEqual(['/teacher/quizzes/Q9'])
    expect(served(open[0])).toBe(true)
  })

  // T-140 (triplecookiemonster-196): the populated view's subheader paragraph
  // is gone, reworded into the shared ⓘ tooltip.
  it('T-140: carries the reworded explanation in the ⓘ tooltip, not a subheader paragraph', () => {
    const html = render({ ...base, rows: [weakTopic], topics: [weakTopic], topicCount: 1, linkedQuizzes: 1 })
    expect(html).not.toMatch(/<p[^>]*>\s*Per-topic mastery across the class/)
    expect(html).toContain('Per-topic mastery across the class, computed from quiz attempts on syllabus-linked')
    expect(html).toContain('quizzes. Weak topics get a one-click remediation quiz.')
    expect(html).toMatch(/role="tooltip"/)
  })

  it('offers no link at all that the catch-all would bounce to the landing page', () => {
    for (const html of [
      render({ ...base, topicCount: 2, linkedQuizzes: 1 }),
      render({ ...base, rows: [weakTopic], topics: [weakTopic], topicCount: 1, linkedQuizzes: 1 }, plan),
    ]) {
      for (const href of pageLinks(html)) expect([href, served(href)]).toEqual([href, true])
    }
  })
})
