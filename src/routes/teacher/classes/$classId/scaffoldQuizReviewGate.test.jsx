/**
 * T-248 (andecobs-331): "a teacher may publish an AI quiz without checking it".
 *
 * The AI practice quiz is written as a draft and only the quiz editor publishes
 * quizzes, but the remediation PLAN could still be published pointing at that
 * unopened draft. These lock the gate where the teacher meets it: the Publish
 * buttons themselves, in the plan list and in the editor. Mocks and the
 * editingPlan seed are the scaffoldQuizLinks.test.jsx pattern.
 */
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


/* ------------------------------------------------------------------ data -- */

const weakTopic = {
  id: 't1', title: 'Atomic Structure', moduleTitle: 'Matter and Its Properties',
  mastery: 8, quizCount: 1, attemptCount: 2, studentsAffected: 1,
  affectedNames: ['Aquino, Beatriz'], affectedIds: ['S1'],
}
const plan = {
  id: 'P1', class_id: 'C1', topic_id: 't1', topic: 'Atomic Structure',
  title: 'Remediation · Atomic Structure', guidance: '',
  recommended_quiz_id: 'Q9', target_student_ids: ['S1'], status: 'draft', assignments: [],
}
const data = (quizStatus, plans = []) => ({
  rows: [weakTopic], topics: [weakTopic], topicCount: 1, linkedQuizzes: 1,
  clazz: { subject: 'Science 9' }, nameById: { S1: 'Aquino, Beatriz' }, rosterIds: ['S1'],
  remediation: { plans, legacy: [] }, attemptsByQuiz: {},
  quizzes: quizStatus ? [{ id: 'Q9', topic_id: 't1', status: quizStatus, generated_by: 'ai_generated', questions: [] }] : [],
})

function render(d, editingPlan = null) {
  scaffoldData.current = d
  state.editingPlan = editingPlan
  state.nulls = 0
  return renderToStaticMarkup(<MemoryRouter><ScaffoldTopicsPage /></MemoryRouter>)
}

/* The <button ...>label</button> whose text is exactly `label`, opening tag only. */
function buttonTag(html, label) {
  const tags = [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].filter((m) => m[2].trim() === label)
  expect(tags.length, `one "${label}" button`).toBe(1)
  return tags[0][1]
}
const isDisabled = (tag) => /\sdisabled=""/.test(tag)

beforeEach(() => {
  scaffoldData.current = null
  state.editingPlan = null
  state.nulls = 0
})

describe('T-248 — a remediation plan cannot go out until its AI quiz has been reviewed', () => {
  it('the editor refuses "Save & publish" while the attached AI quiz is an unopened draft, and says why', () => {
    const html = render(data('draft'), plan)
    expect(html).toContain('Edit Remediation')
    expect(isDisabled(buttonTag(html, 'Save &amp; publish'))).toBe(true)
    expect(html).toContain('Review the practice quiz first')
    expect(isDisabled(buttonTag(html, 'Save draft'))).toBe(false)
  })

  it('the plan list refuses "Publish" on the same plan', () => {
    const html = render(data('draft', [plan]))
    expect(isDisabled(buttonTag(html, 'Publish'))).toBe(true)
  })

  it('once the teacher has published the quiz from the editor, both Publish buttons open up', () => {
    const edit = render(data('published'), plan)
    expect(isDisabled(buttonTag(edit, 'Save &amp; publish'))).toBe(false)
    expect(edit).not.toContain('Review the practice quiz first')
    expect(isDisabled(buttonTag(render(data('published', [plan])), 'Publish'))).toBe(false)
  })

  it('a plan with no practice quiz (guidance only) is not held back', () => {
    const noQuiz = { ...plan, recommended_quiz_id: null }
    expect(isDisabled(buttonTag(render(data(null), noQuiz), 'Save &amp; publish'))).toBe(false)
  })
})
