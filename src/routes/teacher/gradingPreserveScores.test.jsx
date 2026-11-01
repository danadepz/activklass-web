import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ mutations: [] }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }) => ({ data: queryKey[0] === 'fs-grading-preset' ? { periods: [{ id: 'p', name: 'P', weight_percent: 100 }], components: [{ id: 'c', name: 'C', weight_percent: 100 }] } : undefined }),
  useMutation: (options) => { state.mutations.push(options); return { mutate: vi.fn() } },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', () => ({ useParams: () => ({ classId: 'class' }) }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'teacher' } }) }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [{ id: 'class', section: 'QA', subject: 'QA' }] }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), collection: vi.fn(), getDocs: vi.fn(), serverTimestamp: vi.fn(), writeBatch: vi.fn() }))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: vi.fn(async () => ({})) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
import { getDocs } from 'firebase/firestore'
import { api } from '@/lib/api'
import Page from './grading.jsx'
beforeEach(() => { state.mutations = []; vi.clearAllMocks() })
describe('T-227: Save & Sync checks existing assessments before writing', () => {
  it('refuses an orphaning setup without calling the API', async () => {
    getDocs.mockResolvedValue({ docs: [{ data: () => ({ title: 'Existing quiz', component_id: 'old-component', period_id: 'p' }) }] })
    renderToStaticMarkup(<Page />)
    await expect(state.mutations[0].mutationFn()).rejects.toThrow('Existing quiz')
    expect(api).not.toHaveBeenCalled()
  })
  it('allows an ordinary weights-only save with matching ids', async () => {
    getDocs.mockResolvedValue({ docs: [{ data: () => ({ component_id: 'c', period_id: 'p' }) }] })
    renderToStaticMarkup(<Page />)
    await state.mutations[0].mutationFn()
    expect(api).toHaveBeenCalledWith('/api/grading-setup', expect.objectContaining({ method: 'POST' }))
  })
})
