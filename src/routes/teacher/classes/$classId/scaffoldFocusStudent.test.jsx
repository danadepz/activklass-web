import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

let mockSearchParams = new URLSearchParams()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ classId: 'C1' }),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [mockSearchParams, vi.fn()],
}))

import ScaffoldTopicsPage from './scaffolds.jsx'

const topicA = {
  id: 't1', title: 'Cell Structure', moduleTitle: 'Cell Biology',
  mastery: 50, quizCount: 1, attemptCount: 2, studentsAffected: 1,
  affectedNames: ['Solano, Mika'], affectedIds: ['S1'],
}

const topicB = {
  id: 't2', title: 'Photosynthesis', moduleTitle: 'Plant Biology',
  mastery: 85, quizCount: 2, attemptCount: 4, studentsAffected: 0,
  affectedNames: [], affectedIds: [],
}

const base = {
  rows: [topicA, topicB],
  topics: [
    { id: 't1', title: 'Cell Structure', moduleTitle: 'Cell Biology' },
    { id: 't2', title: 'Photosynthesis', moduleTitle: 'Plant Biology' },
    { id: 't3', title: 'Genetics', moduleTitle: 'Heredity' },
  ],
  topicCount: 3,
  linkedQuizzes: 3,
  clazz: { subject: 'Science 9' },
  nameById: { S1: 'Solano, Mika', S2: 'Aquino, Beatriz' },
  rosterIds: ['S1', 'S2'],
  remediation: { plans: [], legacy: [] },
  attemptsByQuiz: {},
  quizzes: [],
}

function render(data, search = '') {
  scaffoldData.current = data
  mockSearchParams = new URLSearchParams(search)
  return renderToStaticMarkup(<MemoryRouter><ScaffoldTopicsPage /></MemoryRouter>)
}

beforeEach(() => {
  scaffoldData.current = null
  mockSearchParams = new URLSearchParams()
})

describe('Scaffold Topics — Student Focus Hand-off from Performance', () => {
  it('shows weak topic under Needs scaffolding when focused student is in affectedIds', () => {
    const html = render(base, 'student=S1')
    expect(html).toContain('Showing the 1 topic where')
    expect(html).toContain('Solano, Mika')
    expect(html).toContain('Cell Structure')
    expect(html).toContain('Needs scaffolding')
  })

  it('does NOT render an empty tab when student has no topic quiz failures', () => {
    // S2 has grade < 75 in class record, but is not in affectedIds for topicA or topicB
    const html = render(base, 'student=S2')
    expect(html).not.toBe('')
    // Should NOT cut off at early return
    expect(html).toContain('Aquino, Beatriz')
    expect(html).toContain('has a grade under 75% in the class record')
    expect(html).toContain('Showing all 2 topics')
    // Should render topics, not be empty
    expect(html).toContain('Cell Structure')
    expect(html).toContain('Photosynthesis')
  })

  it('does NOT render an empty tab when rows is empty but syllabus topics exist', () => {
    const noRowsData = {
      ...base,
      rows: [],
      linkedQuizzes: 0,
    }
    const html = render(noRowsData, 'student=S1')
    expect(html).toContain('Solano, Mika')
    expect(html).toContain('Syllabus topics')
    expect(html).toContain('Cell Structure')
    expect(html).toContain('Genetics')
    expect(html).toContain('Create remediation')
  })
})
