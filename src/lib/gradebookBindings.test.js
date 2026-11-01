import { describe, expect, it, vi } from 'vitest'
import { getDocs } from 'firebase/firestore'
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(), serverTimestamp: vi.fn(), writeBatch: vi.fn() }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn() }))
import { assertAssessmentBindings } from './gradebook'
describe('T-227: configuration changes preserve assessment bindings', () => {
  const periods = [{ id: 'p' }], components = [{ id: 'c' }]
  function scores() { getDocs.mockResolvedValue({ docs: [{ data: () => ({ title: 'Recorded quiz', period_id: 'p', component_id: 'c', scores: { student: { raw_score: 4 } } }) }] }) }
  it('allows a weights-only change with stable identifiers', async () => {
    scores()
    await expect(assertAssessmentBindings('class', periods, [{ id: 'c', weight_percent: 60 }])).resolves.toBeUndefined()
  })
  it.each(['component', 'period'])('refuses a replacement %s before scores become invisible', async (kind) => {
    scores()
    await expect(assertAssessmentBindings('class', kind === 'period' ? [{ id: 'new' }] : periods, kind === 'component' ? [{ id: 'new' }] : components)).rejects.toThrow('Recorded quiz')
  })
  it('fails closed when existing assessments cannot be checked', async () => {
    getDocs.mockRejectedValue(new Error('Unavailable'))
    await expect(assertAssessmentBindings('class', periods, components)).rejects.toThrow('Unavailable')
  })
})
